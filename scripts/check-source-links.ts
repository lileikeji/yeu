import './load-env'
import { pathToFileURL } from 'node:url'
import { eq } from 'drizzle-orm'
import { sources } from '../server/database/schema'
import { closeDatabase, getDatabase } from '../server/database/client'
import {
  assertSafeResolvedPublicHttpUrl,
  parseSafePublicHttpUrl,
  type HostnameLookup
} from '../shared/utils/public-http-url'

const DEFAULT_CONCURRENCY = 4
const DEFAULT_TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 5
const USER_AGENT = 'YEU-Freshman-Guide-Source-Check/0.1 (+https://gitee.com/lilei1529/yeu)'

export type SourceLinkState = 'healthy' | 'broken' | 'warning' | 'unavailable' | 'invalid'

export interface SourceLinkInput {
  id: string
  title: string
  url: string
}

export interface SourceLinkResult extends SourceLinkInput {
  state: SourceLinkState
  status: number | null
  finalUrl: string | null
  method: 'HEAD' | 'GET' | null
  durationMs: number
  message: string | null
}

export interface SourceLinkCheckOptions {
  concurrency?: number
  timeoutMs?: number
  /**
   * Allow loopback/private destinations. Default false (SSRF-safe for ops).
   * Enable only for local unit tests.
   */
  allowPrivateNetwork?: boolean
  /** Injected DNS resolver for tests (rebinding gate). */
  lookup?: HostnameLookup
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value)) return fallback
  return Math.max(minimum, Math.min(maximum, value!))
}

function stateForStatus(status: number): SourceLinkState {
  if (status >= 200 && status < 400) return 'healthy'
  if (status === 404 || status === 410) return 'broken'
  return 'warning'
}

async function validPublicUrl(
  value: string,
  allowPrivateNetwork = false,
  lookup?: HostnameLookup
): Promise<URL | null> {
  // Sync string policy first (cheap). Resolved DNS rebinding check is for hops we will fetch.
  if (!parseSafePublicHttpUrl(value, { allowPrivateNetwork })) return null
  try {
    return await assertSafeResolvedPublicHttpUrl(value, { allowPrivateNetwork, lookup })
  } catch {
    return null
  }
}

async function requestOnce(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  fetcher: typeof fetch
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetcher(url, {
      method,
      // Manual redirects so each hop can be re-validated against the public URL policy.
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
        ...(method === 'GET' ? { Range: 'bytes=0-0' } : {})
      }
    })
    if (method === 'GET') void response.body?.cancel()
    return response
  } finally {
    clearTimeout(timeout)
  }
}

async function request(
  startUrl: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  fetcher: typeof fetch,
  allowPrivateNetwork: boolean,
  lookup?: HostnameLookup
): Promise<{ response: Response, finalUrl: string }> {
  let current = startUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const safe = await validPublicUrl(current, allowPrivateNetwork, lookup)
    if (!safe) {
      throw new Error('Blocked non-public HTTP(S) URL (SSRF protection)')
    }

    const response = await requestOnce(safe.href, method, timeoutMs, fetcher)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        return { response, finalUrl: safe.href }
      }
      current = new URL(location, safe.href).href
      continue
    }

    return { response, finalUrl: response.url || safe.href }
  }

  throw new Error(`Exceeded ${MAX_REDIRECTS} redirects`)
}

export async function checkSourceLink(
  source: SourceLinkInput,
  options: SourceLinkCheckOptions = {},
  fetcher: typeof fetch = fetch
): Promise<SourceLinkResult> {
  const startedAt = Date.now()
  const allowPrivateNetwork = options.allowPrivateNetwork === true
  const lookup = options.lookup
  const url = await validPublicUrl(source.url, allowPrivateNetwork, lookup)
  const timeoutMs = boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 500, 60_000)

  if (!url) {
    return {
      ...source,
      state: 'invalid',
      status: null,
      finalUrl: null,
      method: null,
      durationMs: Date.now() - startedAt,
      message: 'Only public HTTP(S) source URLs can be checked'
    }
  }

  try {
    let method: 'HEAD' | 'GET' = 'HEAD'
    let result = await request(url.href, method, timeoutMs, fetcher, allowPrivateNetwork, lookup)

    if ([400, 403, 405, 501].includes(result.response.status)) {
      method = 'GET'
      result = await request(url.href, method, timeoutMs, fetcher, allowPrivateNetwork, lookup)
    }

    const { response, finalUrl } = result
    return {
      ...source,
      state: stateForStatus(response.status),
      status: response.status,
      finalUrl,
      method,
      durationMs: Date.now() - startedAt,
      message: response.ok || (response.status >= 300 && response.status < 400)
        ? null
        : response.statusText || `HTTP ${response.status}`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Source request failed'
    const blocked = message.includes('SSRF') || message.includes('non-public')
    return {
      ...source,
      state: blocked ? 'invalid' : 'unavailable',
      status: null,
      finalUrl: null,
      method: null,
      durationMs: Date.now() - startedAt,
      message
    }
  }
}

export async function checkSourceLinks(
  inputs: SourceLinkInput[],
  options: SourceLinkCheckOptions = {},
  fetcher: typeof fetch = fetch
): Promise<SourceLinkResult[]> {
  const concurrency = boundedInteger(options.concurrency, DEFAULT_CONCURRENCY, 1, 10)
  const results = new Array<SourceLinkResult>(inputs.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < inputs.length) {
      const index = nextIndex++
      results[index] = await checkSourceLink(inputs[index]!, options, fetcher)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(inputs.length, 1)) }, worker))
  return results
}

function numberArgument(name: string): number | undefined {
  const prefix = `--${name}=`
  const value = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be numeric`)
  return parsed
}

export async function runCli(): Promise<void> {
  const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
  const client = getDatabase(databasePath)

  try {
    const rows = client.db.select({
      id: sources.id,
      title: sources.title,
      url: sources.url
    }).from(sources)
      .where(eq(sources.status, 'active'))
      .all()
    const results = await checkSourceLinks(rows, {
      concurrency: numberArgument('concurrency'),
      timeoutMs: numberArgument('timeout-ms')
    })
    const counts = results.reduce<Record<SourceLinkState, number>>((summary, result) => {
      summary[result.state] += 1
      return summary
    }, { healthy: 0, broken: 0, warning: 0, unavailable: 0, invalid: 0 })

    process.stdout.write(`${JSON.stringify({ database: client.path, counts, results }, null, 2)}\n`)
    if (counts.broken > 0 || counts.invalid > 0) process.exitCode = 1
  } finally {
    closeDatabase(databasePath)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  })
}
