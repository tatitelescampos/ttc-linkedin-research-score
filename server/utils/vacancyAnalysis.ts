import { and, asc, eq, sql } from 'drizzle-orm'
import { vacancies, vacancyAnalyses, vacancyAnalysisRequirements, vacancyVersions } from '../database/schema'
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
  requirements: VacancyAnalysisRequirement[]
  canMoveForward: boolean
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

  addRequirement(requirements, text, /program management|gest[aã]o de programas/i, { category: 'experience', label: 'Program management', normalizedLabel: 'program management', weight: 85, isMandatory: true, isEliminatory: false })
  addRequirement(requirements, text, /operations leadership|lideran[cç]a.*opera/i, { category: 'experience', label: 'Operations leadership', normalizedLabel: 'operations leadership', weight: 90, isMandatory: true, isEliminatory: false })
  addRequirement(requirements, text, /logistics|last mile|delivery|transportation|supply chain|opera[cç][oõ]es logisticas/i, { category: 'domain', label: 'Logistics or supply chain domain', normalizedLabel: 'logistics supply chain', weight: 80, isMandatory: true, isEliminatory: false })
  addRequirement(requirements, text, /English|ingles|ingl[eê]s/i, { category: 'language', label: 'English proficiency', normalizedLabel: 'english proficiency', weight: 70, isMandatory: true, isEliminatory: true })
  addRequirement(requirements, text, /analytical|data|metrics|anal[ií]tic/i, { category: 'skill', label: 'Analytical capability', normalizedLabel: 'analytical capability', weight: 65, isMandatory: false, isEliminatory: false })
  addRequirement(requirements, text, /stakeholder|cross-functional|multifuncional/i, { category: 'skill', label: 'Cross-functional stakeholder management', normalizedLabel: 'stakeholder management', weight: 60, isMandatory: false, isEliminatory: false })
  addRequirement(requirements, text, /people management|lead people|liderar pessoas|gest[aã]o de pessoas/i, { category: 'experience', label: 'People leadership', normalizedLabel: 'people leadership', weight: 60, isMandatory: false, isEliminatory: false })

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

const serializeAnalysis = async (analysisId: number, database: Database): Promise<VacancyAnalysisDetail | null> => {
  const [analysis] = await database.select().from(vacancyAnalyses).where(eq(vacancyAnalyses.id, analysisId)).limit(1)

  if (!analysis) {
    return null
  }

  const rows = await database.select().from(vacancyAnalysisRequirements)
    .where(eq(vacancyAnalysisRequirements.analysisId, analysis.id))
    .orderBy(asc(vacancyAnalysisRequirements.sortOrder), asc(vacancyAnalysisRequirements.id))

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

export const generateMockVacancyAnalysis = async (vacancyId: number, database: Database = defaultDb) => {
  const vacancy = await getVacancy(vacancyId, database)

  if (!vacancy?.currentVersion) {
    throw new VacancyValidationError('Vaga nao encontrada.', 404)
  }

  const text = vacancy.currentVersion.reviewedText
  const seniority = inferSeniority(vacancy.title, text, vacancy.seniority)
  const titles = inferTitles(vacancy.title, text)
  const locations = inferLocations(vacancy.location, text)
  const ambiguities = inferAmbiguities(text, seniority, locations)
  const requirements = inferRequirements(text)
  const existing = await getVacancyAnalysis(vacancyId, database)
  const values = {
    vacancyId,
    vacancyVersionId: vacancy.currentVersion.id,
    status: 'draft',
    seniority,
    titlesJson: JSON.stringify(titles),
    locationsJson: JSON.stringify(locations),
    ambiguitiesJson: JSON.stringify(ambiguities),
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
  await database.insert(vacancyAnalysisRequirements).values(requirements.map((requirement, index) => ({ analysisId: analysis.id, ...requirement, sortOrder: index })))

  return serializeAnalysis(analysis.id, database)
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
