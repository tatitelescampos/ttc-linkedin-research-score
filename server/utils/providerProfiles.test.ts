import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../database/schema'
import { ingestProviderProfiles, listProviderProfiles, normalizeLinkedInUrl, normalizePublicIdentifier } from './providerProfiles'

const testDbs: Array<{ close: () => void }> = []

const createTestDb = async () => {
  const dir = join(process.cwd(), '.data', 'test-dbs', `provider-profile-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const client = createClient({ url: `file:${join(dir, 'test.sqlite')}` })
  await client.execute(`CREATE TABLE sourcing_runs (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,vacancy_id integer NOT NULL,sourcing_query_id integer NOT NULL,status text DEFAULT 'queued' NOT NULL,mode text DEFAULT 'mock' NOT NULL,provider_status text,returned_count integer DEFAULT 0 NOT NULL,raw_response_json text,normalized_response_json text,desired_results integer NOT NULL,threshold integer NOT NULL,profile_limit integer NOT NULL,page_limit integer NOT NULL,batch_size integer NOT NULL,cache_age_days integer NOT NULL,progress integer DEFAULT 0 NOT NULL,found_count integer DEFAULT 0 NOT NULL,saved_count integer DEFAULT 0 NOT NULL,error_message text,started_at text,completed_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);`)
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
  for (const testDb of testDbs.splice(0)) testDb.close()
})

describe('provider profiles', () => {
  it('normalizes LinkedIn URLs and public slugs', () => {
    expect(normalizeLinkedInUrl('https://br.linkedin.com/in/Ana-Costa/?miniProfileUrn=x')).toBe('https://www.linkedin.com/in/ana-costa')
    expect(normalizePublicIdentifier('/Ana-Costa/')).toBe('ana-costa')
  })

  it('deduplicates by strong provider and LinkedIn identities while keeping versions', async () => {
    const db = await createTestDb()

    await ingestProviderProfiles([{ provider: 'apify', providerId: '1', linkedinUrl: 'https://www.linkedin.com/in/ana-costa', publicIdentifier: 'ana-costa', fullName: 'Ana Costa', headline: 'Head Logistics', raw: { id: 1 } }], 10, db)
    await ingestProviderProfiles([{ provider: 'apify', providerId: '1', linkedinUrl: 'https://br.linkedin.com/in/ana-costa/', publicIdentifier: 'ana-costa', fullName: 'Ana C.', headline: 'Director Logistics', raw: { id: 1, version: 2 } }], 11, db)

    const profiles = await listProviderProfiles(db)
    expect(profiles).toHaveLength(1)
    expect(profiles[0]?.fullName).toBe('Ana C.')
    expect(profiles[0]?.versions).toHaveLength(2)
  })

  it('flags uncertain identities for review instead of merging by name', async () => {
    const db = await createTestDb()

    const result = await ingestProviderProfiles([{ provider: 'apify', fullName: 'Ana Costa', headline: 'Operations', raw: { firstName: 'Ana' } }], 12, db)

    expect(result.profiles).toHaveLength(0)
    expect(result.reviews).toHaveLength(1)
    expect(result.reviews[0]?.reason).toBe('missing_strong_identity')
  })
})
