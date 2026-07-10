import { and, eq, sql } from 'drizzle-orm'
import { candidateDecisions, profileEvaluations } from '../database/schema'
import { db as defaultDb } from './db'
import { VacancyValidationError } from './vacancies'

type Database = typeof defaultDb

export type CandidateDecisionValue = 'undecided' | 'shortlisted' | 'rejected' | 'maybe'

const parseDecision = (value: unknown): CandidateDecisionValue => {
  if (value === 'shortlisted' || value === 'rejected' || value === 'maybe' || value === 'undecided') return value
  throw new VacancyValidationError('Decisao de candidato invalida.')
}

const parseNote = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null

export const setCandidateDecision = async (vacancyId: number, evaluationId: number, input: { decision?: unknown, note?: unknown }, database: Database = defaultDb) => {
  if (!Number.isInteger(vacancyId) || vacancyId < 1 || !Number.isInteger(evaluationId) || evaluationId < 1) {
    throw new VacancyValidationError('Identificador da decisao invalido.')
  }

  const [evaluation] = await database.select().from(profileEvaluations)
    .where(and(eq(profileEvaluations.id, evaluationId), eq(profileEvaluations.vacancyId, vacancyId)))
    .limit(1)

  if (!evaluation) {
    throw new VacancyValidationError('Avaliacao de perfil nao encontrada.', 404)
  }

  const decision = parseDecision(input.decision)
  const note = parseNote(input.note)
  const decidedAt = decision === 'undecided' ? null : sql`CURRENT_TIMESTAMP`

  const [existing] = await database.select().from(candidateDecisions)
    .where(and(eq(candidateDecisions.vacancyId, vacancyId), eq(candidateDecisions.profileId, evaluation.profileId)))
    .limit(1)

  const values = {
    vacancyId,
    profileId: evaluation.profileId,
    evaluationId: evaluation.id,
    decision,
    note,
    decidedAt,
    updatedAt: sql`CURRENT_TIMESTAMP`
  }

  const [saved] = existing
    ? await database.update(candidateDecisions).set(values).where(eq(candidateDecisions.id, existing.id)).returning()
    : await database.insert(candidateDecisions).values(values).returning()

  if (!saved) {
    throw new Error('Nao foi possivel salvar a decisao do candidato.')
  }

  return saved
}
