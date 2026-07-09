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
