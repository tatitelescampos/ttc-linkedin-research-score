import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { vacancies, vacancyAnalyses, vacancyAnalysisRequirements, vacancyAnalysisRuns, vacancyVersions } from '../database/schema'
import { db as defaultDb } from './db'
import { getVacancy, VacancyValidationError } from './vacancies'

type Database = typeof defaultDb

type RequirementDraft = {
  category: string
  label: string
  normalizedLabel: string
  provenance: string
  weight: number
  isMandatory: boolean
  isEliminatory: boolean
}

type UpdateRequirementInput = Partial<Record<'id' | 'category' | 'label' | 'normalizedLabel' | 'provenance' | 'weight' | 'isMandatory' | 'isEliminatory', unknown>>

type UpdateAnalysisInput = {
  seniority?: unknown
  titles?: unknown
  locations?: unknown
  ambiguities?: unknown
  requirements?: unknown
}

type AnalysisDraft = {
  seniority: string | null
  titles: string[]
  locations: string[]
  ambiguities: string[]
  requirements: RequirementDraft[]
}

export type VacancyAnalysisSource = 'mock' | 'openrouter'
export type VacancyAnalysisRunStatus = 'success' | 'error'

export type VacancyAnalysisRunDetail = {
  id: number
  source: VacancyAnalysisSource
  status: VacancyAnalysisRunStatus
  model: string | null
  costUsd: string | null
  errorMessage: string | null
  createdAt: string
}

export type VacancyAnalysisRequirement = RequirementDraft & {
  id: number
  sortOrder: number
  createdAt: string
}

export type VacancyAnalysisDetail = {
  id: number
  vacancyId: number
  vacancyVersionId: number
  status: 'draft' | 'approved'
  seniority: string | null
  titles: string[]
  locations: string[]
  ambiguities: string[]
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  source: VacancyAnalysisSource
  latestRun: VacancyAnalysisRunDetail | null
  requirements: VacancyAnalysisRequirement[]
  canMoveForward: boolean
}

export type OpenRouterAnalysisClient = {
  analyze: (input: { title: string, company: string, location: string, seniority: string | null, text: string }) => Promise<{ model: string, costUsd: string | null, content: unknown }>
}

const normalizeText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

const optionalText = (value: unknown) => {
  const text = normalizeText(value)
  return text.length > 0 ? text : null
}

const requireText = (value: unknown, field: string) => {
  const text = normalizeText(value)

  if (!text) {
    throw new VacancyValidationError(`${field} e obrigatorio.`)
  }

  return text
}

const unique = (items: string[]) => [...new Set(items.map(item => item.trim()).filter(Boolean))]

const parseJsonList = (value: string) => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? unique(parsed.filter(item => typeof item === 'string')) : []
  } catch {
    return []
  }
}

const parseStringList = (value: unknown, field: string) => {
  if (!Array.isArray(value)) {
    throw new VacancyValidationError(`${field} deve ser uma lista.`)
  }

  return unique(value.map(item => normalizeText(item)))
}

const parseWeight = (value: unknown) => {
  const weight = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
    throw new VacancyValidationError('Peso deve ser um inteiro entre 0 e 100.')
  }

  return weight
}

const parseBoolean = (value: unknown) => value === true || value === 'true' || value === 1

const toNormalizedLabel = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const sentenceContaining = (text: string, pattern: RegExp) => {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map(sentence => sentence.trim())
  return sentences.find(sentence => pattern.test(sentence)) ?? ''
}

const addRequirement = (requirements: RequirementDraft[], text: string, pattern: RegExp, draft: Omit<RequirementDraft, 'provenance'>) => {
  if (!pattern.test(text)) {
    return
  }

  requirements.push({ ...draft, provenance: sentenceContaining(text, pattern) || draft.label })
}

const inferSeniority = (title: string, text: string, explicitSeniority: string | null) => {
  if (explicitSeniority) {
    return explicitSeniority
  }

  const haystack = `${title}\n${text}`.toLowerCase()

  if (/\b(head|director|diretor|vp|vice president)\b/.test(haystack)) {
    return 'Head / Director'
  }

  if (/\b(senior|sr\.?|lead|principal|staff)\b/.test(haystack)) {
    return 'Senior'
  }

  if (/\b(junior|jr\.?|entry)\b/.test(haystack)) {
    return 'Junior'
  }

  return null
}

const inferTitles = (title: string, text: string) => {
  const titles = [title]

  for (const match of text.matchAll(/(?:role|position|vaga|cargo)\s*(?:is|e|:)?\s*([^\n.]{6,80})/gi)) {
    titles.push(match[1] ?? '')
  }

  return unique(titles).slice(0, 5)
}

