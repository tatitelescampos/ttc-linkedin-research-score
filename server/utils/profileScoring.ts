import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { candidateDecisions, profileEvaluations, profileRequirementEvidence, providerProfiles, providerProfileVersions, vacancyAnalyses, vacancyAnalysisRequirements, vacancies, vacancyVersions } from '../database/schema'
import { db as defaultDb } from './db'
import { VacancyValidationError } from './vacancies'
import { getVacancyAnalysis } from './vacancyAnalysis'

export type RequirementEvidenceStatus = 'met' | 'unknown' | 'not_met' | 'contradicted'
export type ProfileEvaluationCategory = 'strong' | 'possible' | 'weak' | 'eliminated'

type Database = typeof defaultDb

type ProfileText = {
  headline: string | null
  location: string | null
  normalized: unknown
}

export type ProfileRequirementEvidenceDetail = {
  id: number
  requirementId: number
  requirementLabel: string
  requirementCategory: string
  weight: number
  isEliminatory: boolean
  status: RequirementEvidenceStatus
  scoreContribution: number
  confidence: number
  evidenceText: string | null
  explanation: string
}

export type ProfileEvaluationDetail = {
  id: number
  vacancyId: number
  analysisId: number
  profileId: number
  profileName: string
  linkedinUrl: string | null
  headline: string | null
  location: string | null
  suitabilityScore: number
  confidence: number
  category: ProfileEvaluationCategory
  isEliminated: boolean
  eliminationReason: string | null
  missingInformation: string[]
  explanation: string
  createdAt: string
  updatedAt: string
  evidence: ProfileRequirementEvidenceDetail[]
}

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const parseJson = (value: string | null) => {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

const collectText = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectText)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectText)
  return []
}

const buildProfileCorpus = (profile: ProfileText) => collectText({ headline: profile.headline, location: profile.location, normalized: profile.normalized })
  .map(text => text.trim())
  .filter(Boolean)

const findEvidence = (corpus: string[], label: string) => {
  const terms = normalize(label).split(/[^a-z0-9]+/).filter(term => term.length >= 3)
  if (!terms.length) return null

  return corpus.find((line) => {
    const normalizedLine = normalize(line)
    return terms.every(term => new RegExp(`\\b${escapeRegExp(term)}\\b`).test(normalizedLine))
  }) ?? null
}

const findNegativeEvidence = (corpus: string[], label: string) => {
  const terms = normalize(label).split(/[^a-z0-9]+/).filter(term => term.length >= 3)
  if (!terms.length) return null
  const mainTerm = terms[terms.length - 1] ?? ''
  const negative = new RegExp(`\\b(no|sem|without|not|nao|lacks|lacking)\\b.{0,60}\\b${escapeRegExp(mainTerm)}\\b`)
  return corpus.find(line => negative.test(normalize(line))) ?? null
}

const classifyScore = (score: number, eliminated: boolean): ProfileEvaluationCategory => {
  if (eliminated) return 'eliminated'
  if (score >= 80) return 'strong'
  if (score >= 50) return 'possible'
  return 'weak'
}

