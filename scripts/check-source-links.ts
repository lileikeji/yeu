import './load-env'
import { pathToFileURL } from 'node:url'
import { sources } from '../server/database/schema'
import { closeDatabase, getDatabase } from '../server/database/client'

const DEFAULT_CONCURRENCY = 4
const DEFAULT_TIMEOUT_MS = 12_000
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

function validPublicUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

async function request(
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
      redirect: 'follow',
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

export async function checkSourceLink(
  source: SourceLinkInput,
  options: SourceLinkCheckOptions = {},
  fetcher: typeof fetch = fetch
): Promise<SourceLinkResult> {
  const startedAt = Date.now()
  const url = validPublicUrl(source.url)
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
    let response = await request(url.href, method, timeoutMs, fetcher)

    if ([400, 403, 405, 501].includes(response.status)) {
      method = 'GET'
      response = await request(url.href, method, timeoutMs, fetcher)
    }

    return {
      ...source,
      state: stateForStatus(response.status),
      status: response.status,
      finalUrl: response.url || url.href,
      method,
      durationMs: Date.now() - startedAt,
      message: response.ok || (response.status >= 300 && response.status < 400)
        ? null
        : response.statusText || `HTTP ${response.status}`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Source request failed'
    return {
      ...source,
      state: 'unavailable',
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
    }).from(sources).all()
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