const inferLocations = (location: string, text: string) => {
  const locations = [location]

  for (const match of text.matchAll(/\b(?:Brazil|Brasil|Sao Paulo|Sao Paulo|Osasco|Remote|Remoto|Hybrid|Hibrido)\b/gi)) {
    locations.push(match[0] ?? '')
  }

  return unique(locations).slice(0, 6)
}

const inferAmbiguities = (text: string, seniority: string | null, locations: string[]) => {
  const ambiguities: string[] = []

  if (!seniority) {
    ambiguities.push('Seniority was not explicit enough to classify confidently.')
  }

  if (locations.length === 0) {
    ambiguities.push('Location or work model was not explicit in the vacancy text.')
  }

  if (/or equivalent|preferred|nice to have|desejavel/i.test(text)) {
    ambiguities.push('Some requirements are phrased as preferred or equivalent, so recruiter review is needed.')
  }

  if (/travel|viagens|relocation|mudanca/i.test(text)) {
    ambiguities.push('Travel or relocation expectations may need confirmation.')
  }

  return unique(ambiguities)
}

const inferRequirements = (text: string): RequirementDraft[] => {
  const requirements: RequirementDraft[] = []

  addRequirement(requirements, text, /program management|gest[a\u00e3]o de programas/i, { category: 'experience', label: 'Program management', normalizedLabel: 'program management', weight: 85, isMandatory: true, isEliminatory: false })
  addRequirement(requirements, text, /operations leadership|lideran[c\u00e7]a.*opera/i, { category: 'experience', label: 'Operations leadership', normalizedLabel: 'operations leadership', weight: 90, isMandatory: true, isEliminatory: false })
  addRequirement(requirements, text, /logistics|last mile|delivery|transportation|supply chain|opera[c\u00e7][o\u00f5]es logisticas/i, { category: 'domain', label: 'Logistics or supply chain domain', normalizedLabel: 'logistics supply chain', weight: 80, isMandatory: true, isEliminatory: false })
  addRequirement(requirements, text, /English|ingles|ingl[e\u00ea]s/i, { category: 'language', label: 'English proficiency', normalizedLabel: 'english proficiency', weight: 70, isMandatory: true, isEliminatory: true })
  addRequirement(requirements, text, /analytical|data|metrics|anal[i\u00ed]tic/i, { category: 'skill', label: 'Analytical capability', normalizedLabel: 'analytical capability', weight: 65, isMandatory: false, isEliminatory: false })
  addRequirement(requirements, text, /stakeholder|cross-functional|multifuncional/i, { category: 'skill', label: 'Cross-functional stakeholder management', normalizedLabel: 'stakeholder management', weight: 60, isMandatory: false, isEliminatory: false })
  addRequirement(requirements, text, /people management|lead people|liderar pessoas|gest[a\u00e3]o de pessoas/i, { category: 'experience', label: 'People leadership', normalizedLabel: 'people leadership', weight: 60, isMandatory: false, isEliminatory: false })

  if (requirements.length === 0) {
    requirements.push({ category: 'experience', label: 'Review vacancy text manually', normalizedLabel: 'manual review', provenance: text.replace(/\s+/g, ' ').trim().slice(0, 220), weight: 50, isMandatory: false, isEliminatory: false })
  }

  return requirements
}

const parseRequirements = (value: unknown) => {
  if (!Array.isArray(value)) {
    throw new VacancyValidationError('Requisitos devem ser uma lista.')
  }

  return value.map((item, index) => {
    const input = item as UpdateRequirementInput
    const label = requireText(input.label, 'Requisito')

    return {
      category: requireText(input.category, 'Categoria do requisito'),
      label,
      normalizedLabel: normalizeText(input.normalizedLabel) || toNormalizedLabel(label),
      provenance: requireText(input.provenance, 'Proveniencia do requisito'),
      weight: parseWeight(input.weight ?? 50),
      isMandatory: parseBoolean(input.isMandatory),
      isEliminatory: parseBoolean(input.isEliminatory),
      sortOrder: index
    }
  })
}

