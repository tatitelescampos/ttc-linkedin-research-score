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
  startedAt: text('started_at'),
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
