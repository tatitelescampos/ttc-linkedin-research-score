import { eq, or, sql } from 'drizzle-orm'
import { providerProfileIdentityReviews, providerProfiles, providerProfileVersions } from '../database/schema'
import { db as defaultDb } from './db'

type Database = typeof defaultDb

type ProviderProfileCandidate = {
  provider?: unknown
  providerId?: unknown
  linkedinUrl?: unknown
  publicIdentifier?: unknown
  fullName?: unknown
  headline?: unknown
  location?: unknown
  raw?: unknown
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export const normalizeLinkedInUrl = (value: unknown) => {
  const url = text(value)
    .replace(/^http:\/\//i, 'https://')
    .replace(/\?.*$/, '')
    .replace(/\/$/, '')
  if (!url) return null
  const match = url.match(/^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#]+)/i)
  const slug = match?.[1]
  return slug ? `https://www.linkedin.com/in/${slug.toLowerCase()}` : url.toLowerCase()
}

export const normalizePublicIdentifier = (value: unknown) => {
  const slug = text(value).replace(/^\/+|\/+$/g, '').toLowerCase()
  return slug || null
}

const parseIncompleteDate = (value: unknown) => {
  const raw = text(value)
  if (!raw) return null
  const year = raw.match(/\b(19|20)\d{2}\b/)?.[0]
  return year ? { raw, year: Number(year), complete: /\b\d{1,2}\b/.test(raw) } : { raw, year: null, complete: false }
}

const normalizeCandidate = (candidate: ProviderProfileCandidate) => {
  const provider = text(candidate.provider) || 'apify'
  const providerId = text(candidate.providerId) || null
  const linkedinUrl = normalizeLinkedInUrl(candidate.linkedinUrl)
  const publicIdentifier = normalizePublicIdentifier(candidate.publicIdentifier ?? linkedinUrl?.split('/in/')[1])
  const fullName = text(candidate.fullName) || 'Unknown profile'
  const raw = candidate.raw ?? candidate

  return {
    provider,
    providerId,
    linkedinUrl,
    publicIdentifier,
    fullName,
    headline: text(candidate.headline) || null,
    location: text(candidate.location) || null,
    raw,
    incompleteDates: JSON.stringify(raw).match(/\b(19|20)\d{2}\b/g)?.map(parseIncompleteDate) ?? []
  }
}

const findExistingProfile = async (candidate: ReturnType<typeof normalizeCandidate>, database: Database) => {
  const clauses = []
  if (candidate.providerId) clauses.push(eq(providerProfiles.providerId, candidate.providerId))
  if (candidate.linkedinUrl) clauses.push(eq(providerProfiles.linkedinUrl, candidate.linkedinUrl))
  if (candidate.publicIdentifier) clauses.push(eq(providerProfiles.publicIdentifier, candidate.publicIdentifier))
  if (!clauses.length) return null

  const [profile] = await database.select().from(providerProfiles).where(or(...clauses)).limit(1)
  return profile ?? null
}

export const ingestProviderProfiles = async (candidates: ProviderProfileCandidate[], sourceRunId: number | null = null, database: Database = defaultDb) => {
  const profiles = []
  const reviews = []

  for (const input of candidates) {
    const candidate = normalizeCandidate(input)
    if (!candidate.providerId && !candidate.linkedinUrl && !candidate.publicIdentifier) {
      const [review] = await database.insert(providerProfileIdentityReviews).values({
        sourceRunId,
        reason: 'missing_strong_identity',
        candidateJson: JSON.stringify(candidate)
      }).returning()
      if (review) reviews.push(review)
      continue
    }

    const existing = await findExistingProfile(candidate, database)
    const values = {
      provider: candidate.provider,
      providerId: candidate.providerId,
      linkedinUrl: candidate.linkedinUrl,
      publicIdentifier: candidate.publicIdentifier,
      fullName: candidate.fullName,
      headline: candidate.headline,
      location: candidate.location,
      cacheStatus: 'fresh',
      lastSeenAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`
    }
    const [profile] = existing
      ? await database.update(providerProfiles).set(values).where(eq(providerProfiles.id, existing.id)).returning()
      : await database.insert(providerProfiles).values(values).returning()

    if (!profile) continue
    await database.insert(providerProfileVersions).values({
      profileId: profile.id,
      sourceRunId,
      rawJson: JSON.stringify(candidate.raw),
      normalizedJson: JSON.stringify(candidate)
    })
    profiles.push(profile)
  }

  return { profiles, reviews }
}

export const listProviderProfiles = async (database: Database = defaultDb) => {
  const rows = await database.select().from(providerProfiles)
  return Promise.all(rows.map(async (profile) => {
    const versions = await database.select().from(providerProfileVersions).where(eq(providerProfileVersions.profileId, profile.id))
    return { ...profile, versions }
  }))
}