const validateGeneratedAnalysis = (value: unknown): AnalysisDraft => {
  if (!value || typeof value !== 'object') {
    throw new VacancyValidationError('OpenRouter retornou uma analise em formato invalido.', 502)
  }

  const input = value as UpdateAnalysisInput

  try {
    const requirements = parseRequirements(input.requirements)

    if (requirements.length === 0) {
      throw new VacancyValidationError('OpenRouter nao retornou requisitos para revisar.', 502)
    }

    return {
      seniority: optionalText(input.seniority),
      titles: parseStringList(input.titles, 'Titulos'),
      locations: parseStringList(input.locations, 'Localizacoes'),
      ambiguities: parseStringList(input.ambiguities, 'Ambiguidades'),
      requirements
    }
  } catch (error) {
    if (error instanceof VacancyValidationError && error.statusCode === 502) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'OpenRouter retornou uma analise em formato invalido.'
    throw new VacancyValidationError(message, 502)
  }
}

const analysisResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['seniority', 'titles', 'locations', 'ambiguities', 'requirements'],
  properties: {
    seniority: { type: ['string', 'null'] },
    titles: { type: 'array', items: { type: 'string' } },
    locations: { type: 'array', items: { type: 'string' } },
    ambiguities: { type: 'array', items: { type: 'string' } },
    requirements: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'label', 'normalizedLabel', 'provenance', 'weight', 'isMandatory', 'isEliminatory'],
        properties: {
          category: { type: 'string' },
          label: { type: 'string' },
          normalizedLabel: { type: 'string' },
          provenance: { type: 'string' },
          weight: { type: 'integer', minimum: 0, maximum: 100 },
          isMandatory: { type: 'boolean' },
          isEliminatory: { type: 'boolean' }
        }
      }
    }
  }
}

const systemPrompt = 'Extract recruiter-reviewable job analysis as strict JSON. Keep evidence short and copied or paraphrased from the vacancy text. Use integer weights from 0 to 100.'

const parseOpenRouterContent = (content: unknown) => {
  if (typeof content !== 'string') {
    return content
  }

  try {
    return JSON.parse(content)
  } catch {
    throw new VacancyValidationError('OpenRouter retornou JSON invalido.', 502)
  }
}

export const createOpenRouterAnalysisClient = (): OpenRouterAnalysisClient => ({
  async analyze(input) {
    const apiKey = process.env.NUXT_OPENROUTER_API_KEY
    const model = process.env.NUXT_OPENROUTER_MODEL || 'openai/gpt-4o-mini'

    if (!apiKey) {
      throw new VacancyValidationError('Configure NUXT_OPENROUTER_API_KEY para gerar analise live.', 400)
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'TTC LinkedIn Research Score'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(input) }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'vacancy_analysis',
            strict: true,
            schema: analysisResponseSchema
          }
        }
      })
    })

    const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }>, model?: string, usage?: { cost?: number, total_cost?: number }, error?: { message?: string } } | null

    if (!response.ok) {
      throw new VacancyValidationError(body?.error?.message ?? 'OpenRouter recusou a requisicao.', response.status)
    }

    return {
      model: body?.model ?? model,
      costUsd: String(body?.usage?.cost ?? body?.usage?.total_cost ?? '') || null,
      content: parseOpenRouterContent(body?.choices?.[0]?.message?.content)
    }
  }
})

const getLatestRun = async (vacancyId: number, database: Database): Promise<VacancyAnalysisRunDetail | null> => {
  const [run] = await database.select().from(vacancyAnalysisRuns)
    .where(eq(vacancyAnalysisRuns.vacancyId, vacancyId))
    .orderBy(desc(vacancyAnalysisRuns.createdAt), desc(vacancyAnalysisRuns.id))
    .limit(1)

  return run
    ? {
        id: run.id,
        source: run.source === 'openrouter' ? 'openrouter' : 'mock',
        status: run.status === 'success' ? 'success' : 'error',
        model: run.model,
        costUsd: run.costUsd,
        errorMessage: run.errorMessage,
        createdAt: run.createdAt
      }
    : null
}

const recordAnalysisRun = async (input: {
  vacancyId: number
  vacancyVersionId: number
  analysisId?: number | null
  source: VacancyAnalysisSource
  status: VacancyAnalysisRunStatus
  model?: string | null
  costUsd?: string | null
  errorMessage?: string | null
}, database: Database) => {
  await database.insert(vacancyAnalysisRuns).values({
    vacancyId: input.vacancyId,
    vacancyVersionId: input.vacancyVersionId,
    analysisId: input.analysisId ?? null,
    source: input.source,
    status: input.status,
    model: input.model ?? null,
    costUsd: input.costUsd ?? null,
    errorMessage: input.errorMessage ?? null
  })
}

