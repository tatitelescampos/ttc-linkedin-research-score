const MAX_RESULTS = 5
const MAX_TIMEOUT_SECONDS = 60
const DEFAULT_ACTOR_ID = 'harvestapi/linkedin-profile-search'

type ApifyProbeBody = { query?: unknown, maxResults?: unknown, timeoutSeconds?: unknown }
type CoverageField = { path: string, count: number, examples: string[] }
type ProbeInput = { query: string, maxResults: number, timeoutSeconds: number }

type ProbeFetch = (url: URL, init?: RequestInit) => Promise<Response>

type RunApifyProbeOptions = {
  body: ApifyProbeBody
  token: string
  actorId?: string
  fetchImpl?: ProbeFetch
  now?: () => number
}

export class ApifyProbeInputError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message)
  }
}

const redactToken = (value: string, token?: string) => {
  let redacted = value.replace(/token=[^&\s"]+/gi, 'token=[redacted]')
  if (token) redacted = redacted.split(token).join('[redacted]')
  return redacted
}

const toSafeText = (value: unknown) => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${value.length})`
  if (typeof value === 'object') return 'object'
  const text = String(value)
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

const collectCoverage = (value: unknown, fields = new Map<string, CoverageField>(), path = '$') => {
  if (Array.isArray(value)) {
    value.forEach(item => collectCoverage(item, fields, `${path}[]`))
    return fields
  }
  if (!value || typeof value !== 'object') return fields

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`
    const field = fields.get(childPath) ?? { path: childPath, count: 0, examples: [] }
    field.count += 1
    if (field.examples.length < 3) field.examples.push(toSafeText(child))
    fields.set(childPath, field)
    collectCoverage(child, fields, childPath)
  }

  return fields
}

const parseProbeBody = (body: ApifyProbeBody): ProbeInput => {
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const maxResults = Number(body.maxResults ?? 3)
  const timeoutSeconds = Number(body.timeoutSeconds ?? 30)

  if (query.length < 3) {
    throw new ApifyProbeInputError('Informe uma consulta de teste com pelo menos 3 caracteres.')
  }
  if (!Number.isFinite(maxResults) || maxResults < 1 || maxResults > MAX_RESULTS) {
    throw new ApifyProbeInputError(`O limite deve ficar entre 1 e ${MAX_RESULTS} perfis.`)
  }
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 5 || timeoutSeconds > MAX_TIMEOUT_SECONDS) {
    throw new ApifyProbeInputError(`O tempo limite deve ficar entre 5 e ${MAX_TIMEOUT_SECONDS} segundos.`)
  }

  return { query, maxResults: Math.floor(maxResults), timeoutSeconds: Math.floor(timeoutSeconds) }
}

export const runApifyProbe = async ({
  body,
  token,
  actorId = DEFAULT_ACTOR_ID,
  fetchImpl = fetch,
  now = Date.now
}: RunApifyProbeOptions) => {
  const startedAt = now()
  const input = parseProbeBody(body)
  const actorPath = encodeURIComponent(actorId).replace('%2F', '~')
  const url = new URL(`https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items`)
  url.searchParams.set('token', token)
  url.searchParams.set('timeout', String(input.timeoutSeconds))
  url.searchParams.set('memory', '256')
  url.searchParams.set('clean', 'true')
  url.searchParams.set('format', 'json')

  const requestBody = {
    searchQuery: input.query,
    profileScraperMode: 'Short',
    startPage: 1,
    takePages: 1,
    maxItems: input.maxResults
  }

  try {
    const response = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody) })
    const sanitizedText = redactToken(await response.text(), token)
    let payload: unknown = sanitizedText
    try {
      payload = JSON.parse(sanitizedText)
    } catch {
      payload = sanitizedText
    }

    const items = Array.isArray(payload) ? payload : []
    const coverage = [...collectCoverage(items).values()]
      .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
      .slice(0, 80)

    return {
      ok: response.ok,
      status: response.status,
      actorId,
      durationMs: now() - startedAt,
      requested: input,
      counts: { returnedItems: items.length, fieldPaths: coverage.length },
      costs: {
        source: 'Apify run-sync dataset response',
        availableInPayload: coverage.some(field => /cost|charge|price|usage|compute|cu/i.test(field.path)),
        note: 'Custos detalhados podem depender das APIs de execucao/usage da Apify e do ator usado.'
      },
      coverage,
      payload,
      error: response.ok ? null : { message: typeof payload === 'string' ? payload : 'A Apify retornou uma resposta de erro.', status: response.status }
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      actorId,
      durationMs: now() - startedAt,
      requested: input,
      counts: { returnedItems: 0, fieldPaths: 0 },
      costs: { source: 'Apify request', availableInPayload: false, note: 'A chamada falhou antes de obter dados de custo.' },
      coverage: [],
      payload: null,
      error: { message: error instanceof Error ? redactToken(error.message, token) : 'Falha desconhecida ao chamar a Apify.', status: 0 }
    }
  }
}
