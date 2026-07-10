import { and, desc, eq, sql } from 'drizzle-orm'
import { sourcingQueries, sourcingRunResults, sourcingRuns, vacancies } from '../database/schema'
import { db as defaultDb } from './db'
import { assertApprovedSourcingQuery } from './sourcingQueries'
import { VacancyValidationError } from './vacancies'

type Database = typeof defaultDb

type RunInput = {
  queryId?: unknown
  desiredResults?: unknown
  threshold?: unknown
  profileLimit?: unknown
  pageLimit?: unknown
  batchSize?: unknown
  cacheAgeDays?: unknown
  mode?: unknown
}

export type SourcingRunDetail = {
  id: number
  vacancyId: number
  sourcingQueryId: number
  status: 'queued' | 'running' | 'completed' | 'failed'
  mode: 'mock'
  config: {
    desiredResults: number
    threshold: number
    profileLimit: number
    pageLimit: number
    batchSize: number
    cacheAgeDays: number
  }
  progress: number
  foundCount: number
  savedCount: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  query: { id: number, versionNumber: number | null, queryText: string }
  results: Array<{
    id: number
    rank: number
    profileUrl: string
    fullName: string
    headline: string
    location: string
    score: number
    matchedTerms: string[]
    summary: string
    createdAt: string
  }>
}

const parseInteger = (value: unknown, field: string, min: number, max: number) => {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new VacancyValidationError(`${field} deve ser um inteiro entre ${min} e ${max}.`)
  }
  return number
}

const parseConfig = (input: RunInput) => {
  const mode = typeof input.mode === 'string' ? input.mode.trim() : 'mock'
  if (mode !== 'mock') {
    throw new VacancyValidationError('Somente rodadas mock estao disponiveis sem credenciais externas.')
  }

  const desiredResults = parseInteger(input.desiredResults ?? 5, 'Resultados desejados', 1, 50)
  const threshold = parseInteger(input.threshold ?? 70, 'Threshold', 0, 100)
  const profileLimit = parseInteger(input.profileLimit ?? 25, 'Limite de perfis', 1, 500)
  const pageLimit = parseInteger(input.pageLimit ?? 2, 'Limite de paginas', 1, 50)
  const batchSize = parseInteger(input.batchSize ?? 5, 'Tamanho do lote', 1, 100)
  const cacheAgeDays = parseInteger(input.cacheAgeDays ?? 14, 'Idade do cache', 0, 365)

  if (desiredResults > profileLimit) {
    throw new VacancyValidationError('Resultados desejados nao podem exceder o limite de perfis.')
  }

  return { desiredResults, threshold, profileLimit, pageLimit, batchSize, cacheAgeDays, mode: 'mock' as const }
}

const parseJsonList = (value: string) => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
  } catch {
    return []
  }
}

const serializeRun = (run: typeof sourcingRuns.$inferSelect, query: typeof sourcingQueries.$inferSelect, results: Array<typeof sourcingRunResults.$inferSelect>): SourcingRunDetail => ({
  id: run.id,
  vacancyId: run.vacancyId,
  sourcingQueryId: run.sourcingQueryId,
  status: ['queued', 'running', 'completed', 'failed'].includes(run.status) ? run.status as SourcingRunDetail['status'] : 'failed',
  mode: 'mock',
  config: {
    desiredResults: run.desiredResults,
    threshold: run.threshold,
    profileLimit: run.profileLimit,
    pageLimit: run.pageLimit,
    batchSize: run.batchSize,
    cacheAgeDays: run.cacheAgeDays
  },
  progress: run.progress,
  foundCount: run.foundCount,
  savedCount: run.savedCount,
  errorMessage: run.errorMessage,
  startedAt: run.startedAt,
  completedAt: run.completedAt,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
  query: { id: query.id, versionNumber: query.versionNumber, queryText: query.queryText },
  results: results.map(result => ({
    id: result.id,
    rank: result.rank,
    profileUrl: result.profileUrl,
    fullName: result.fullName,
    headline: result.headline,
    location: result.location,
    score: result.score,
    matchedTerms: parseJsonList(result.matchedTermsJson),
    summary: result.summary,
    createdAt: result.createdAt
  }))
})

const syntheticNames = ['Ana Costa', 'Bruno Almeida', 'Carla Mendes', 'Diego Santos', 'Fernanda Lima', 'Gabriel Rocha', 'Helena Martins', 'Igor Pereira']
const extractTerms = (queryText: string) => [...queryText.matchAll(/"([^"]+)"/g)].map(match => match[1]).filter(Boolean).slice(0, 4)

