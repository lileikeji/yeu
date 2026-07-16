import './load-env'
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { availableParallelism, freemem, loadavg, totalmem } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertSafeResolvedPublicHttpUrl,
  parseSafePublicHttpUrl,
  type HostnameLookup
} from '../shared/utils/public-http-url'

export type ProductionMonitorIssueCode
  = | 'health_request_failed'
    | 'health_unhealthy'
    | 'database_missing'
    | 'disk_check_failed'
    | 'disk_free_low'
    | 'wal_too_large'
    | 'backup_missing'
    | 'backup_metadata_invalid'
    | 'backup_stale'
    | 'memory_low'
    | 'load_high'
    | 'request_log_missing'
    | 'request_log_unreadable'
    | 'request_log_window_incomplete'
    | 'server_errors_high'
    | 'login_failures_high'
    | 'rate_limits_high'

export interface ProductionMonitorIssue {
  code: ProductionMonitorIssueCode
  message: string
}

export interface ProductionMonitorMetrics {
  healthStatus: number | null
  databaseBytes: number | null
  walBytes: number
  diskFreeBytes: number | null
  diskFreePercent: number | null
  backupAgeHours: number | null
  memoryFreePercent: number
  loadPerCpu: number
  serverErrors: number | null
  loginFailures: number | null
  rateLimitedRequests: number | null
}

export interface ProductionMonitorOptions {
  healthUrl: string
  databasePath: string
  backupDirectory: string
  requestLogPath?: string
  statePath: string
  webhookUrl?: string
  label: string
  timeoutMs: number
  maxBackupAgeHours: number
  minDiskFreeBytes: number
  minDiskFreePercent: number
  maxWalBytes: number
  minMemoryFreePercent: number
  maxLoadPerCpu: number
  logWindowMinutes: number
  maxServerErrors: number
  maxLoginFailures: number
  maxRateLimitedRequests: number
  reminderHours: number
  now: number
}

export interface ProductionMonitorReport {
  event: 'production_monitor_result'
  label: string
  status: 'ok' | 'unhealthy'
  timestamp: string
  issues: ProductionMonitorIssue[]
  metrics: ProductionMonitorMetrics
}

export interface ProductionMonitorNotification {
  status: 'disabled' | 'not_needed' | 'sent' | 'failed'
  transition: 'unhealthy' | 'changed' | 'reminder' | 'recovery' | null
  error?: string
}

interface MonitorState {
  status: 'ok' | 'unhealthy'
  fingerprint: string
  lastNotifiedAt: string | null
}

interface MonitorSystemMetrics {
  freeMemoryBytes: number
  totalMemoryBytes: number
  load1: number
  cpuCount: number
}

interface MonitorDiskMetrics {
  freeBytes: number
  totalBytes: number
}

export interface ProductionMonitorDependencies {
  fetch: typeof fetch
  systemMetrics: () => MonitorSystemMetrics
  diskMetrics: (path: string) => MonitorDiskMetrics
  /** Injected DNS resolver for webhook rebinding checks (tests). */
  lookup?: HostnameLookup
}

interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

const GIB = 1024 ** 3
const MIB = 1024 ** 2
const REQUEST_LOG_TAIL_BYTES = 4 * MIB

function finiteNumber(value: string | undefined, fallback: number, minimum: number): number {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`Expected a number >= ${minimum}, received ${JSON.stringify(value)}`)
  }
  return parsed
}

