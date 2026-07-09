import { desc, eq, like, or, sql } from 'drizzle-orm'
import { vacancies, vacancyVersions } from '../database/schema'
import { db as defaultDb } from './db'

type Database = typeof defaultDb

type CreateVacancyInput = {
  title?: unknown
  company?: unknown
  location?: unknown
  sourceUrl?: unknown
  seniority?: unknown
  sourcingComment?: unknown
  description?: unknown
}

export type VacancyListItem = {
  id: number
  title: string
  company: string
  location: string
  sourceUrl: string | null
  seniority: string | null
  sourcingComment: string | null
  currentVersionId: number | null
  descriptionPreview: string
  createdAt: string
  updatedAt: string
}

export class VacancyValidationError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message)
  }
}

const normalizeText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

const optionalText = (value: unknown) => {
  const text = normalizeText(value)
  return text.length > 0 ? text : null
}

const parseOptionalUrl = (value: unknown) => {
  const text = optionalText(value)

  if (!text) {
    return null
  }

  try {
    const url = new URL(text)

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('invalid protocol')
    }

    return url.toString()
  } catch {
    throw new VacancyValidationError('URL da vaga deve ser http ou https valido.')
  }
}

const requireText = (value: unknown, field: string, minLength = 1) => {
  const text = normalizeText(value)

  if (text.length < minLength) {
    throw new VacancyValidationError(`${field} e obrigatorio.`)
  }

  return text
}

const parseCreateVacancyInput = (input: CreateVacancyInput) => {
  const title = requireText(input.title, 'Titulo da vaga')
  const company = requireText(input.company, 'Empresa')
  const location = requireText(input.location, 'Localizacao')
  const description = requireText(input.description, 'Descricao da vaga', 30)

  if (description.length > 100_000) {
    throw new VacancyValidationError('Descricao da vaga deve ter no maximo 100.000 caracteres.')
  }

  return {
    title,
    company,
    location,
    sourceUrl: parseOptionalUrl(input.sourceUrl),
    seniority: optionalText(input.seniority),
    sourcingComment: optionalText(input.sourcingComment),
    description
  }
}

const toPreview = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 220)

export const createVacancy = async (input: CreateVacancyInput, database: Database = defaultDb) => {
  const parsed = parseCreateVacancyInput(input)

  const [vacancy] = await database.insert(vacancies).values({
    title: parsed.title,
    company: parsed.company,
    location: parsed.location,
    sourceUrl: parsed.sourceUrl,
    seniority: parsed.seniority,
    sourcingComment: parsed.sourcingComment
  }).returning()

  if (!vacancy) {
    throw new Error('Nao foi possivel criar a vaga.')
  }

  const [version] = await database.insert(vacancyVersions).values({
    vacancyId: vacancy.id,
    versionNumber: 1,
    sourceType: 'pasted_text',
    originalText: parsed.description,
    reviewedText: parsed.description
  }).returning()

  if (!version) {
    throw new Error('Nao foi possivel criar a versao inicial da vaga.')
  }

  await database.update(vacancies)
    .set({ currentVersionId: version.id, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(vacancies.id, vacancy.id))

  return getVacancy(vacancy.id, database)
}

export const listVacancies = async (options: { search?: unknown } = {}, database: Database = defaultDb): Promise<VacancyListItem[]> => {
  const search = normalizeText(options.search)
  const pattern = `%${search}%`
  const where = search
    ? or(
        like(vacancies.title, pattern),
        like(vacancies.company, pattern),
        like(vacancies.location, pattern),
        like(vacancyVersions.reviewedText, pattern)
      )
    : undefined

  const rows = await database.select({
    id: vacancies.id,
    title: vacancies.title,
    company: vacancies.company,
    location: vacancies.location,
    sourceUrl: vacancies.sourceUrl,
    seniority: vacancies.seniority,
    sourcingComment: vacancies.sourcingComment,
    currentVersionId: vacancies.currentVersionId,
    reviewedText: vacancyVersions.reviewedText,
    createdAt: vacancies.createdAt,
    updatedAt: vacancies.updatedAt
  })
    .from(vacancies)
    .leftJoin(vacancyVersions, eq(vacancies.currentVersionId, vacancyVersions.id))
    .where(where)
    .orderBy(desc(vacancies.createdAt))

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    sourceUrl: row.sourceUrl,
    seniority: row.seniority,
    sourcingComment: row.sourcingComment,
    currentVersionId: row.currentVersionId,
    descriptionPreview: toPreview(row.reviewedText ?? ''),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }))
}

export const getVacancy = async (id: number, database: Database = defaultDb) => {
  if (!Number.isInteger(id) || id < 1) {
    throw new VacancyValidationError('Identificador da vaga invalido.', 400)
  }

  const [vacancy] = await database.select().from(vacancies).where(eq(vacancies.id, id)).limit(1)

  if (!vacancy) {
    return null
  }

  const versions = await database.select().from(vacancyVersions)
    .where(eq(vacancyVersions.vacancyId, id))
    .orderBy(desc(vacancyVersions.versionNumber))

  const currentVersion = versions.find(version => version.id === vacancy.currentVersionId) ?? versions[0] ?? null

  return {
    ...vacancy,
    currentVersion,
    versions
  }
}