const buildSyntheticResults = (runId: number, vacancy: typeof vacancies.$inferSelect, query: typeof sourcingQueries.$inferSelect, config: ReturnType<typeof parseConfig>) => {
  const terms = extractTerms(query.queryText)
  const count = Math.min(config.desiredResults, config.profileLimit, Math.max(1, config.batchSize * config.pageLimit))

  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1
    const score = Math.max(config.threshold, 96 - index * 4)
    const name = syntheticNames[index % syntheticNames.length] ?? `Mock Candidate ${rank}`
    const matchedTerms = terms.length ? terms.slice(0, Math.min(terms.length, 2 + (index % 2))) : [vacancy.title]

    return {
      runId,
      rank,
      profileUrl: `https://www.linkedin.com/in/mock-${vacancy.id}-${query.id}-${rank}`,
      fullName: name,
      headline: `${vacancy.title} candidate for ${vacancy.company}`,
      location: vacancy.location,
      score,
      matchedTermsJson: JSON.stringify(matchedTerms),
      summary: `Synthetic mock profile ranked ${rank} from approved query v${query.versionNumber ?? 0}. No external provider was called.`
    }
  })
}

export const getSourcingRuns = async (vacancyId: number, database: Database = defaultDb): Promise<SourcingRunDetail[]> => {
  if (!Number.isInteger(vacancyId) || vacancyId < 1) {
    throw new VacancyValidationError('Identificador da vaga invalido.')
  }

  const rows = await database.select({ run: sourcingRuns, query: sourcingQueries }).from(sourcingRuns)
    .innerJoin(sourcingQueries, eq(sourcingQueries.id, sourcingRuns.sourcingQueryId))
    .where(eq(sourcingRuns.vacancyId, vacancyId))
    .orderBy(desc(sourcingRuns.createdAt), desc(sourcingRuns.id))

  const details: SourcingRunDetail[] = []
  for (const row of rows) {
    const results = await database.select().from(sourcingRunResults)
      .where(eq(sourcingRunResults.runId, row.run.id))
      .orderBy(sourcingRunResults.rank)
    details.push(serializeRun(row.run, row.query, results))
  }
  return details
}

export const runMockSourcing = async (vacancyId: number, input: RunInput, database: Database = defaultDb) => {
  const queryId = parseInteger(input.queryId, 'Query aprovada', 1, Number.MAX_SAFE_INTEGER)
  const config = parseConfig(input)
  await assertApprovedSourcingQuery(vacancyId, queryId, database)

  const [vacancy] = await database.select().from(vacancies).where(eq(vacancies.id, vacancyId)).limit(1)
  const [query] = await database.select().from(sourcingQueries)
    .where(and(eq(sourcingQueries.id, queryId), eq(sourcingQueries.vacancyId, vacancyId)))
    .limit(1)
  if (!vacancy || !query) {
    throw new VacancyValidationError('Vaga ou query nao encontrada.', 404)
  }

  const [run] = await database.insert(sourcingRuns).values({
    vacancyId,
    sourcingQueryId: queryId,
    status: 'running',
    mode: config.mode,
    desiredResults: config.desiredResults,
    threshold: config.threshold,
    profileLimit: config.profileLimit,
    pageLimit: config.pageLimit,
    batchSize: config.batchSize,
    cacheAgeDays: config.cacheAgeDays,
    progress: 10,
    startedAt: sql`CURRENT_TIMESTAMP`,
    updatedAt: sql`CURRENT_TIMESTAMP`
  }).returning()

  if (!run) {
    throw new Error('Nao foi possivel iniciar a rodada de sourcing.')
  }

  const results = buildSyntheticResults(run.id, vacancy, query, config)
  if (results.length) {
    await database.insert(sourcingRunResults).values(results)
  }

  await database.update(sourcingRuns).set({
    status: 'completed',
    progress: 100,
    foundCount: Math.min(config.profileLimit, config.batchSize * config.pageLimit),
    savedCount: results.length,
    completedAt: sql`CURRENT_TIMESTAMP`,
    updatedAt: sql`CURRENT_TIMESTAMP`
  }).where(eq(sourcingRuns.id, run.id))

  const runs = await getSourcingRuns(vacancyId, database)
  const completed = runs.find(item => item.id === run.id)
  if (!completed) {
    throw new Error('Nao foi possivel carregar a rodada concluida.')
  }
  return completed
}