function finiteInteger(value: string | undefined, fallback: number, minimum: number): number {
  const parsed = finiteNumber(value, fallback, minimum)
  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected an integer >= ${minimum}, received ${JSON.stringify(value)}`)
  }
  return parsed
}

function absolutePath(value: string, cwd = process.cwd()): string {
  return isAbsolute(value) ? value : resolve(cwd, value)
}

function validHttpUrl(
  value: string,
  name: string,
  options: { httpsOnly?: boolean, allowPrivateNetwork?: boolean } = {}
): string {
  const httpsOnly = options.httpsOnly === true
  const parsed = parseSafePublicHttpUrl(value, {
    allowPrivateNetwork: options.allowPrivateNetwork === true
  })
  if (!parsed) {
    throw new Error(`${name} must be a credential-free ${httpsOnly ? 'HTTPS' : 'HTTP(S)'} public URL`)
  }
  if (httpsOnly && parsed.protocol !== 'https:') {
    throw new Error(`${name} must be a credential-free HTTPS public URL`)
  }
  return parsed.toString()
}

function defaultHealthUrl(): string {
  const configured = process.env.NUXT_MONITOR_HEALTH_URL
  if (configured) return configured
  const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
  return new URL('/api/health', siteUrl).toString()
}

export function resolveProductionMonitorOptions(
  overrides: Partial<ProductionMonitorOptions> = {},
  cwd = process.cwd()
): ProductionMonitorOptions {
  const now = overrides.now ?? Date.now()
  if (!Number.isInteger(now) || now < 0) throw new Error('now must be a non-negative integer timestamp')

  const webhook = overrides.webhookUrl ?? process.env.NUXT_MONITOR_WEBHOOK_URL
  const requestLog = overrides.requestLogPath ?? process.env.NUXT_MONITOR_REQUEST_LOG_PATH
  return {
    healthUrl: validHttpUrl(overrides.healthUrl ?? defaultHealthUrl(), 'health URL', { allowPrivateNetwork: true }),
    databasePath: absolutePath(
      overrides.databasePath ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite',
      cwd
    ),
    backupDirectory: absolutePath(
      overrides.backupDirectory ?? process.env.NUXT_MONITOR_BACKUP_DIR ?? './data/backups',
      cwd
    ),
    requestLogPath: requestLog ? absolutePath(requestLog, cwd) : undefined,
    statePath: absolutePath(
      overrides.statePath ?? process.env.NUXT_MONITOR_STATE_PATH ?? './data/production-monitor-state.json',
      cwd
    ),
    webhookUrl: webhook ? validHttpUrl(webhook, 'webhook URL', { httpsOnly: true }) : undefined,
    label: (overrides.label ?? process.env.NUXT_MONITOR_LABEL ?? 'yeu-production').slice(0, 64),
    timeoutMs: overrides.timeoutMs
      ?? finiteNumber(process.env.NUXT_MONITOR_TIMEOUT_MS, 8_000, 100),
    maxBackupAgeHours: overrides.maxBackupAgeHours
      ?? finiteNumber(process.env.NUXT_MONITOR_MAX_BACKUP_AGE_HOURS, 26, 0),
    minDiskFreeBytes: overrides.minDiskFreeBytes
      ?? finiteNumber(process.env.NUXT_MONITOR_MIN_DISK_FREE_GIB, 5, 0) * GIB,
    minDiskFreePercent: overrides.minDiskFreePercent
      ?? finiteNumber(process.env.NUXT_MONITOR_MIN_DISK_FREE_PERCENT, 15, 0),
    maxWalBytes: overrides.maxWalBytes
      ?? finiteNumber(process.env.NUXT_MONITOR_MAX_WAL_MIB, 256, 0) * MIB,
    minMemoryFreePercent: overrides.minMemoryFreePercent
      ?? finiteNumber(process.env.NUXT_MONITOR_MIN_MEMORY_FREE_PERCENT, 10, 0),
    maxLoadPerCpu: overrides.maxLoadPerCpu
      ?? finiteNumber(process.env.NUXT_MONITOR_MAX_LOAD_PER_CPU, 2, 0),
    logWindowMinutes: overrides.logWindowMinutes
      ?? finiteNumber(process.env.NUXT_MONITOR_LOG_WINDOW_MINUTES, 15, 1),
    maxServerErrors: overrides.maxServerErrors
      ?? finiteInteger(process.env.NUXT_MONITOR_MAX_SERVER_ERRORS, 0, 0),
    maxLoginFailures: overrides.maxLoginFailures
      ?? finiteInteger(process.env.NUXT_MONITOR_MAX_LOGIN_FAILURES, 4, 0),
    maxRateLimitedRequests: overrides.maxRateLimitedRequests
      ?? finiteInteger(process.env.NUXT_MONITOR_MAX_RATE_LIMITED, 0, 0),
    reminderHours: overrides.reminderHours
      ?? finiteNumber(process.env.NUXT_MONITOR_REMINDER_HOURS, 6, 0),
    now
  }
}

function defaultDependencies(): ProductionMonitorDependencies {
  return {
    fetch,
    systemMetrics: () => ({
      freeMemoryBytes: freemem(),
      totalMemoryBytes: totalmem(),
      load1: loadavg()[0],
      cpuCount: availableParallelism()
    }),
    diskMetrics: (path) => {
      const stats = statfsSync(path, { bigint: true })
      return {
        freeBytes: Number(stats.bavail * stats.bsize),
        totalBytes: Number(stats.blocks * stats.bsize)
      }
    }
  }
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function inspectLatestBackup(
  options: ProductionMonitorOptions,
  issues: ProductionMonitorIssue[]
): number | null {
  if (!existsSync(options.backupDirectory)) {
    issues.push({ code: 'backup_missing', message: 'Backup directory does not exist.' })
    return null
  }

  const metadataFiles = readdirSync(options.backupDirectory)
    .filter(file => file.endsWith('.sqlite.json'))
  if (!metadataFiles.length) {
    issues.push({ code: 'backup_missing', message: 'No verified SQLite backup metadata was found.' })
    return null
  }

  let latest: { createdAt: number, outputPath: string } | null = null
  for (const file of metadataFiles) {
    try {
      const value = JSON.parse(readFileSync(join(options.backupDirectory, file), 'utf8')) as {
        createdAt?: unknown
        outputPath?: unknown
      }
      const createdAt = typeof value.createdAt === 'string' ? Date.parse(value.createdAt) : Number.NaN
      const outputPath = typeof value.outputPath === 'string' ? value.outputPath : ''
      if (!Number.isFinite(createdAt) || !outputPath || basename(outputPath) !== outputPath) continue
      if (!latest || createdAt > latest.createdAt) latest = { createdAt, outputPath }
    } catch {
      // Invalid older metadata does not hide a newer valid backup.
    }
  }

  if (!latest || !existsSync(join(options.backupDirectory, latest.outputPath))) {
    issues.push({ code: 'backup_metadata_invalid', message: 'Backup metadata is invalid or its SQLite file is missing.' })
    return null
  }

  const ageHours = Math.max(0, (options.now - latest.createdAt) / 3_600_000)
  if (ageHours > options.maxBackupAgeHours) {
    issues.push({ code: 'backup_stale', message: 'The latest verified backup is older than the configured limit.' })
  }
  return round(ageHours, 2)
}

interface RequestLogMetrics {
  serverErrors: number | null
  loginFailures: number | null
  rateLimitedRequests: number | null
}

function readRequestLogTail(path: string): { text: string, truncated: boolean } {
  const size = statSync(path).size
  if (size <= REQUEST_LOG_TAIL_BYTES) {
    return { text: readFileSync(path, 'utf8'), truncated: false }
  }

  const start = size - REQUEST_LOG_TAIL_BYTES
  const buffer = Buffer.allocUnsafe(REQUEST_LOG_TAIL_BYTES)
  const descriptor = openSync(path, 'r')
  try {
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, start)
    const text = buffer.subarray(0, bytesRead).toString('utf8')
    const firstNewline = text.indexOf('\n')
    return {
      text: firstNewline >= 0 ? text.slice(firstNewline + 1) : '',
      truncated: true
    }
  } finally {
    closeSync(descriptor)
  }
}

function inspectRequestLog(
  options: ProductionMonitorOptions,
  issues: ProductionMonitorIssue[]
): RequestLogMetrics {
  const unavailable: RequestLogMetrics = {
    serverErrors: null,
    loginFailures: null,
    rateLimitedRequests: null
  }
  if (!options.requestLogPath) return unavailable
  if (!existsSync(options.requestLogPath)) {
    issues.push({ code: 'request_log_missing', message: 'The configured structured request log does not exist.' })
    return unavailable
  }

  try {
    const { text, truncated } = readRequestLogTail(options.requestLogPath)
    const windowStart = options.now - options.logWindowMinutes * 60_000
    let earliestTimestamp = Number.POSITIVE_INFINITY
    let serverErrors = 0
    let loginFailures = 0
    let rateLimitedRequests = 0

    for (const rawLine of text.split(/\r?\n/)) {
      const jsonStart = rawLine.indexOf('{')
      if (jsonStart < 0) continue
      try {
        const entry = JSON.parse(rawLine.slice(jsonStart)) as Record<string, unknown>
        if (entry.event !== 'http_request' || typeof entry.timestamp !== 'string') continue
        const timestamp = Date.parse(entry.timestamp)
        if (!Number.isFinite(timestamp)) continue
        earliestTimestamp = Math.min(earliestTimestamp, timestamp)
        if (timestamp < windowStart || timestamp > options.now + 60_000) continue

        const statusCode = entry.statusCode
        const method = entry.method
        const route = entry.route
        if (!Number.isInteger(statusCode)
          || typeof method !== 'string'
          || typeof route !== 'string'
          || !route.startsWith('/')
          || route.includes('?')) continue

        if ((statusCode as number) >= 500 && (statusCode as number) <= 599) serverErrors += 1
        if (statusCode === 429) rateLimitedRequests += 1
        if (statusCode === 401
          && method === 'POST'
          && route === '/api/admin/auth/login') {
          loginFailures += 1
        }
      } catch {
        // PM2 and application logs can contain non-JSON lines beside request entries.
      }
    }

    if (truncated && (!Number.isFinite(earliestTimestamp) || earliestTimestamp > windowStart)) {
      issues.push({
        code: 'request_log_window_incomplete',
        message: 'The bounded request log tail does not cover the configured monitoring window.'
      })
    }
    if (serverErrors > options.maxServerErrors) {
      issues.push({ code: 'server_errors_high', message: 'Recent HTTP 5xx responses exceed the configured limit.' })
    }
    if (loginFailures > options.maxLoginFailures) {
      issues.push({ code: 'login_failures_high', message: 'Recent failed administrator logins exceed the configured limit.' })
    }
    if (rateLimitedRequests > options.maxRateLimitedRequests) {
      issues.push({ code: 'rate_limits_high', message: 'Recent HTTP 429 responses exceed the configured limit.' })
    }

    return { serverErrors, loginFailures, rateLimitedRequests }
  } catch {
    issues.push({ code: 'request_log_unreadable', message: 'The configured structured request log could not be read.' })
    return unavailable
  }
}

export async function inspectProductionHealth(
  options: ProductionMonitorOptions,
  dependencies: ProductionMonitorDependencies = defaultDependencies()
): Promise<ProductionMonitorReport> {
  const issues: ProductionMonitorIssue[] = []
  let healthStatus: number | null = null

  try {
    const response = await dependencies.fetch(options.healthUrl, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs)
    })
    healthStatus = response.status
    const body = await response.json() as Record<string, unknown>
    const healthy = response.ok
      && body.status === 'ok'
      && body.database === 'ready'
      && body.configuration === 'ready'
      && Array.isArray(body.issues)
      && body.issues.length === 0
    if (!healthy) {
      issues.push({ code: 'health_unhealthy', message: 'The application health endpoint is not ready.' })
    }
  } catch {
    issues.push({ code: 'health_request_failed', message: 'The application health endpoint could not be checked.' })
  }

  let databaseBytes: number | null = null
  let walBytes = 0
  if (!existsSync(options.databasePath)) {
    issues.push({ code: 'database_missing', message: 'The configured SQLite database file does not exist.' })
  } else {
    databaseBytes = statSync(options.databasePath).size
    const walPath = `${options.databasePath}-wal`
    walBytes = existsSync(walPath) ? statSync(walPath).size : 0
    if (walBytes > options.maxWalBytes) {
      issues.push({ code: 'wal_too_large', message: 'The SQLite WAL file exceeds the configured size limit.' })
    }
  }

  let diskFreeBytes: number | null = null
  let diskFreePercent: number | null = null
  try {
    const disk = dependencies.diskMetrics(dirname(options.databasePath))
    diskFreeBytes = Math.max(0, disk.freeBytes)
    diskFreePercent = disk.totalBytes > 0 ? round((diskFreeBytes / disk.totalBytes) * 100, 2) : 0
    if (diskFreeBytes < options.minDiskFreeBytes || diskFreePercent < options.minDiskFreePercent) {
      issues.push({ code: 'disk_free_low', message: 'Disk free space is below the configured limit.' })
    }
  } catch {
    issues.push({ code: 'disk_check_failed', message: 'Disk free space could not be checked.' })
  }

  const backupAgeHours = inspectLatestBackup(options, issues)
  const requestLog = inspectRequestLog(options, issues)
  const system = dependencies.systemMetrics()
  const memoryFreePercent = system.totalMemoryBytes > 0
    ? round((system.freeMemoryBytes / system.totalMemoryBytes) * 100, 2)
    : 0
  const loadPerCpu = system.cpuCount > 0 ? round(system.load1 / system.cpuCount, 2) : 0
  if (memoryFreePercent < options.minMemoryFreePercent) {
    issues.push({ code: 'memory_low', message: 'System free memory is below the configured limit.' })
  }
  if (loadPerCpu > options.maxLoadPerCpu) {
    issues.push({ code: 'load_high', message: 'System load per CPU exceeds the configured limit.' })
  }

  return {
    event: 'production_monitor_result',
    label: options.label,
    status: issues.length ? 'unhealthy' : 'ok',
    timestamp: new Date(options.now).toISOString(),
    issues,
    metrics: {
      healthStatus,
      databaseBytes,
      walBytes,
      diskFreeBytes,
      diskFreePercent,
      backupAgeHours,
      memoryFreePercent,
      loadPerCpu,
      ...requestLog
    }
  }
}

function readMonitorState(path: string): MonitorState | null {
  if (!existsSync(path)) return null
  try {
    const state = JSON.parse(readFileSync(path, 'utf8')) as Partial<MonitorState>
    if ((state.status === 'ok' || state.status === 'unhealthy')
      && typeof state.fingerprint === 'string'
      && (state.lastNotifiedAt === null || typeof state.lastNotifiedAt === 'string')) {
      return state as MonitorState
    }
  } catch {
    return null
  }
  return null
}

function writeMonitorState(path: string, state: MonitorState): void {
  mkdirSync(dirname(path), { recursive: true })
  const partial = `${path}.partial-${randomUUID()}`
  try {
    writeFileSync(partial, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    renameSync(partial, path)
  } finally {
    if (existsSync(partial)) rmSync(partial, { force: true })
  }
}

function reportFingerprint(report: ProductionMonitorReport): string {
  return report.issues.map(issue => issue.code).sort().join(',')
}

function notificationTransition(
  report: ProductionMonitorReport,
  previous: MonitorState | null,
  reminderHours: number,
  now: number
): ProductionMonitorNotification['transition'] {
  const fingerprint = reportFingerprint(report)
  if (report.status === 'ok') return previous?.status === 'unhealthy' ? 'recovery' : null
  if (!previous || previous.status === 'ok') return 'unhealthy'
  if (previous.fingerprint !== fingerprint) return 'changed'
  const lastNotified = previous.lastNotifiedAt ? Date.parse(previous.lastNotifiedAt) : Number.NaN
  if (!Number.isFinite(lastNotified) || now - lastNotified >= reminderHours * 3_600_000) return 'reminder'
  return null
}

export async function notifyProductionHealth(
  report: ProductionMonitorReport,
  options: ProductionMonitorOptions,
  dependencies: ProductionMonitorDependencies = defaultDependencies()
): Promise<ProductionMonitorNotification> {
  if (!options.webhookUrl) return { status: 'disabled', transition: null }

  const previous = readMonitorState(options.statePath)
  const transition = notificationTransition(report, previous, options.reminderHours, options.now)
  const fingerprint = reportFingerprint(report)
  if (!transition) {
    writeMonitorState(options.statePath, {
      status: report.status,
      fingerprint,
      lastNotifiedAt: previous?.lastNotifiedAt ?? null
    })
    return { status: 'not_needed', transition: null }
  }

  try {
    // Re-validate immediately before POST (string policy + DNS rebinding).
    await assertSafeResolvedPublicHttpUrl(options.webhookUrl, {
      allowPrivateNetwork: false,
      lookup: dependencies.lookup
    })
    const response = await dependencies.fetch(options.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'yeu_production_monitor',
        label: report.label,
        transition,
        status: report.status,
        timestamp: report.timestamp,
        issueCodes: report.issues.map(issue => issue.code),
        metrics: report.metrics
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs)
    })
    if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`)
    writeMonitorState(options.statePath, {
      status: report.status,
      fingerprint,
      lastNotifiedAt: report.timestamp
    })
    return { status: 'sent', transition }
  } catch (error) {
    return {
      status: 'failed',
      transition,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function usage(): string {
  return [
    'Usage: pnpm ops:monitor [--health-url URL] [--database PATH] [--backup-dir PATH]',
    '                         [--request-log PATH] [--state PATH] [--webhook URL]',
    '                         [--label NAME]',
    '',
    'Checks application health, SQLite/WAL size, disk, memory, load, backups, and request errors.',
    'Returns non-zero when unhealthy or when an alert webhook cannot be delivered.'
  ].join('\n')
}

function parseCliArgs(argv: string[]): Partial<ProductionMonitorOptions> & { help: boolean } {
  const options: Partial<ProductionMonitorOptions> & { help: boolean } = { help: false }
  const names = new Map<string, keyof ProductionMonitorOptions>([
    ['--health-url', 'healthUrl'],
    ['--database', 'databasePath'],
    ['--backup-dir', 'backupDirectory'],
    ['--request-log', 'requestLogPath'],
    ['--state', 'statePath'],
    ['--webhook', 'webhookUrl'],
    ['--label', 'label']
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    const key = names.get(argument)
    if (!key) throw new Error(`Unknown argument: ${argument}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('-')) throw new Error(`${argument} requires a value`)
    Object.assign(options, { [key]: value })
    index += 1
  }
  return options
}

export async function runCli(argv: string[], io: CliIo = {
  stdout: value => process.stdout.write(value),
  stderr: value => process.stderr.write(value)
}): Promise<number> {
  try {
    const parsed = parseCliArgs(argv)
    if (parsed.help) {
      io.stdout(`${usage()}\n`)
      return 0
    }
    const options = resolveProductionMonitorOptions(parsed)
    const report = await inspectProductionHealth(options)
    const notification = await notifyProductionHealth(report, options)
    io.stdout(`${JSON.stringify({ ...report, notification }, null, 2)}\n`)
    return report.status === 'ok' && notification.status !== 'failed' ? 0 : 1
  } catch (error) {
    io.stderr(`${JSON.stringify({
      event: 'production_monitor_error',
      error: error instanceof Error ? error.message : String(error)
    }, null, 2)}\n`)
    return 1
  }
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (executedDirectly) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