const calculateEvidence = (requirements: NonNullable<Awaited<ReturnType<typeof getVacancyAnalysis>>>['requirements'], profile: ProfileText) => {
  const corpus = buildProfileCorpus(profile)
  const totalWeight = requirements.reduce((sum, requirement) => sum + requirement.weight, 0) || 1
  let metWeight = 0
  let knownWeight = 0

  const evidence = requirements.map((requirement) => {
    const negativeEvidence = findNegativeEvidence(corpus, requirement.normalizedLabel || requirement.label)
    const positiveEvidence = negativeEvidence ? null : findEvidence(corpus, requirement.normalizedLabel || requirement.label)
    const status: RequirementEvidenceStatus = negativeEvidence ? 'contradicted' : positiveEvidence ? 'met' : 'unknown'
    const scoreContribution = status === 'met' ? requirement.weight : 0
    const confidence = status === 'unknown' ? 0 : 100

    if (status !== 'unknown') knownWeight += requirement.weight
    if (status === 'met') metWeight += requirement.weight

    return {
      requirement,
      status,
      scoreContribution,
      confidence,
      evidenceText: negativeEvidence ?? positiveEvidence,
      explanation: status === 'met'
        ? `Evidence found in profile text for ${requirement.label}.`
        : status === 'unknown'
          ? `No explicit evidence found for ${requirement.label}; kept as unknown, not rejected.`
          : `Profile text explicitly conflicts with ${requirement.label}.`
    }
  })

  const eliminatedEvidence = evidence.find(item => item.requirement.isEliminatory && item.status === 'contradicted')
  const suitabilityScore = Math.round((metWeight / totalWeight) * 100)
  const confidence = Math.round((knownWeight / totalWeight) * 100)
  const missingInformation = evidence.filter(item => item.status === 'unknown').map(item => item.requirement.label)

  return {
    suitabilityScore,
    confidence,
    category: classifyScore(suitabilityScore, Boolean(eliminatedEvidence)),
    isEliminated: Boolean(eliminatedEvidence),
    eliminationReason: eliminatedEvidence ? `${eliminatedEvidence.requirement.label}: ${eliminatedEvidence.explanation}` : null,
    missingInformation,
    explanation: `${suitabilityScore}% match from met requirement weights; ${confidence}% confidence from requirements with explicit evidence.`,
    evidence
  }
}

const getApprovedAnalysis = async (vacancyId: number, database: Database) => {
  const analysis = await getVacancyAnalysis(vacancyId, database)
  if (!analysis || analysis.status !== 'approved') {
    throw new VacancyValidationError('A analise precisa ser aprovada antes de calcular scores.', 409)
  }
  return analysis
}

const loadProfiles = async (profileIds: number[] | undefined, database: Database) => {
  const rows = profileIds?.length
    ? await database.select().from(providerProfiles).where(inArray(providerProfiles.id, profileIds))
    : await database.select().from(providerProfiles)

  return Promise.all(rows.map(async (profile) => {
    const [version] = await database.select().from(providerProfileVersions)
      .where(eq(providerProfileVersions.profileId, profile.id))
      .orderBy(desc(providerProfileVersions.createdAt), desc(providerProfileVersions.id))
      .limit(1)

    return { profile, latestVersion: version ?? null, normalized: parseJson(version?.normalizedJson ?? null) }
  }))
}

const saveEvaluation = async (analysis: Awaited<ReturnType<typeof getApprovedAnalysis>>, profileRow: Awaited<ReturnType<typeof loadProfiles>>[number], database: Database) => {
  const calculated = calculateEvidence(analysis.requirements, {
    headline: profileRow.profile.headline,
    location: profileRow.profile.location,
    normalized: profileRow.normalized
  })

  const existing = await database.select().from(profileEvaluations)
    .where(and(eq(profileEvaluations.vacancyId, analysis.vacancyId), eq(profileEvaluations.profileId, profileRow.profile.id)))
    .limit(1)

  const values = {
    vacancyId: analysis.vacancyId,
    analysisId: analysis.id,
    profileId: profileRow.profile.id,
    suitabilityScore: calculated.suitabilityScore,
    confidence: calculated.confidence,
    category: calculated.category,
    isEliminated: calculated.isEliminated,
    eliminationReason: calculated.eliminationReason,
    missingInformationJson: JSON.stringify(calculated.missingInformation),
    explanation: calculated.explanation,
    updatedAt: sql`CURRENT_TIMESTAMP`
  }

  const [evaluation] = existing[0]
    ? await database.update(profileEvaluations).set(values).where(eq(profileEvaluations.id, existing[0].id)).returning()
    : await database.insert(profileEvaluations).values(values).returning()

  if (!evaluation) throw new VacancyValidationError('Nao foi possivel salvar o score do perfil.', 500)

  await database.delete(profileRequirementEvidence).where(eq(profileRequirementEvidence.evaluationId, evaluation.id))
  await database.insert(profileRequirementEvidence).values(calculated.evidence.map(item => ({
    evaluationId: evaluation.id,
    requirementId: item.requirement.id,
    status: item.status,
    scoreContribution: item.scoreContribution,
    confidence: item.confidence,
    evidenceText: item.evidenceText,
    explanation: item.explanation
  })))

  return evaluation.id
}

