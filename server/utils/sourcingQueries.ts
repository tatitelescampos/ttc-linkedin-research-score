import { and, desc, eq, isNull, max, sql } from 'drizzle-orm'
import { sourcingQueries, vacancies, vacancyAnalyses, vacancyVersions } from '../database/schema'
import { assertApprovedVacancyAnalysis, getVacancyAnalysis } from './vacancyAnalysis'
import { db as defaultDb } from './db'
import { VacancyValidationError } from './vacancies'

type Database = typeof defaultDb
type ProviderFilters = Record<string, string[]>
type SourcingQueryInput = { queryText?: unknown, providerFilters?: unknown }

export type SourcingQueryDetail = {
  id: number
  vacancyId: number
  analysisId: number
  status: 'draft' | 'approved'
  versionNumber: number | null
  queryText: string
  providerFilters: ProviderFilters
  explanation: string
  assumptions: string[]
  limitations: string[]
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  canSelectForRun: boolean
}

export type SourcingQueryPlan = { draft: SourcingQueryDetail | null, approvedVersions: SourcingQueryDetail[] }

const normalizeText = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const unique = (items: string[]) => [...new Set(items.map(item => item.trim()).filter(Boolean))]

const requireText = (value: unknown, field: string) => {
  const text = normalizeText(value)
  if (!text) {
    throw new VacancyValidationError(`${field} e obrigatorio.`)
  }
  return text
}

const parseJsonList = (value: string) => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? unique(parsed.filter(item => typeof item === 'string')) : []
  } catch {
    return []
  }
}

const parseProviderFilters = (value: unknown): ProviderFilters => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new VacancyValidationError('Filtros de provedor devem ser um objeto.')
  }

  const filters: ProviderFilters = {}
  for (const [provider, rawValues] of Object.entries(value)) {
    const name = normalizeText(provider)
    if (!name) {
      continue
    }
    if (!Array.isArray(rawValues)) {
      throw new VacancyValidationError('Cada filtro de provedor deve ser uma lista.')
    }
    filters[name] = unique(rawValues.map(item => normalizeText(item)))
  }
  return filters
}

const parseProviderFiltersJson = (value: string): ProviderFilters => {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parseProviderFilters(parsed) : {}
  } catch {
    return {}
  }
}

const quote = (value: string) => `"${value.replaceAll('"', '')}"`

const buildDefaultQueryText = (analysis: NonNullable<Awaited<ReturnType<typeof getVacancyAnalysis>>>) => {
  const titles = analysis.titles.length > 0 ? analysis.titles : ['candidate']
  const mandatory = analysis.requirements.filter(requirement => requirement.isMandatory).slice(0, 4)
  const domain = analysis.requirements.filter(requirement => requirement.category === 'domain').slice(0, 2)
  const optional = analysis.requirements.filter(requirement => !requirement.isMandatory && requirement.weight >= 60).slice(0, 3)
  const parts = [
    `(${titles.map(quote).join(' OR ')})`,
    ...mandatory.map(requirement => quote(requirement.label)),
    domain.length ? `(${domain.map(requirement => quote(requirement.label)).join(' OR ')})` : '',
    optional.length ? `(${optional.map(requirement => quote(requirement.label)).join(' OR ')})` : '',
    analysis.seniority ? quote(analysis.seniority) : ''
  ].filter(Boolean)

  return parts.join(' AND ')
}

const buildDefaultProviderFilters = (analysis: NonNullable<Awaited<ReturnType<typeof getVacancyAnalysis>>>): ProviderFilters => ({
  linkedin: unique([
    ...analysis.locations,
    analysis.seniority ?? '',
    ...analysis.requirements.filter(requirement => requirement.isMandatory).map(requirement => requirement.category)
  ])
})

const serializeQuery = (query: typeof sourcingQueries.$inferSelect): SourcingQueryDetail => ({
  id: query.id,
  vacancyId: query.vacancyId,
  analysisId: query.analysisId,
  status: query.status === 'approved' ? 'approved' : 'draft',
  versionNumber: query.versionNumber,
  queryText: query.queryText,
  providerFilters: parseProviderFiltersJson(query.providerFiltersJson),
  explanation: query.explanation,
  assumptions: parseJsonList(query.assumptionsJson),
  limitations: parseJsonList(query.limitationsJson),
  approvedAt: query.approvedAt,
  createdAt: query.createdAt,
  updatedAt: query.updatedAt,
  canSelectForRun: query.status === 'approved'
})

export const getSourcingQueryPlan = async (vacancyId: number, database: Database = defaultDb): Promise<SourcingQueryPlan> => {
  if (!Number.isInteger(vacancyId) || vacancyId < 1) {
    throw new VacancyValidationError('Identificador da vaga invalido.')
  }

  const [draft] = await database.select().from(sourcingQueries)
    .where(and(eq(sourcingQueries.vacancyId, vacancyId), eq(sourcingQueries.status, 'draft'), isNull(sourcingQueries.versionNumber)))
    .limit(1)
  const approved = await database.select().from(sourcingQueries)
    .where(and(eq(sourcingQueries.vacancyId, vacancyId), eq(sourcingQueries.status, 'approved')))
    .orderBy(desc(sourcingQueries.versionNumber), desc(sourcingQueries.id))

  return { draft: draft ? serializeQuery(draft) : null, approvedVersions: approved.map(serializeQuery) }
}

