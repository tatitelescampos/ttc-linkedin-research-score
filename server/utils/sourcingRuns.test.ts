import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../database/schema'
import { approveVacancyAnalysis, generateMockVacancyAnalysis } from './vacancyAnalysis'
import { createVacancy } from './vacancies'
import { approveSourcingQueryDraft, generateMockSourcingQuery } from './sourcingQueries'
import { getSourcingRuns, runApifySourcing, runMockSourcing } from './sourcingRuns'

const testDbs: Array<{ close: () => void }> = []

const createTestDb = async () => {
  const dir = join(process.cwd(), '.data', 'test-dbs', `sourcing-run-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(dir, { recursive: true })

  const client = createClient({ url: `file:${join(dir, 'test.sqlite')}` })
  await client.execute(`CREATE TABLE vacancies (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,title text NOT NULL,company text NOT NULL,location text NOT NULL,source_url text,seniority text,sourcing_comment text,current_version_id integer,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_versions (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),version_number integer NOT NULL,source_type text DEFAULT 'pasted_text' NOT NULL,original_text text NOT NULL,reviewed_text text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_analyses (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),vacancy_version_id integer NOT NULL REFERENCES vacancy_versions(id),status text DEFAULT 'draft' NOT NULL,seniority text,titles_json text DEFAULT '[]' NOT NULL,locations_json text DEFAULT '[]' NOT NULL,ambiguities_json text DEFAULT '[]' NOT NULL,approved_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute('CREATE UNIQUE INDEX vacancy_analyses_vacancy_id_unique ON vacancy_analyses (vacancy_id);')
  await client.execute(`CREATE TABLE vacancy_analysis_requirements (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,analysis_id integer NOT NULL REFERENCES vacancy_analyses(id),category text NOT NULL,label text NOT NULL,normalized_label text NOT NULL,provenance text NOT NULL,weight integer DEFAULT 50 NOT NULL,is_mandatory integer DEFAULT false NOT NULL,is_eliminatory integer DEFAULT false NOT NULL,sort_order integer DEFAULT 0 NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_analysis_runs (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),vacancy_version_id integer NOT NULL REFERENCES vacancy_versions(id),analysis_id integer REFERENCES vacancy_analyses(id),source text NOT NULL,status text NOT NULL,model text,cost_usd text,error_message text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE sourcing_queries (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),analysis_id integer NOT NULL REFERENCES vacancy_analyses(id),status text DEFAULT 'draft' NOT NULL,version_number integer,query_text text NOT NULL,provider_filters_json text DEFAULT '{}' NOT NULL,explanation text NOT NULL,assumptions_json text DEFAULT '[]' NOT NULL,limitations_json text DEFAULT '[]' NOT NULL,approved_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE sourcing_runs (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),sourcing_query_id integer NOT NULL REFERENCES sourcing_queries(id),status text DEFAULT 'queued' NOT NULL,mode text DEFAULT 'mock' NOT NULL,provider_status text,returned_count integer DEFAULT 0 NOT NULL,raw_response_json text,normalized_response_json text,desired_results integer NOT NULL,threshold integer NOT NULL,profile_limit integer NOT NULL,page_limit integer NOT NULL,batch_size integer NOT NULL,cache_age_days integer NOT NULL,progress integer DEFAULT 0 NOT NULL,found_count integer DEFAULT 0 NOT NULL,saved_count integer DEFAULT 0 NOT NULL,error_message text,started_at text,completed_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE sourcing_run_results (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,run_id integer NOT NULL REFERENCES sourcing_runs(id),rank integer NOT NULL,profile_url text NOT NULL,full_name text NOT NULL,headline text NOT NULL,location text NOT NULL,score integer NOT NULL,matched_terms_json text DEFAULT '[]' NOT NULL,summary text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE provider_profiles (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,provider text NOT NULL,provider_id text,linkedin_url text,public_identifier text,full_name text NOT NULL,headline text,location text,cache_status text DEFAULT 'fresh' NOT NULL,last_seen_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE UNIQUE INDEX provider_profiles_provider_id_unique ON provider_profiles (provider, provider_id);`)
  await client.execute(`CREATE UNIQUE INDEX provider_profiles_linkedin_url_unique ON provider_profiles (linkedin_url);`)
  await client.execute(`CREATE UNIQUE INDEX provider_profiles_public_identifier_unique ON provider_profiles (public_identifier);`)
  await client.execute(`CREATE TABLE provider_profile_versions (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,profile_id integer NOT NULL REFERENCES provider_profiles(id),source_run_id integer,raw_json text NOT NULL,normalized_json text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE provider_profile_identity_reviews (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,source_run_id integer,reason text NOT NULL,candidate_json text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)

  testDbs.push({ close: () => client.close() })
  return drizzle(client, { schema })
}

afterEach(() => {
  for (const testDb of testDbs.splice(0)) {
    testDb.close()
  }
})

const createApprovedQuery = async () => {
  const db = await createTestDb()
  const vacancy = await createVacancy({
    title: 'Head, Last Mile Growth & Ops',
    company: 'Amazon',
    location: 'Osasco, Sao Paulo, Brazil',
    seniority: 'Head',
    description: 'Amazon Logistics needs a senior operations leader for last mile growth, logistics programs, English communication, analytics, and people leadership in Brazil.'
  }, db)
  if (!vacancy) {
    throw new Error('Expected vacancy')
  }

  await generateMockVacancyAnalysis(vacancy.id, db)
  await approveVacancyAnalysis(vacancy.id, db)
  const generated = await generateMockSourcingQuery(vacancy.id, db)
  const approved = await approveSourcingQueryDraft(vacancy.id, db)
  const approvedQuery = approved.approvedVersions[0]
  if (!generated.draft || !approvedQuery) {
    throw new Error('Expected draft and approved query')
  }
  return { db, vacancy, draftQuery: generated.draft, approvedQuery }
}

describe('sourcing runs', () => {
  it('blocks mock runs for unapproved query ids', async () => {
    const { db, vacancy, draftQuery } = await createApprovedQuery()

    await expect(runMockSourcing(vacancy.id, { queryId: draftQuery.id, mode: 'mock' }, db)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('persists mock run config and synthetic profile results', async () => {
    const { db, vacancy, approvedQuery } = await createApprovedQuery()

    const run = await runMockSourcing(vacancy.id, {
      queryId: approvedQuery.id,
      desiredResults: 3,
      threshold: 82,
      profileLimit: 10,
      pageLimit: 2,
      batchSize: 2,
      cacheAgeDays: 7,
      mode: 'mock'
    }, db)

    expect(run).toMatchObject({ status: 'completed', mode: 'mock', progress: 100, savedCount: 3 })
    expect(run.config).toEqual({ desiredResults: 3, threshold: 82, profileLimit: 10, pageLimit: 2, batchSize: 2, cacheAgeDays: 7 })
    expect(run.results).toHaveLength(3)
    expect(run.results[0]).toMatchObject({ rank: 1, location: 'Osasco, Sao Paulo, Brazil' })
    expect(run.results[0]?.profileUrl).toContain('linkedin.com/in/mock')
    expect(run.results.every(result => result.score >= 82)).toBe(true)
  })

  it('returns completed runs with results after refresh', async () => {
    const { db, vacancy, approvedQuery } = await createApprovedQuery()
    const created = await runMockSourcing(vacancy.id, { queryId: approvedQuery.id, desiredResults: 2, threshold: 75, profileLimit: 5, pageLimit: 1, batchSize: 2, cacheAgeDays: 30, mode: 'mock' }, db)

    const runs = await getSourcingRuns(vacancy.id, db)

    expect(runs).toHaveLength(1)
    expect(runs[0]?.id).toBe(created.id)
    expect(runs[0]?.query.id).toBe(approvedQuery.id)
    expect(runs[0]?.results.map(result => result.rank)).toEqual([1, 2])
  })
  it('requires explicit confirmation before a live Apify run', async () => {
    const { db, vacancy, approvedQuery } = await createApprovedQuery()

    await expect(runApifySourcing(vacancy.id, { queryId: approvedQuery.id, mode: 'apify' }, db, {
      run: async () => ({ status: '200', rawItems: [] })
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('persists raw and normalized Apify responses from an approved query', async () => {
    const { db, vacancy, approvedQuery } = await createApprovedQuery()

    const run = await runApifySourcing(vacancy.id, {
      queryId: approvedQuery.id,
      desiredResults: 2,
      threshold: 70,
      profileLimit: 2,
      pageLimit: 1,
      batchSize: 2,
      cacheAgeDays: 14,
      mode: 'apify',
      confirmLive: true
    }, db, {
      run: async input => ({
        status: '200',
        rawItems: [
          {
            id: 'profile-1',
            publicIdentifier: 'ana-costa',
            linkedinUrl: 'https://www.linkedin.com/in/ana-costa',
            firstName: 'Ana',
            lastName: 'Costa',
            headline: 'Head of Last Mile Operations',
            location: { linkedinText: 'Sao Paulo, Brazil' },
            about: `Matched ${input.queryText}`,
            currentPosition: [{ position: 'Head of Logistics', companyName: 'Example Logistics', duration: '3 yrs', description: 'Last mile delivery network' }]
          }
        ]
      })
    })

    expect(run).toMatchObject({ status: 'completed', mode: 'apify', providerStatus: '200', returnedCount: 1, savedCount: 1 })
    expect(run.rawResponse).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'profile-1' })]))
    expect(run.normalizedResponse).toEqual(expect.arrayContaining([expect.objectContaining({ linkedinUrl: 'https://www.linkedin.com/in/ana-costa', fullName: 'Ana Costa' })]))
    expect(run.results).toEqual([])
  })
  it('requires explicit confirmation before a live Apify run', async () => {
    const { db, vacancy, approvedQuery } = await createApprovedQuery()

    await expect(runApifySourcing(vacancy.id, { queryId: approvedQuery.id, mode: 'apify' }, db, {
      run: async () => ({ status: '200', rawItems: [] })
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('persists raw and normalized Apify responses from an approved query', async () => {
    const { db, vacancy, approvedQuery } = await createApprovedQuery()

    const run = await runApifySourcing(vacancy.id, {
      queryId: approvedQuery.id,
      desiredResults: 2,
      threshold: 70,
      profileLimit: 2,
      pageLimit: 1,
      batchSize: 2,
      cacheAgeDays: 14,
      mode: 'apify',
      confirmLive: true
    }, db, {
      run: async input => ({
        status: '200',
        rawItems: [
          {
            id: 'profile-1',
            publicIdentifier: 'ana-costa',
            linkedinUrl: 'https://www.linkedin.com/in/ana-costa',
            firstName: 'Ana',
            lastName: 'Costa',
            headline: 'Head of Last Mile Operations',
            location: { linkedinText: 'Sao Paulo, Brazil' },
            about: `Matched ${input.queryText}`,
            currentPosition: [{ position: 'Head of Logistics', companyName: 'Example Logistics', duration: '3 yrs', description: 'Last mile delivery network' }]
          }
        ]
      })
    })

    expect(run).toMatchObject({ status: 'completed', mode: 'apify', providerStatus: '200', returnedCount: 1, savedCount: 1 })
    expect(run.rawResponse).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'profile-1' })]))
    expect(run.normalizedResponse).toEqual(expect.arrayContaining([expect.objectContaining({ linkedinUrl: 'https://www.linkedin.com/in/ana-costa', fullName: 'Ana Costa' })]))
    expect(run.results).toEqual([])
  })
})
