import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../database/schema'
import { createVacancy, VacancyValidationError } from './vacancies'
import { approveVacancyAnalysis, assertApprovedVacancyAnalysis, generateMockVacancyAnalysis, updateVacancyAnalysis } from './vacancyAnalysis'

const testDbs: Array<{ close: () => void }> = []

const createTestDb = async () => {
  const dir = join(process.cwd(), '.data', 'test-dbs', `analysis-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(dir, { recursive: true })

  const client = createClient({ url: `file:${join(dir, 'test.sqlite')}` })
  await client.execute(`CREATE TABLE vacancies (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,title text NOT NULL,company text NOT NULL,location text NOT NULL,source_url text,seniority text,sourcing_comment text,current_version_id integer,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_versions (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),version_number integer NOT NULL,source_type text DEFAULT 'pasted_text' NOT NULL,original_text text NOT NULL,reviewed_text text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_analyses (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),vacancy_version_id integer NOT NULL REFERENCES vacancy_versions(id),status text DEFAULT 'draft' NOT NULL,seniority text,titles_json text DEFAULT '[]' NOT NULL,locations_json text DEFAULT '[]' NOT NULL,ambiguities_json text DEFAULT '[]' NOT NULL,approved_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute('CREATE UNIQUE INDEX vacancy_analyses_vacancy_id_unique ON vacancy_analyses (vacancy_id);')
  await client.execute(`CREATE TABLE vacancy_analysis_requirements (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,analysis_id integer NOT NULL REFERENCES vacancy_analyses(id),category text NOT NULL,label text NOT NULL,normalized_label text NOT NULL,provenance text NOT NULL,weight integer DEFAULT 50 NOT NULL,is_mandatory integer DEFAULT false NOT NULL,is_eliminatory integer DEFAULT false NOT NULL,sort_order integer DEFAULT 0 NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)

  testDbs.push({ close: () => client.close() })

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
Preferred experience with ambiguous marketplace launches is helpful.
`

const createAnalyzedVacancy = async () => {
  const db = await createTestDb()
  const vacancy = await createVacancy({
    title: 'Head, Last Mile Growth & Ops',
    company: 'Amazon',
    location: 'Osasco, Sao Paulo, Brazil',
    seniority: 'Head',
    description: amazonDescription
  }, db)

  if (!vacancy) {
    throw new Error('Expected vacancy')
  }

  return { db, vacancy }
}

describe('vacancy analysis', () => {
  it('generates a deterministic mock analysis with requirements, provenance, weights, settings, seniority, titles, locations, and ambiguities', async () => {
    const { db, vacancy } = await createAnalyzedVacancy()

    const analysis = await generateMockVacancyAnalysis(vacancy.id, db)

    expect(analysis?.status).toBe('draft')
    expect(analysis?.canMoveForward).toBe(false)
    expect(analysis?.seniority).toBe('Head')
    expect(analysis?.titles).toContain('Head, Last Mile Growth & Ops')
    expect(analysis?.locations).toEqual(expect.arrayContaining(['Osasco, Sao Paulo, Brazil', 'Brazil']))
    expect(analysis?.ambiguities).toContain('Some requirements are phrased as preferred or equivalent, so recruiter review is needed.')

    const english = analysis?.requirements.find(requirement => requirement.normalizedLabel === 'english proficiency')
    expect(english).toMatchObject({ category: 'language', label: 'English proficiency', weight: 70, isMandatory: true, isEliminatory: true })
    expect(english?.provenance).toContain('English')
    expect(analysis?.requirements.map(requirement => requirement.normalizedLabel)).toEqual(expect.arrayContaining([
      'program management',
      'operations leadership',
      'logistics supply chain',
      'analytical capability',
      'stakeholder management',
      'people leadership'
    ]))
  })

  it('lets recruiters edit, add, remove, and normalize requirements while returning the analysis to draft', async () => {
    const { db, vacancy } = await createAnalyzedVacancy()
    const generated = await generateMockVacancyAnalysis(vacancy.id, db)

    await approveVacancyAnalysis(vacancy.id, db)

    const updated = await updateVacancyAnalysis(vacancy.id, {
      seniority: 'Director',
      titles: ['Director, Last Mile Operations'],
      locations: ['Sao Paulo, Brazil', 'Remote Brazil'],
      ambiguities: ['Confirm whether remote Brazil is allowed.'],
      requirements: [
        {
          ...generated?.requirements[0],
          label: 'Scaled logistics program management',
          normalizedLabel: 'logistics program management',
          weight: 95,
          isMandatory: true,
          isEliminatory: true
        },
        {
          category: 'tooling',
          label: 'SQL dashboards',
          normalizedLabel: '',
          provenance: 'Recruiter added from intake call.',
          weight: 40,
          isMandatory: false,
          isEliminatory: false
        }
      ]
    }, db)

    expect(updated?.status).toBe('draft')
    expect(updated?.canMoveForward).toBe(false)
    expect(updated?.approvedAt).toBeNull()
    expect(updated?.seniority).toBe('Director')
    expect(updated?.requirements).toHaveLength(2)
    expect(updated?.requirements[0]).toMatchObject({ label: 'Scaled logistics program management', normalizedLabel: 'logistics program management', weight: 95, isEliminatory: true })
    expect(updated?.requirements[1]).toMatchObject({ label: 'SQL dashboards', normalizedLabel: 'sql dashboards' })
  })

  it('blocks forward movement until the edited analysis is explicitly approved', async () => {
    const { db, vacancy } = await createAnalyzedVacancy()
    await generateMockVacancyAnalysis(vacancy.id, db)

    await expect(assertApprovedVacancyAnalysis(vacancy.id, db)).rejects.toMatchObject({ statusCode: 409 })

    const approved = await approveVacancyAnalysis(vacancy.id, db)

    expect(approved?.status).toBe('approved')
    expect(approved?.canMoveForward).toBe(true)
    await expect(assertApprovedVacancyAnalysis(vacancy.id, db)).resolves.toBeUndefined()
  })

  it('rejects approval when all requirements were removed', async () => {
    const { db, vacancy } = await createAnalyzedVacancy()
    const generated = await generateMockVacancyAnalysis(vacancy.id, db)

    await updateVacancyAnalysis(vacancy.id, {
      seniority: generated?.seniority,
      titles: generated?.titles,
      locations: generated?.locations,
      ambiguities: generated?.ambiguities,
      requirements: []
    }, db)

    await expect(approveVacancyAnalysis(vacancy.id, db)).rejects.toBeInstanceOf(VacancyValidationError)
  })
})