const serializeAnalysis = async (analysisId: number, database: Database): Promise<VacancyAnalysisDetail | null> => {
  const [analysis] = await database.select().from(vacancyAnalyses).where(eq(vacancyAnalyses.id, analysisId)).limit(1)

  if (!analysis) {
    return null
  }

  const rows = await database.select().from(vacancyAnalysisRequirements)
    .where(eq(vacancyAnalysisRequirements.analysisId, analysis.id))
    .orderBy(asc(vacancyAnalysisRequirements.sortOrder), asc(vacancyAnalysisRequirements.id))
  const latestRun = await getLatestRun(analysis.vacancyId, database)

  return {
    id: analysis.id,
    vacancyId: analysis.vacancyId,
    vacancyVersionId: analysis.vacancyVersionId,
    status: analysis.status === 'approved' ? 'approved' : 'draft',
    seniority: analysis.seniority,
    titles: parseJsonList(analysis.titlesJson),
    locations: parseJsonList(analysis.locationsJson),
    ambiguities: parseJsonList(analysis.ambiguitiesJson),
    approvedAt: analysis.approvedAt,
    createdAt: analysis.createdAt,
    updatedAt: analysis.updatedAt,
    source: latestRun?.source ?? 'mock',
    latestRun,
    requirements: rows.map(row => ({
      id: row.id,
      category: row.category,
      label: row.label,
      normalizedLabel: row.normalizedLabel,
      provenance: row.provenance,
      weight: row.weight,
      isMandatory: row.isMandatory,
      isEliminatory: row.isEliminatory,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt
    })),
    canMoveForward: analysis.status === 'approved'
  }
}

export const getVacancyAnalysis = async (vacancyId: number, database: Database = defaultDb) => {
  if (!Number.isInteger(vacancyId) || vacancyId < 1) {
    throw new VacancyValidationError('Identificador da vaga invalido.')
  }

  const [analysis] = await database.select().from(vacancyAnalyses).where(eq(vacancyAnalyses.vacancyId, vacancyId)).limit(1)
  return analysis ? serializeAnalysis(analysis.id, database) : null
}

const saveGeneratedAnalysis = async (vacancyId: number, vacancyVersionId: number, draft: AnalysisDraft, database: Database) => {
  const existing = await getVacancyAnalysis(vacancyId, database)
  const values = {
    vacancyId,
    vacancyVersionId,
    status: 'draft',
    seniority: draft.seniority,
    titlesJson: JSON.stringify(draft.titles),
    locationsJson: JSON.stringify(draft.locations),
    ambiguitiesJson: JSON.stringify(draft.ambiguities),
    approvedAt: null,
    updatedAt: sql`CURRENT_TIMESTAMP`
  }
  const [analysis] = existing
    ? await database.update(vacancyAnalyses).set(values).where(eq(vacancyAnalyses.id, existing.id)).returning()
    : await database.insert(vacancyAnalyses).values(values).returning()

  if (!analysis) {
    throw new Error('Nao foi possivel gerar a analise da vaga.')
  }

  await database.delete(vacancyAnalysisRequirements).where(eq(vacancyAnalysisRequirements.analysisId, analysis.id))
  await database.insert(vacancyAnalysisRequirements).values(draft.requirements.map((requirement, index) => ({ analysisId: analysis.id, ...requirement, sortOrder: index })))

  return analysis
}

export const generateMockVacancyAnalysis = async (vacancyId: number, database: Database = defaultDb) => {
  const vacancy = await getVacancy(vacancyId, database)

  if (!vacancy?.currentVersion) {
    throw new VacancyValidationError('Vaga nao encontrada.', 404)
  }

  const text = vacancy.currentVersion.reviewedText
  const draft = {
    seniority: inferSeniority(vacancy.title, text, vacancy.seniority),
    titles: inferTitles(vacancy.title, text),
    locations: inferLocations(vacancy.location, text),
    ambiguities: inferAmbiguities(text, inferSeniority(vacancy.title, text, vacancy.seniority), inferLocations(vacancy.location, text)),
    requirements: inferRequirements(text)
  }
  const analysis = await saveGeneratedAnalysis(vacancyId, vacancy.currentVersion.id, draft, database)
  await recordAnalysisRun({ vacancyId, vacancyVersionId: vacancy.currentVersion.id, analysisId: analysis.id, source: 'mock', status: 'success', model: 'deterministic-mock' }, database)

  return serializeAnalysis(analysis.id, database)
}

