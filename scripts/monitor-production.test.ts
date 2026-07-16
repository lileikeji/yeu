import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  inspectProductionHealth,
  notifyProductionHealth,
  resolveProductionMonitorOptions,
  type ProductionMonitorDependencies
} from './monitor-production'

const NOW = Date.parse('2026-07-16T03:30:00+08:00')

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-production-monitor-'))
  const databasePath = join(directory, 'data', 'yeu.sqlite')
  const backupDirectory = join(directory, 'backups')
  const backupPath = join(backupDirectory, 'yeu-current.sqlite')
  const requestLogPath = join(directory, 'logs', 'app-out.log')
  mkdirSync(join(directory, 'data'), { recursive: true })
  mkdirSync(backupDirectory, { recursive: true })
  mkdirSync(join(directory, 'logs'), { recursive: true })
  writeFileSync(databasePath, 'database')
  writeFileSync(backupPath, 'backup')
  writeFileSync(requestLogPath, '')
  writeFileSync(`${backupPath}.json`, JSON.stringify({
    createdAt: new Date(NOW - 2 * 3_600_000).toISOString(),
    outputPath: 'yeu-current.sqlite'
  }))
  return { directory, databasePath, backupDirectory, requestLogPath }
}

function requestLogLine(input: {
  statusCode: number
  route: string
  method?: string
  timestamp?: number
}): string {
  return JSON.stringify({
    event: 'http_request',
    timestamp: new Date(input.timestamp ?? NOW - 60_000).toISOString(),
    requestId: `request-${input.statusCode}-${input.route}`,
    method: input.method ?? 'GET',
    route: input.route,
    statusCode: input.statusCode,
    durationMs: 12.3,
    errorCode: input.statusCode >= 400 ? `HTTP_${input.statusCode}` : null,
    aborted: false
  })
}

function dependencies(fetchImplementation: typeof fetch): ProductionMonitorDependencies {
  return {
    fetch: fetchImplementation,
    diskMetrics: () => ({ freeBytes: 50 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 }),
    systemMetrics: () => ({
      freeMemoryBytes: 8 * 1024 ** 3,
      totalMemoryBytes: 16 * 1024 ** 3,
      load1: 2,
      cpuCount: 4
    }),
    // Hermetic webhook rebinding gate (public address).
    lookup: async () => ['93.184.216.34']
  }
}

function healthyResponse(): Response {
  return Response.json({
    status: 'ok',
    database: 'ready',
    configuration: 'ready',
    issues: []
  })
}

