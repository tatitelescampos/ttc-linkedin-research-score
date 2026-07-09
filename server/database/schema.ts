import { sql } from 'drizzle-orm'
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
