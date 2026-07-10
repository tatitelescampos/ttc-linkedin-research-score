import { sql } from 'drizzle-orm'
import { int, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const researchItems = sqliteTable('research_items', {
  id: int().primaryKey({ autoIncrement: true }),
  linkedinUrl: text('linkedin_url').notNull().unique(),
  title: text().notNull(),
  score: int().notNull().default(0),
  notes: text(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

export const vacancies = sqliteTable('vacancies', {
  id: int().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  company: text().notNull(),
  location: text().notNull(),
  sourceUrl: text('source_url'),
  seniority: text(),
  sourcingComment: text('sourcing_comment'),
  currentVersionId: int('current_version_id'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

export const vacancyVersions = sqliteTable('vacancy_versions', {
  id: int().primaryKey({ autoIncrement: true }),
  vacancyId: int('vacancy_id').notNull().references(() => vacancies.id),
  versionNumber: int('version_number').notNull(),
  sourceType: text('source_type').notNull().default('pasted_text'),
  originalText: text('original_text').notNull(),
  reviewedText: text('reviewed_text').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

export const vacancyAnalyses = sqliteTable('vacancy_analyses', {
  id: int().primaryKey({ autoIncrement: true }),
  vacancyId: int('vacancy_id').notNull().references(() => vacancies.id),
  vacancyVersionId: int('vacancy_version_id').notNull().references(() => vacancyVersions.id),
  status: text().notNull().default('draft'),
  seniority: text(),
  titlesJson: text('titles_json').notNull().default('[]'),
  locationsJson: text('locations_json').notNull().default('[]'),
  ambiguitiesJson: text('ambiguities_json').notNull().default('[]'),
  approvedAt: text('approved_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => [
  uniqueIndex('vacancy_analyses_vacancy_id_unique').on(table.vacancyId)
])

export const vacancyAnalysisRequirements = sqliteTable('vacancy_analysis_requirements', {
  id: int().primaryKey({ autoIncrement: true }),
  analysisId: int('analysis_id').notNull().references(() => vacancyAnalyses.id),
  category: text().notNull(),
  label: text().notNull(),
  normalizedLabel: text('normalized_label').notNull(),
  provenance: text().notNull(),
  weight: int().notNull().default(50),
  isMandatory: int('is_mandatory', { mode: 'boolean' }).notNull().default(false),
  isEliminatory: int('is_eliminatory', { mode: 'boolean' }).notNull().default(false),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

export const vacancyAnalysisRuns = sqliteTable('vacancy_analysis_runs', {
  id: int().primaryKey({ autoIncrement: true }),
  vacancyId: int('vacancy_id').notNull().references(() => vacancies.id),
  vacancyVersionId: int('vacancy_version_id').notNull().references(() => vacancyVersions.id),
  analysisId: int('analysis_id').references(() => vacancyAnalyses.id),
  source: text().notNull(),
  status: text().notNull(),
  model: text(),
  costUsd: text('cost_usd'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

export const sourcingQueries = sqliteTable('sourcing_queries', {
  id: int().primaryKey({ autoIncrement: true }),
  vacancyId: int('vacancy_id').notNull().references(() => vacancies.id),
  analysisId: int('analysis_id').notNull().references(() => vacancyAnalyses.id),
  status: text().notNull().default('draft'),
  versionNumber: int('version_number'),
  queryText: text('query_text').notNull(),
  providerFiltersJson: text('provider_filters_json').notNull().default('{}'),
  explanation: text().notNull(),
  assumptionsJson: text('assumptions_json').notNull().default('[]'),
  limitationsJson: text('limitations_json').notNull().default('[]'),
  approvedAt: text('approved_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})
export const sourcingRuns = sqliteTable('sourcing_runs', {
  id: int().primaryKey({ autoIncrement: true }),
  vacancyId: int('vacancy_id').notNull().references(() => vacancies.id),
  sourcingQueryId: int('sourcing_query_id').notNull().references(() => sourcingQueries.id),
  status: text().notNull().default('queued'),
  mode: text().notNull().default('mock'),
  providerStatus: text('provider_status'),
  returnedCount: int('returned_count').notNull().default(0),
  rawResponseJson: text('raw_response_json'),
  normalizedResponseJson: text('normalized_response_json'),
  desiredResults: int('desired_results').notNull(),
  threshold: int().notNull(),
  profileLimit: int('profile_limit').notNull(),
  pageLimit: int('page_limit').notNull(),
  batchSize: int('batch_size').notNull(),
  cacheAgeDays: int('cache_age_days').notNull(),
  progress: int().notNull().default(0),
  foundCount: int('found_count').notNull().default(0),
  savedCount: int('saved_count').notNull().default(0),
  errorMessage: text('error_message'),
  stopReason: text('stop_reason'),
  startedAt: text('started_at'),
  stoppedAt: text('stopped_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

export const sourcingRunResults = sqliteTable('sourcing_run_results', {
  id: int().primaryKey({ autoIncrement: true }),
  runId: int('run_id').notNull().references(() => sourcingRuns.id),
  rank: int().notNull(),
  profileUrl: text('profile_url').notNull(),
  fullName: text('full_name').notNull(),
  headline: text().notNull(),
  location: text().notNull(),
  score: int().notNull(),
  matchedTermsJson: text('matched_terms_json').notNull().default('[]'),
  summary: text().notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

export const providerProfiles = sqliteTable('provider_profiles', {
  id: int().primaryKey({ autoIncrement: true }),
  provider: text().notNull(),
  providerId: text('provider_id'),
  linkedinUrl: text('linkedin_url'),
  publicIdentifier: text('public_identifier'),
  fullName: text('full_name').notNull(),
  headline: text(),
  location: text(),
  cacheStatus: text('cache_status').notNull().default('fresh'),
  lastSeenAt: text('last_seen_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => [
  uniqueIndex('provider_profiles_provider_id_unique').on(table.provider, table.providerId),
  uniqueIndex('provider_profiles_linkedin_url_unique').on(table.linkedinUrl),
  uniqueIndex('provider_profiles_public_identifier_unique').on(table.publicIdentifier)
])

export const providerProfileVersions = sqliteTable('provider_profile_versions', {
  id: int().primaryKey({ autoIncrement: true }),
  profileId: int('profile_id').notNull().references(() => providerProfiles.id),
  sourceRunId: int('source_run_id').references(() => sourcingRuns.id),
  rawJson: text('raw_json').notNull(),
  normalizedJson: text('normalized_json').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

export const providerProfileIdentityReviews = sqliteTable('provider_profile_identity_reviews', {
  id: int().primaryKey({ autoIncrement: true }),
  sourceRunId: int('source_run_id').references(() => sourcingRuns.id),
  reason: text().notNull(),
  candidateJson: text('candidate_json').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})
export const profileEvaluations = sqliteTable('profile_evaluations', {
  id: int().primaryKey({ autoIncrement: true }),
  vacancyId: int('vacancy_id').notNull().references(() => vacancies.id),
  analysisId: int('analysis_id').notNull().references(() => vacancyAnalyses.id),
  profileId: int('profile_id').notNull().references(() => providerProfiles.id),
  suitabilityScore: int('suitability_score').notNull(),
  confidence: int().notNull(),
  category: text().notNull(),
  isEliminated: int('is_eliminated', { mode: 'boolean' }).notNull().default(false),
  eliminationReason: text('elimination_reason'),
  missingInformationJson: text('missing_information_json').notNull().default('[]'),
  explanation: text().notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => [
  uniqueIndex('profile_evaluations_vacancy_profile_unique').on(table.vacancyId, table.profileId)
])

export const profileRequirementEvidence = sqliteTable('profile_requirement_evidence', {
  id: int().primaryKey({ autoIncrement: true }),
  evaluationId: int('evaluation_id').notNull().references(() => profileEvaluations.id),
  requirementId: int('requirement_id').notNull().references(() => vacancyAnalysisRequirements.id),
  status: text().notNull(),
  scoreContribution: int('score_contribution').notNull().default(0),
  confidence: int().notNull().default(0),
  evidenceText: text('evidence_text'),
  explanation: text().notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})
export const candidateDecisions = sqliteTable('candidate_decisions', {
  id: int().primaryKey({ autoIncrement: true }),
  vacancyId: int('vacancy_id').notNull().references(() => vacancies.id),
  profileId: int('profile_id').notNull().references(() => providerProfiles.id),
  evaluationId: int('evaluation_id').references(() => profileEvaluations.id),
  decision: text().notNull().default('undecided'),
  note: text(),
  decidedAt: text('decided_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => [
  uniqueIndex('candidate_decisions_vacancy_profile_unique').on(table.vacancyId, table.profileId)
])
