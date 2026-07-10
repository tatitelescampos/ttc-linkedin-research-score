import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../database/schema'
import { ingestProviderProfiles } from './providerProfiles'
import { listProfileEvaluations, scoreProfilesForVacancy } from './profileScoring'
import { createVacancy } from './vacancies'
import { approveVacancyAnalysis, generateMockVacancyAnalysis } from './vacancyAnalysis'

const testDbs: Array<{ close: () => void }> = []

const createTestDb = async () => {
  const dir = join(process.cwd(), '.data', 'test-dbs', `profile-scoring-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const client = createClient({ url: `file:${join(dir, 'test.sqlite')}` })
  await client.execute(`CREATE TABLE vacancies (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,title text NOT NULL,company text NOT NULL,location text NOT NULL,source_url text,seniority text,sourcing_comment text,current_version_id integer,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_versions (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),version_number integer NOT NULL,source_type text DEFAULT 'pasted_text' NOT NULL,original_text text NOT NULL,reviewed_text text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_analyses (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),vacancy_version_id integer NOT NULL REFERENCES vacancy_versions(id),status text DEFAULT 'draft' NOT NULL,seniority text,titles_json text DEFAULT '[]' NOT NULL,locations_json text DEFAULT '[]' NOT NULL,ambiguities_json text DEFAULT '[]' NOT NULL,approved_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute('CREATE UNIQUE INDEX vacancy_analyses_vacancy_id_unique ON vacancy_analyses (vacancy_id);')
  await client.execute(`CREATE TABLE vacancy_analysis_requirements (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,analysis_id integer NOT NULL REFERENCES vacancy_analyses(id),category text NOT NULL,label text NOT NULL,normalized_label text NOT NULL,provenance text NOT NULL,weight integer DEFAULT 50 NOT NULL,is_mandatory integer DEFAULT false NOT NULL,is_eliminatory integer DEFAULT false NOT NULL,sort_order integer DEFAULT 0 NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE vacancy_analysis_runs (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL,vacancy_version_id integer NOT NULL,analysis_id integer,source text NOT NULL,status text NOT NULL,model text,cost_usd text,error_message text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE sourcing_runs (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL,sourcing_query_id integer NOT NULL,status text DEFAULT 'queued' NOT NULL,mode text DEFAULT 'mock' NOT NULL,provider_status text,returned_count integer DEFAULT 0 NOT NULL,raw_response_json text,normalized_response_json text,desired_results integer NOT NULL,threshold integer NOT NULL,profile_limit integer NOT NULL,page_limit integer NOT NULL,batch_size integer NOT NULL,cache_age_days integer NOT NULL,progress integer DEFAULT 0 NOT NULL,found_count integer DEFAULT 0 NOT NULL,saved_count integer DEFAULT 0 NOT NULL,error_message text,started_at text,completed_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE provider_profiles (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,provider text NOT NULL,provider_id text,linkedin_url text,public_identifier text,full_name text NOT NULL,headline text,location text,cache_status text DEFAULT 'fresh' NOT NULL,last_seen_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE UNIQUE INDEX provider_profiles_provider_id_unique ON provider_profiles (provider, provider_id);`)
  await client.execute(`CREATE UNIQUE INDEX provider_profiles_linkedin_url_unique ON provider_profiles (linkedin_url);`)
  await client.execute(`CREATE UNIQUE INDEX provider_profiles_public_identifier_unique ON provider_profiles (public_identifier);`)
  await client.execute(`CREATE TABLE provider_profile_versions (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,profile_id integer NOT NULL REFERENCES provider_profiles(id),source_run_id integer,raw_json text NOT NULL,normalized_json text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE provider_profile_identity_reviews (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,source_run_id integer,reason text NOT NULL,candidate_json text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE profile_evaluations (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),analysis_id integer NOT NULL REFERENCES vacancy_analyses(id),profile_id integer NOT NULL REFERENCES provider_profiles(id),suitability_score integer NOT NULL,confidence integer NOT NULL,category text NOT NULL,is_eliminated integer DEFAULT false NOT NULL,elimination_reason text,missing_information_json text DEFAULT '[]' NOT NULL,explanation text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE UNIQUE INDEX profile_evaluations_vacancy_profile_unique ON profile_evaluations (vacancy_id, profile_id);`)
  await client.execute(`CREATE TABLE profile_requirement_evidence (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,evaluation_id integer NOT NULL REFERENCES profile_evaluations(id),requirement_id integer NOT NULL REFERENCES vacancy_analysis_requirements(id),status text NOT NULL,score_contribution integer DEFAULT 0 NOT NULL,confidence integer DEFAULT 0 NOT NULL,evidence_text text,explanation text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE TABLE candidate_decisions (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL REFERENCES vacancies(id),profile_id integer NOT NULL REFERENCES provider_profiles(id),evaluation_id integer REFERENCES profile_evaluations(id),decision text DEFAULT 'undecided' NOT NULL,note text,decided_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
  await client.execute(`CREATE UNIQUE INDEX candidate_decisions_vacancy_profile_unique ON candidate_decisions (vacancy_id, profile_id);`)
  testDbs.push({ close: () => client.close() })
  return drizzle(client, { schema })
}

afterEach(() => {
  for (const testDb of testDbs.splice(0)) testDb.close()
})

const createApprovedVacancy = async () => {
  const db = await createTestDb()
  const vacancy = await createVacancy({
    title: 'Head, Last Mile Growth & Ops',
    company: 'Amazon',
    location: 'Osasco, Sao Paulo, Brazil',
    seniority: 'Head',
    description: 'The role requires English proficiency, program management, operations leadership, logistics supply chain, analytical capability, stakeholder management, and people leadership.'
  }, db)
  if (!vacancy) {
    throw new Error('Expected vacancy')
  }
  await generateMockVacancyAnalysis(vacancy.id, db)
  await approveVacancyAnalysis(vacancy.id, db)
  return { db, vacancy }
}

describe('profile scoring', () => {
  it('calculates suitability from met requirement weights and stores evidence for every requirement', async () => {
    const { db, vacancy } = await createApprovedVacancy()
    const { profiles } = await ingestProviderProfiles([{ provider: 'apify', providerId: 'ana', linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana Costa', headline: 'Operations leadership and program management in logistics supply chain', location: 'Brazil', raw: { about: 'English proficiency, analytical capability, stakeholder management, people leadership.' } }], null, db)

    const evaluations = await scoreProfilesForVacancy(vacancy.id, { profileIds: [profiles[0]!.id] }, db)

    expect(evaluations).toHaveLength(1)
    expect(evaluations[0]?.suitabilityScore).toBe(100)
    expect(evaluations[0]?.confidence).toBe(100)
    expect(evaluations[0]?.category).toBe('strong')
    expect(evaluations[0]?.evidence.length).toBeGreaterThanOrEqual(6)
    expect(evaluations[0]?.evidence.every(item => item.status === 'met')).toBe(true)
  })

  it('keeps unknown requirements inspectable without eliminating the candidate', async () => {
    const { db, vacancy } = await createApprovedVacancy()
    const { profiles } = await ingestProviderProfiles([{ provider: 'apify', providerId: 'bia', linkedinUrl: 'https://www.linkedin.com/in/bia', fullName: 'Bia Lima', headline: 'Program management for logistics supply chain', location: 'Brazil', raw: { about: 'Operations leadership and stakeholder management.' } }], null, db)

    const [evaluation] = await scoreProfilesForVacancy(vacancy.id, { profileIds: [profiles[0]!.id] }, db)

    expect(evaluation?.isEliminated).toBe(false)
    expect(evaluation?.confidence).toBeLessThan(100)
    expect(evaluation?.missingInformation).toContain('English proficiency')
    expect(evaluation?.evidence.find(item => item.requirementLabel === 'English proficiency')?.status).toBe('unknown')
  })

  it('eliminates only when an eliminatory requirement is explicitly contradicted', async () => {
    const { db, vacancy } = await createApprovedVacancy()
    const { profiles } = await ingestProviderProfiles([{ provider: 'apify', providerId: 'cao', linkedinUrl: 'https://www.linkedin.com/in/cao', fullName: 'Caio Rocha', headline: 'Program management and operations leadership', location: 'Brazil', raw: { about: 'No English proficiency. Logistics supply chain and analytical capability.' } }], null, db)

    const [evaluation] = await scoreProfilesForVacancy(vacancy.id, { profileIds: [profiles[0]!.id] }, db)

    expect(evaluation?.isEliminated).toBe(true)
    expect(evaluation?.category).toBe('eliminated')
    expect(evaluation?.eliminationReason).toContain('English proficiency')
    expect(evaluation?.evidence.find(item => item.requirementLabel === 'English proficiency')?.status).toBe('contradicted')
  })

  it('updates existing evaluations instead of duplicating them', async () => {
    const { db, vacancy } = await createApprovedVacancy()
    const { profiles } = await ingestProviderProfiles([{ provider: 'apify', providerId: 'dani', linkedinUrl: 'https://www.linkedin.com/in/dani', fullName: 'Dani Souza', headline: 'Program management', location: 'Brazil', raw: {} }], null, db)

    await scoreProfilesForVacancy(vacancy.id, { profileIds: [profiles[0]!.id] }, db)
    await scoreProfilesForVacancy(vacancy.id, { profileIds: [profiles[0]!.id] }, db)

    expect(await listProfileEvaluations(vacancy.id, db)).toHaveLength(1)
  })
})
