import { and, desc, eq } from 'drizzle-orm'
import { candidateDecisions, profileEvaluations, providerProfiles } from '../database/schema'
import { db as defaultDb } from './db'
import { VacancyValidationError } from './vacancies'

type Database = typeof defaultDb

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export const listExportableCandidates = async (vacancyId: number, database: Database = defaultDb) => {
  if (!Number.isInteger(vacancyId) || vacancyId < 1) {
    throw new VacancyValidationError('Identificador da vaga invalido.')
  }

  const rows = await database.select({ decision: candidateDecisions, evaluation: profileEvaluations, profile: providerProfiles })
    .from(candidateDecisions)
    .innerJoin(profileEvaluations, eq(profileEvaluations.id, candidateDecisions.evaluationId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, candidateDecisions.profileId))
    .where(and(eq(candidateDecisions.vacancyId, vacancyId), eq(candidateDecisions.decision, 'shortlisted')))
    .orderBy(desc(profileEvaluations.suitabilityScore), desc(profileEvaluations.confidence))

  return rows.map(({ decision, evaluation, profile }) => ({
    name: profile.fullName,
    linkedinUrl: profile.linkedinUrl,
    headline: profile.headline,
    location: profile.location,
    suitabilityScore: evaluation.suitabilityScore,
    confidence: evaluation.confidence,
    category: evaluation.category,
    note: decision.note,
    decidedAt: decision.decidedAt
  }))
}

export const exportCandidatesCsv = (candidates: Awaited<ReturnType<typeof listExportableCandidates>>) => {
  const header = ['name', 'linkedinUrl', 'headline', 'location', 'suitabilityScore', 'confidence', 'category', 'note', 'decidedAt']
  return [header.join(','), ...candidates.map(candidate => header.map(key => csvCell(candidate[key as keyof typeof candidate])).join(','))].join('\n')
}
