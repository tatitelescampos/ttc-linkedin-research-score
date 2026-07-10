import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../database/schema'
import { approveVacancyAnalysis, generateMockVacancyAnalysis } from './vacancyAnalysis'
import { createVacancy } from './vacancies'
import { approveSourcingQueryDraft, assertApprovedSourcingQuery, generateMockSourcingQuery, getSourcingQueryPlan, updateSourcingQueryDraft } from './sourcingQueries'

const testDbs: Array<{ close: () => void }> = []

const createTestDb = async () => {
  const dir = join(process.cwd(), '.data', 'test-dbs', `sourcing-query-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(dir, { recursive: true })

  const client = createClient({ url: `file:${join(dir, 'test.sqlite')}` })
  await client.execute(`CREATE TABLE vacancies (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,title text NOT NULL,company text NOT NULL,location text NOT NULL,source_url text,seniority text,sourcing_comment text,current_version_id integer,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_versions (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),version_number integer NOT NULL,source_type text DEFAULT 'pasted_text' NOT NULL,original_text text NOT NULL,reviewed_text text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_analyses (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),vacancy_version_id integer NOT NULL REFERENCES vacancy_versions(id),status text DEFAULT 'draft' NOT NULL,seniority text,titles_json text DEFAULT '[]' NOT NULL,locations_json text DEFAULT '[]' NOT NULL,ambiguities_json text DEFAULT '[]' NOT NULL,approved_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute('CREATE UNIQUE INDEX vacancy_analyses_vacancy_id_unique ON vacancy_analyses (vacancy_id);')
  await client.execute(`CREATE TABLE vacancy_analysis_requirements (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,analysis_id integer NOT NULL REFERENCES vacancy_analyses(id),category text NOT NULL,label text NOT NULL,normalized_label text NOT NULL,provenance text NOT NULL,weight integer DEFAULT 50 NOT NULL,is_mandatory integer DEFAULT false NOT NULL,is_eliminatory integer DEFAULT false NOT NULL,sort_order integer DEFAULT 0 NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_analysis_runs (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),vacancy_version_id integer NOT NULL REFERENCES vacancy_versions(id),analysis_id integer REFERENCES vacancy_analyses(id),source text NOT NULL,status text NOT NULL,model text,cost_usd text,error_message text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE sourcing_queries (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),analysis_id integer NOT NULL REFERENCES vacancy_analyses(id),status text DEFAULT 'draft' NOT NULL,version_number integer,query_text text NOT NULL,provider_filters_json text DEFAULT '{}' NOT NULL,explanation text NOT NULL,assumptions_json text DEFAULT '[]' NOT NULL,limitations_json text DEFAULT '[]' NOT NULL,approved_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)

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
`

const createVacancyWithAnalysis = async (approved = true) => {
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

  await generateMockVacancyAnalysis(vacancy.id, db)
  if (approved) {
    await approveVacancyAnalysis(vacancy.id, db)
  }
  return { db, vacancy }
}

describe('sourcing queries', () => {
  it('requires an approved vacancy analysis before generating a query draft', async () => {
    const { db, vacancy } = await createVacancyWithAnalysis(false)

    await expect(generateMockSourcingQuery(vacancy.id, db)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('generates a deterministic draft from the approved analysis', async () => {
    const { db, vacancy } = await createVacancyWithAnalysis()

    const plan = await generateMockSourcingQuery(vacancy.id, db)

    expect(plan.draft).toMatchObject({ status: 'draft', versionNumber: null, canSelectForRun: false })
    expect(plan.draft?.queryText).toContain('"Head, Last Mile Growth & Ops"')
    expect(plan.draft?.queryText).toContain('"English proficiency"')
    expect(plan.draft?.providerFilters.linkedin).toEqual(expect.arrayContaining(['Osasco, Sao Paulo, Brazil', 'Head', 'language']))
    expect(plan.draft?.explanation).toContain('Query deterministica')
    expect(plan.draft?.assumptions.length).toBeGreaterThan(0)
    expect(plan.draft?.limitations.length).toBeGreaterThan(0)
  })

  it('lets recruiters edit query text and filters while retaining explanation, assumptions, and limitations', async () => {
    const { db, vacancy } = await createVacancyWithAnalysis()
    const generated = await generateMockSourcingQuery(vacancy.id, db)

    const updated = await updateSourcingQueryDraft(vacancy.id, {
      queryText: '("Head of Logistics" OR "Last Mile Director") AND English',
      providerFilters: { linkedin: ['Brazil', 'Director'], apify: ['people search'] }
    }, db)

    expect(updated.draft?.queryText).toBe('("Head of Logistics" OR "Last Mile Director") AND English')
    expect(updated.draft?.providerFilters).toEqual({ linkedin: ['Brazil', 'Director'], apify: ['people search'] })
    expect(updated.draft?.explanation).toBe(generated.draft?.explanation)
    expect(updated.draft?.assumptions).toEqual(generated.draft?.assumptions)
    expect(updated.draft?.limitations).toEqual(generated.draft?.limitations)
  })

  it('versions approved queries and only allows approved query ids to be selected for a run', async () => {
    const { db, vacancy } = await createVacancyWithAnalysis()
    const generated = await generateMockSourcingQuery(vacancy.id, db)

    await expect(assertApprovedSourcingQuery(vacancy.id, generated.draft?.id ?? 0, db)).rejects.toMatchObject({ statusCode: 409 })

    const first = await approveSourcingQueryDraft(vacancy.id, db)
    const firstApproved = first.approvedVersions[0]
    if (!firstApproved) {
      throw new Error('Expected first approved query')
    }
    expect(firstApproved).toMatchObject({ status: 'approved', versionNumber: 1, canSelectForRun: true })
    await expect(assertApprovedSourcingQuery(vacancy.id, firstApproved.id, db)).resolves.toBeUndefined()

    await updateSourcingQueryDraft(vacancy.id, { queryText: '"Operations Director" AND logistics', providerFilters: { linkedin: ['Brazil'] } }, db)
    const second = await approveSourcingQueryDraft(vacancy.id, db)

    expect(second.approvedVersions.map(version => version.versionNumber)).toEqual([2, 1])
    const latestApproved = second.approvedVersions[0]
    if (!latestApproved) {
      throw new Error('Expected latest approved query')
    }
    expect(latestApproved.queryText).toBe('"Operations Director" AND logistics')
  })

  it('returns approved versions with the vacancy plan', async () => {
    const { db, vacancy } = await createVacancyWithAnalysis()
    await generateMockSourcingQuery(vacancy.id, db)
    await approveSourcingQueryDraft(vacancy.id, db)

    const plan = await getSourcingQueryPlan(vacancy.id, db)

    expect(plan.draft?.status).toBe('draft')
    expect(plan.approvedVersions).toHaveLength(1)
    const approvedVersion = plan.approvedVersions[0]
    if (!approvedVersion) {
      throw new Error('Expected approved query version')
    }
    expect(approvedVersion.versionNumber).toBe(1)
  })
})
