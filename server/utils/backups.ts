import { createClient } from '@libsql/client'
import { VacancyValidationError } from './vacancies'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? 'file:.data/app.sqlite'

const tables = [
  'vacancies',
  'vacancy_versions',
  'vacancy_analyses',
  'vacancy_analysis_requirements',
  'vacancy_analysis_runs',
  'sourcing_queries',
  'sourcing_runs',
  'sourcing_run_results',
  'provider_profiles',
  'provider_profile_versions',
  'provider_profile_identity_reviews',
  'profile_evaluations',
  'profile_requirement_evidence',
  'candidate_decisions'
]

const quote = (name: string) => `\`${name}\``

const client = () => createClient({ url: databaseUrl })

export const createBackup = async () => {
  const db = client()
  try {
    const data: Record<string, unknown[]> = {}
    for (const table of tables) {
      const result = await db.execute(`SELECT * FROM ${quote(table)}`)
      data[table] = result.rows as unknown[]
    }
    return { version: 1, createdAt: new Date().toISOString(), tables: data }
  } finally {
    db.close()
  }
}

export const restoreBackup = async (backup: unknown) => {
  if (!backup || typeof backup !== 'object' || !('tables' in backup) || typeof backup.tables !== 'object' || !backup.tables) {
    throw new VacancyValidationError('Backup invalido.')
  }

  const rowsByTable = backup.tables as Record<string, unknown>
  const db = client()
  try {
    for (const table of [...tables].reverse()) {
      await db.execute(`DELETE FROM ${quote(table)}`)
    }

    for (const table of tables) {
      const rows = Array.isArray(rowsByTable[table]) ? rowsByTable[table] as Record<string, unknown>[] : []
      for (const row of rows) {
        const columns = Object.keys(row)
        if (!columns.length) continue
        const placeholders = columns.map(() => '?').join(', ')
        await db.execute({
          sql: `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${placeholders})`,
          args: columns.map(column => row[column] as string | number | null)
        })
      }
    }
    return { restoredTables: tables.length }
  } finally {
    db.close()
  }
}