export const generateMockSourcingQuery = async (vacancyId: number, database: Database = defaultDb) => {
  await assertApprovedVacancyAnalysis(vacancyId, database)
  const analysis = await getVacancyAnalysis(vacancyId, database)
  if (!analysis || analysis.status !== 'approved') {
    throw new VacancyValidationError('A analise precisa ser aprovada antes de gerar a query.', 409)
  }

  const draft = {
    vacancyId,
    analysisId: analysis.id,
    status: 'draft',
    versionNumber: null,
    queryText: buildDefaultQueryText(analysis),
    providerFiltersJson: JSON.stringify(buildDefaultProviderFilters(analysis)),
    explanation: 'Query deterministica gerada a partir dos titulos, requisitos obrigatorios, dominio, senioridade e locais da analise aprovada.',
    assumptionsJson: JSON.stringify([
      'Titulos identificados na analise sao bons pontos de partida para busca booleana.',
      'Requisitos obrigatorios devem aparecer no texto da query para reduzir falsos positivos.'
    ]),
    limitationsJson: JSON.stringify([
      'A query nao chama provedores externos e deve ser revisada para sintaxe especifica de cada plataforma.',
      'Filtros de provedor sao sugestoes neutras e podem precisar de ajuste operacional.'
    ]),
    approvedAt: null,
    updatedAt: sql`CURRENT_TIMESTAMP`
  }
  const existing = await getSourcingQueryPlan(vacancyId, database)
  const [query] = existing.draft
    ? await database.update(sourcingQueries).set(draft).where(eq(sourcingQueries.id, existing.draft.id)).returning()
    : await database.insert(sourcingQueries).values(draft).returning()

  if (!query) {
    throw new Error('Nao foi possivel gerar a query de sourcing.')
  }
  return getSourcingQueryPlan(vacancyId, database)
}

export const updateSourcingQueryDraft = async (vacancyId: number, input: SourcingQueryInput, database: Database = defaultDb) => {
  const plan = await getSourcingQueryPlan(vacancyId, database)
  if (!plan.draft) {
    throw new VacancyValidationError('Gere uma query antes de editar.', 404)
  }

  const [query] = await database.update(sourcingQueries).set({
    queryText: requireText(input.queryText, 'Query'),
    providerFiltersJson: JSON.stringify(parseProviderFilters(input.providerFilters)),
    updatedAt: sql`CURRENT_TIMESTAMP`
  }).where(eq(sourcingQueries.id, plan.draft.id)).returning()

  if (!query) {
    throw new Error('Nao foi possivel salvar a query de sourcing.')
  }
  return getSourcingQueryPlan(vacancyId, database)
}

export const approveSourcingQueryDraft = async (vacancyId: number, database: Database = defaultDb) => {
  const plan = await getSourcingQueryPlan(vacancyId, database)
  if (!plan.draft) {
    throw new VacancyValidationError('Gere uma query antes de aprovar.', 404)
  }
  await assertApprovedVacancyAnalysis(vacancyId, database)

  const [version] = await database.select({ value: max(sourcingQueries.versionNumber) }).from(sourcingQueries)
    .where(and(eq(sourcingQueries.vacancyId, vacancyId), eq(sourcingQueries.status, 'approved')))
  const nextVersion = (version?.value ?? 0) + 1
  const [approved] = await database.insert(sourcingQueries).values({
    vacancyId,
    analysisId: plan.draft.analysisId,
    status: 'approved',
    versionNumber: nextVersion,
    queryText: plan.draft.queryText,
    providerFiltersJson: JSON.stringify(plan.draft.providerFilters),
    explanation: plan.draft.explanation,
    assumptionsJson: JSON.stringify(plan.draft.assumptions),
    limitationsJson: JSON.stringify(plan.draft.limitations),
    approvedAt: sql`CURRENT_TIMESTAMP`
  }).returning()

  if (!approved) {
    throw new Error('Nao foi possivel aprovar a query de sourcing.')
  }
  return getSourcingQueryPlan(vacancyId, database)
}

export const assertApprovedSourcingQuery = async (vacancyId: number, queryId: number, database: Database = defaultDb) => {
  if (!Number.isInteger(vacancyId) || vacancyId < 1 || !Number.isInteger(queryId) || queryId < 1) {
    throw new VacancyValidationError('Identificador da query invalido.')
  }

  const [query] = await database.select({ id: sourcingQueries.id }).from(sourcingQueries)
    .innerJoin(vacancyAnalyses, eq(vacancyAnalyses.id, sourcingQueries.analysisId))
    .innerJoin(vacancies, eq(vacancies.id, sourcingQueries.vacancyId))
    .innerJoin(vacancyVersions, and(eq(vacancyVersions.id, vacancyAnalyses.vacancyVersionId), eq(vacancyVersions.id, vacancies.currentVersionId)))
    .where(and(
      eq(sourcingQueries.id, queryId),
      eq(sourcingQueries.vacancyId, vacancyId),
      eq(sourcingQueries.status, 'approved'),
      eq(vacancyAnalyses.status, 'approved')
    ))
    .limit(1)

  if (!query) {
    throw new VacancyValidationError('A query de sourcing precisa estar aprovada antes de iniciar uma rodada.', 409)
  }
}
