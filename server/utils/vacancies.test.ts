import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../database/schema'
import { createVacancy, listVacancies, VacancyValidationError } from './vacancies'

const testDbs: Array<{ dir: string, close: () => void }> = []

const createTestDb = async () => {
  const dir = join(process.cwd(), '.data', 'test-dbs', `vacancies-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(dir, { recursive: true })

  const client = createClient({ url: `file:${join(dir, 'test.sqlite')}` })
  await client.execute(`
    CREATE TABLE vacancies (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      title text NOT NULL,
      company text NOT NULL,
      location text NOT NULL,
      source_url text,
      seniority text,
      sourcing_comment text,
      current_version_id integer,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `)
  await client.execute(`
    CREATE TABLE vacancy_versions (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      vacancy_id integer NOT NULL REFERENCES vacancies(id),
      version_number integer NOT NULL,
      source_type text DEFAULT 'pasted_text' NOT NULL,
      original_text text NOT NULL,
      reviewed_text text NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `)

  testDbs.push({ dir, close: () => client.close() })

  return drizzle(client, { schema })
}

afterEach(() => {
  for (const testDb of testDbs.splice(0)) {
    testDb.close()
  }
})

const amazonDescription = `
Head, Last Mile Growth & Ops, AMZL Brazil
Amazon Logistics is looking for a senior operations leader to grow delivery network capacity, improve last mile performance, manage cross-functional stakeholders, lead people, and scale logistics programs in Brazil.
The role requires strong program management, operations leadership, English, analytical capability, and experience with logistics, delivery partners, transportation, or supply chain operations.
`

describe('vacancies', () => {
  it('creates a vacancy with an immutable initial pasted-text version', async () => {
    const db = await createTestDb()

    const vacancy = await createVacancy({
      title: 'Head, Last Mile Growth & Ops',
      company: 'Amazon',
      location: 'Osasco, S�o Paulo, Brazil',
      sourceUrl: 'https://www.amazon.jobs/pt/jobs/10464027/head-last-mile-growth-ops-amzl-brazil',
      seniority: 'Head',
      sourcingComment: 'Representative Amazon test vacancy',
      description: amazonDescription
    }, db)

    expect(vacancy?.id).toBe(1)
    expect(vacancy?.title).toBe('Head, Last Mile Growth & Ops')
    expect(vacancy?.sourceUrl).toBe('https://www.amazon.jobs/pt/jobs/10464027/head-last-mile-growth-ops-amzl-brazil')
    expect(vacancy?.currentVersion?.versionNumber).toBe(1)
    expect(vacancy?.currentVersion?.sourceType).toBe('pasted_text')
    expect(vacancy?.currentVersion?.originalText).toBe(amazonDescription.trim())
    expect(vacancy?.versions).toHaveLength(1)
  })

  it('lists created vacancies with searchable previews instead of full descriptions', async () => {
    const db = await createTestDb()

    await createVacancy({
      title: 'Head, Last Mile Growth & Ops',
      company: 'Amazon',
      location: 'Osasco, S�o Paulo, Brazil',
      description: amazonDescription
    }, db)
    await createVacancy({
      title: 'Finance Manager',
      company: 'Example Corp',
      location: 'S�o Paulo, Brazil',
      description: 'Finance role with enough text to pass validation and no logistics signal at all.'
    }, db)

    const all = await listVacancies({}, db)
    const filtered = await listVacancies({ search: 'last mile' }, db)

    expect(all).toHaveLength(2)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.company).toBe('Amazon')
    expect(filtered[0]?.descriptionPreview).toContain('Head, Last Mile Growth')
    expect(filtered[0]).not.toHaveProperty('currentVersion')
  })

  it('preserves raw extracted PDF text separately from reviewed vacancy text', async () => {
    const db = await createTestDb()
    const extractedText = `${amazonDescription}\nExtraction footer noise`
    const reviewedText = amazonDescription

    const vacancy = await createVacancy({
      title: 'Head, Last Mile Growth & Ops',
      company: 'Amazon',
      location: 'Osasco, S�o Paulo, Brazil',
      sourceType: 'pdf_upload',
      originalDescription: extractedText,
      description: reviewedText
    }, db)

    expect(vacancy?.currentVersion?.sourceType).toBe('pdf_upload')
    expect(vacancy?.currentVersion?.originalText).toBe(extractedText.trim())
    expect(vacancy?.currentVersion?.reviewedText).toBe(reviewedText.trim())
  })

  it('rejects incomplete pasted vacancy text before writing', async () => {
    const db = await createTestDb()

    await expect(createVacancy({
      title: 'Tiny role',
      company: 'Amazon',
      location: 'Brazil',
      description: 'too short'
    }, db)).rejects.toBeInstanceOf(VacancyValidationError)

    expect(await listVacancies({}, db)).toHaveLength(0)
  })
})