export const scoreProfilesForVacancy = async (vacancyId: number, options: { profileIds?: number[] } = {}, database: Database = defaultDb) => {
  const analysis = await getApprovedAnalysis(vacancyId, database)
  const profiles = await loadProfiles(options.profileIds, database)
  for (const profile of profiles) await saveEvaluation(analysis, profile, database)
  return listProfileEvaluations(vacancyId, database)
}

export const listProfileEvaluations = async (vacancyId: number, database: Database = defaultDb): Promise<ProfileEvaluationDetail[]> => {
  const rows = await database.select({ evaluation: profileEvaluations, profile: providerProfiles }).from(profileEvaluations)
    .innerJoin(providerProfiles, eq(providerProfiles.id, profileEvaluations.profileId))
    .innerJoin(vacancyAnalyses, eq(vacancyAnalyses.id, profileEvaluations.analysisId))
    .innerJoin(vacancies, eq(vacancies.id, profileEvaluations.vacancyId))
    .innerJoin(vacancyVersions, and(eq(vacancyVersions.id, vacancyAnalyses.vacancyVersionId), eq(vacancyVersions.id, vacancies.currentVersionId)))
    .where(eq(profileEvaluations.vacancyId, vacancyId))
    .orderBy(desc(profileEvaluations.suitabilityScore), desc(profileEvaluations.confidence), desc(profileEvaluations.id))

  return Promise.all(rows.map(async ({ evaluation, profile }) => {
    const [decision] = await database.select().from(candidateDecisions)
      .where(and(eq(candidateDecisions.vacancyId, vacancyId), eq(candidateDecisions.profileId, evaluation.profileId)))
      .limit(1)

    const evidenceRows = await database.select({ evidence: profileRequirementEvidence, requirement: vacancyAnalysisRequirements })
      .from(profileRequirementEvidence)
      .innerJoin(vacancyAnalysisRequirements, eq(vacancyAnalysisRequirements.id, profileRequirementEvidence.requirementId))
      .where(eq(profileRequirementEvidence.evaluationId, evaluation.id))

    return {
      id: evaluation.id,
      vacancyId: evaluation.vacancyId,
      analysisId: evaluation.analysisId,
      profileId: evaluation.profileId,
      profileName: profile.fullName,
      linkedinUrl: profile.linkedinUrl,
      headline: profile.headline,
      location: profile.location,
      suitabilityScore: evaluation.suitabilityScore,
      confidence: evaluation.confidence,
      category: evaluation.category as ProfileEvaluationCategory,
      isEliminated: evaluation.isEliminated,
      eliminationReason: evaluation.eliminationReason,
      missingInformation: JSON.parse(evaluation.missingInformationJson) as string[],
      explanation: evaluation.explanation,
      createdAt: evaluation.createdAt,
      updatedAt: evaluation.updatedAt,
      decision: decision ? { id: decision.id, decision: decision.decision, note: decision.note, decidedAt: decision.decidedAt } : null,
      evidence: evidenceRows.map(({ evidence, requirement }) => ({
        id: evidence.id,
        requirementId: evidence.requirementId,
        requirementLabel: requirement.label,
        requirementCategory: requirement.category,
        weight: requirement.weight,
        isEliminatory: requirement.isEliminatory,
        status: evidence.status as RequirementEvidenceStatus,
        scoreContribution: evidence.scoreContribution,
        confidence: evidence.confidence,
        evidenceText: evidence.evidenceText,
        explanation: evidence.explanation
      }))
    }
  }))
}