test('production monitor accepts a ready app, sufficient capacity, and a recent verified backup', async () => {
  const fixture = createFixture()
  try {
    const options = resolveProductionMonitorOptions({
      healthUrl: 'https://guide.example.edu/api/health',
      databasePath: fixture.databasePath,
      backupDirectory: fixture.backupDirectory,
      requestLogPath: fixture.requestLogPath,
      statePath: join(fixture.directory, 'monitor-state.json'),
      now: NOW
    }, fixture.directory)
    const report = await inspectProductionHealth(options, dependencies(async () => healthyResponse()))

    assert.equal(report.status, 'ok')
    assert.deepEqual(report.issues, [])
    assert.equal(report.metrics.healthStatus, 200)
    assert.equal(report.metrics.backupAgeHours, 2)
    assert.equal(report.metrics.serverErrors, 0)
    assert.equal(report.metrics.loginFailures, 0)
    assert.equal(report.metrics.rateLimitedRequests, 0)
    assert.equal(JSON.stringify(report).includes(fixture.directory), false)
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('production monitor counts only recent server errors, failed logins, and rate limits', async () => {
  const fixture = createFixture()
  try {
    writeFileSync(fixture.requestLogPath, [
      requestLogLine({ statusCode: 500, route: '/api/public/search' }),
      requestLogLine({ statusCode: 503, route: '/api/health' }),
      ...Array.from({ length: 5 }, (_, index) => requestLogLine({
        statusCode: 401,
        route: '/api/admin/auth/login',
        method: 'POST'
      })),
      requestLogLine({ statusCode: 429, route: '/api/public/feedback', method: 'POST' }),
      requestLogLine({
        statusCode: 500,
        route: '/api/old',
        timestamp: NOW - 60 * 60_000
      }),
      'non-json pm2 output'
    ].join('\n'))
    const options = resolveProductionMonitorOptions({
      healthUrl: 'https://guide.example.edu/api/health',
      databasePath: fixture.databasePath,
      backupDirectory: fixture.backupDirectory,
      requestLogPath: fixture.requestLogPath,
      statePath: join(fixture.directory, 'monitor-state.json'),
      logWindowMinutes: 15,
      maxServerErrors: 0,
      maxLoginFailures: 4,
      maxRateLimitedRequests: 0,
      now: NOW
    }, fixture.directory)
    const report = await inspectProductionHealth(options, dependencies(async () => healthyResponse()))

    assert.equal(report.status, 'unhealthy')
    assert.deepEqual(report.issues.map(issue => issue.code).sort(), [
      'login_failures_high',
      'rate_limits_high',
      'server_errors_high'
    ])
    assert.equal(report.metrics.serverErrors, 2)
    assert.equal(report.metrics.loginFailures, 5)
    assert.equal(report.metrics.rateLimitedRequests, 1)
    assert.equal(JSON.stringify(report).includes(fixture.requestLogPath), false)
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('production monitor fails closed when a configured request log is missing', async () => {
  const fixture = createFixture()
  try {
    const options = resolveProductionMonitorOptions({
      healthUrl: 'https://guide.example.edu/api/health',
      databasePath: fixture.databasePath,
      backupDirectory: fixture.backupDirectory,
      requestLogPath: join(fixture.directory, 'logs', 'missing.log'),
      statePath: join(fixture.directory, 'monitor-state.json'),
      now: NOW
    }, fixture.directory)
    const report = await inspectProductionHealth(options, dependencies(async () => healthyResponse()))

    assert.equal(report.status, 'unhealthy')
    assert.deepEqual(report.issues.map(issue => issue.code), ['request_log_missing'])
    assert.equal(report.metrics.serverErrors, null)
    assert.equal(JSON.stringify(report).includes(fixture.directory), false)
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('production monitor reports when its bounded log tail cannot cover the full window', async () => {
  const fixture = createFixture()
  try {
    writeFileSync(fixture.requestLogPath, Buffer.concat([
      Buffer.alloc(4 * 1024 ** 2 + 256, 120),
      Buffer.from(`\n${requestLogLine({ statusCode: 200, route: '/' })}\n`)
    ]))
    const options = resolveProductionMonitorOptions({
      healthUrl: 'https://guide.example.edu/api/health',
      databasePath: fixture.databasePath,
      backupDirectory: fixture.backupDirectory,
      requestLogPath: fixture.requestLogPath,
      statePath: join(fixture.directory, 'monitor-state.json'),
      now: NOW
    }, fixture.directory)
    const report = await inspectProductionHealth(options, dependencies(async () => healthyResponse()))

    assert.equal(report.status, 'unhealthy')
    assert.deepEqual(report.issues.map(issue => issue.code), ['request_log_window_incomplete'])
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('production monitor reports application, WAL, backup, disk, memory, and load failures together', async () => {
  const fixture = createFixture()
  try {
    writeFileSync(`${fixture.databasePath}-wal`, Buffer.alloc(2_048))
    const options = resolveProductionMonitorOptions({
      healthUrl: 'https://guide.example.edu/api/health',
      databasePath: fixture.databasePath,
      backupDirectory: fixture.backupDirectory,
      statePath: join(fixture.directory, 'monitor-state.json'),
      now: NOW,
      maxBackupAgeHours: 1,
      maxWalBytes: 1_024,
      minDiskFreeBytes: 20,
      minDiskFreePercent: 20,
      minMemoryFreePercent: 20,
      maxLoadPerCpu: 1
    }, fixture.directory)
    const runtime: ProductionMonitorDependencies = {
      fetch: async () => Response.json({ status: 'unavailable' }, { status: 503 }),
      diskMetrics: () => ({ freeBytes: 10, totalBytes: 100 }),
      systemMetrics: () => ({ freeMemoryBytes: 10, totalMemoryBytes: 100, load1: 8, cpuCount: 4 })
    }
    const report = await inspectProductionHealth(options, runtime)

    assert.equal(report.status, 'unhealthy')
    assert.deepEqual(report.issues.map(issue => issue.code).sort(), [
      'backup_stale',
      'disk_free_low',
      'health_unhealthy',
      'load_high',
      'memory_low',
      'wal_too_large'
    ])
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('webhook notifications are deduplicated and send a recovery without leaking local paths', async () => {
  const fixture = createFixture()
  const payloads: Array<Record<string, unknown>> = []
  let healthy = false
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/api/health')) {
      return healthy
        ? healthyResponse()
        : Response.json({ status: 'unavailable' }, { status: 503 })
    }
    payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(null, { status: 204 })
  }
  const runtime = dependencies(fetchImplementation)

  try {
    const baseOptions = resolveProductionMonitorOptions({
      healthUrl: 'https://guide.example.edu/api/health',
      databasePath: fixture.databasePath,
      backupDirectory: fixture.backupDirectory,
      statePath: join(fixture.directory, 'monitor-state.json'),
      webhookUrl: 'https://alerts.example.edu/yeu',
      reminderHours: 6,
      now: NOW
    }, fixture.directory)

    const unhealthy = await inspectProductionHealth(baseOptions, runtime)
    assert.equal((await notifyProductionHealth(unhealthy, baseOptions, runtime)).transition, 'unhealthy')
    assert.equal((await notifyProductionHealth(unhealthy, baseOptions, runtime)).status, 'not_needed')

    healthy = true
    const recoveryOptions = { ...baseOptions, now: NOW + 60_000 }
    const recovered = await inspectProductionHealth(recoveryOptions, runtime)
    assert.equal((await notifyProductionHealth(recovered, recoveryOptions, runtime)).transition, 'recovery')
    assert.equal(payloads.length, 2)
    assert.deepEqual(payloads.map(payload => payload.transition), ['unhealthy', 'recovery'])
    assert.equal(JSON.stringify(payloads).includes(fixture.directory), false)

    const state = JSON.parse(readFileSync(baseOptions.statePath, 'utf8')) as { status: string }
    assert.equal(state.status, 'ok')
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})