export const generateOpenRouterVacancyAnalysis = async (vacancyId: number, database: Database = defaultDb, client: OpenRouterAnalysisClient = createOpenRouterAnalysisClient()) => {
  const vacancy = await getVacancy(vacancyId, database)

  if (!vacancy?.currentVersion) {
    throw new VacancyValidationError('Vaga nao encontrada.', 404)
  }

  let model: string | null = process.env.NUXT_OPENROUTER_MODEL || 'openai/gpt-4o-mini'
  let costUsd: string | null = null

  try {
    const response = await client.analyze({
      title: vacancy.title,
      company: vacancy.company,
      location: vacancy.location,
      seniority: vacancy.seniority,
      text: vacancy.currentVersion.reviewedText
    })
    model = response.model
    costUsd = response.costUsd
    const draft = validateGeneratedAnalysis(response.content)
    const analysis = await saveGeneratedAnalysis(vacancyId, vacancy.currentVersion.id, draft, database)
    await recordAnalysisRun({ vacancyId, vacancyVersionId: vacancy.currentVersion.id, analysisId: analysis.id, source: 'openrouter', status: 'success', model, costUsd }, database)

    return serializeAnalysis(analysis.id, database)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nao foi possivel gerar analise live.'
    await recordAnalysisRun({ vacancyId, vacancyVersionId: vacancy.currentVersion.id, source: 'openrouter', status: 'error', model, costUsd, errorMessage: message }, database)

    if (error instanceof VacancyValidationError) {
      throw error
    }

    throw new VacancyValidationError(message, 502)
  }
}

export const updateVacancyAnalysis = async (vacancyId: number, input: UpdateAnalysisInput, database: Database = defaultDb) => {
  const analysis = await getVacancyAnalysis(vacancyId, database)

  if (!analysis) {
    throw new VacancyValidationError('Analise da vaga ainda nao foi gerada.', 404)
  }

  const requirements = parseRequirements(input.requirements)
  const [updated] = await database.update(vacancyAnalyses).set({
    status: 'draft',
    seniority: optionalText(input.seniority),
    titlesJson: JSON.stringify(parseStringList(input.titles, 'Titulos')),
    locationsJson: JSON.stringify(parseStringList(input.locations, 'Localizacoes')),
    ambiguitiesJson: JSON.stringify(parseStringList(input.ambiguities, 'Ambiguidades')),
    approvedAt: null,
    updatedAt: sql`CURRENT_TIMESTAMP`
  }).where(eq(vacancyAnalyses.id, analysis.id)).returning()

  if (!updated) {
    throw new Error('Nao foi possivel atualizar a analise da vaga.')
  }

  await database.delete(vacancyAnalysisRequirements).where(eq(vacancyAnalysisRequirements.analysisId, analysis.id))

  if (requirements.length > 0) {
    await database.insert(vacancyAnalysisRequirements).values(requirements.map(requirement => ({ analysisId: analysis.id, ...requirement })))
  }

  return serializeAnalysis(analysis.id, database)
}

export const approveVacancyAnalysis = async (vacancyId: number, database: Database = defaultDb) => {
  const analysis = await getVacancyAnalysis(vacancyId, database)

  if (!analysis) {
    throw new VacancyValidationError('Analise da vaga ainda nao foi gerada.', 404)
  }

  if (analysis.requirements.length === 0) {
    throw new VacancyValidationError('Inclua pelo menos um requisito antes de aprovar.')
  }

  const [updated] = await database.update(vacancyAnalyses).set({
    status: 'approved',
    approvedAt: sql`CURRENT_TIMESTAMP`,
    updatedAt: sql`CURRENT_TIMESTAMP`
  }).where(eq(vacancyAnalyses.id, analysis.id)).returning()

  if (!updated) {
    throw new Error('Nao foi possivel aprovar a analise da vaga.')
  }

  return serializeAnalysis(analysis.id, database)
}

export const assertApprovedVacancyAnalysis = async (vacancyId: number, database: Database = defaultDb) => {
  const [analysis] = await database.select({ id: vacancyAnalyses.id }).from(vacancyAnalyses)
    .innerJoin(vacancies, eq(vacancies.id, vacancyAnalyses.vacancyId))
    .innerJoin(vacancyVersions, and(eq(vacancyVersions.id, vacancyAnalyses.vacancyVersionId), eq(vacancyVersions.id, vacancies.currentVersionId)))
    .where(and(eq(vacancyAnalyses.vacancyId, vacancyId), eq(vacancyAnalyses.status, 'approved')))
    .limit(1)

  if (!analysis) {
    throw new VacancyValidationError('A analise precisa ser aprovada antes de seguir.', 409)
  }
}
