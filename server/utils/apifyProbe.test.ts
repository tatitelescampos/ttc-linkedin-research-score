import { describe, expect, it, vi } from 'vitest'
import { runApifyProbe } from './apifyProbe'

describe('runApifyProbe', () => {
  it('sends a tightly capped short Apify actor request and summarizes returned fields', async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toContain('token=secret-token')
      expect(url.searchParams.get('timeout')).toBe('12')
      expect(JSON.parse(String(init?.body))).toEqual({
        searchQuery: 'operations logistics',
        profileScraperMode: 'Short',
        startPage: 1,
        takePages: 1,
        maxItems: 2
      })

      return new Response(JSON.stringify([
        {
          firstName: 'Ana',
          headline: 'Last mile operations leader',
          location: { linkedinText: 'Sao Paulo' }
        },
        {
          firstName: 'Bruno',
          headline: 'Logistics program manager',
          location: { linkedinText: 'Rio de Janeiro' }
        }
      ]), { status: 200 })
    })

    const result = await runApifyProbe({
      body: { query: ' operations logistics ', maxResults: 2, timeoutSeconds: 12 },
      token: 'secret-token',
      actorId: 'harvestapi/linkedin-profile-search',
      fetchImpl,
      now: (() => {
        const values = [1000, 1425]
        return () => values.shift() ?? 1425
      })()
    })

    expect(result.ok).toBe(true)
    expect(result.durationMs).toBe(425)
    expect(result.requested).toEqual({ query: 'operations logistics', maxResults: 2, timeoutSeconds: 12 })
    expect(result.counts).toEqual({ returnedItems: 2, fieldPaths: 4 })
    expect(result.coverage).toContainEqual({ path: '$[].firstName', count: 2, examples: ['Ana', 'Bruno'] })
    expect(result.coverage).toContainEqual({ path: '$[].location.linkedinText', count: 2, examples: ['Sao Paulo', 'Rio de Janeiro'] })
  })

  it('redacts the Apify token from failed raw text responses', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad token secret-token', { status: 401 }))

    const result = await runApifyProbe({
      body: { query: 'operations logistics', maxResults: 1, timeoutSeconds: 5 },
      token: 'secret-token',
      actorId: 'harvestapi/linkedin-profile-search',
      fetchImpl,
      now: () => 1000
    })

    expect(result.ok).toBe(false)
    expect(result.payload).toBe('bad token [redacted]')
    expect(result.error?.message).toBe('bad token [redacted]')
  })
})
