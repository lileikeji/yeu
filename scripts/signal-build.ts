import './load-env'
import { resolve } from 'node:path'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  ensureDailyReport,
  ensurePeriodReport,
  rebuildSignalIndex
} from '../server/modules/signal/service'
import type { SignalReportKind } from '../server/modules/signal/time'

interface CliOptions {
  database: string
  days: number
  limit: number
  dryRun: boolean
  report: SignalReportKind | 'both' | 'none'
  now: number
}

/** 同时接受 --name=value 与 --name value 两种写法，避免手敲时静默落回默认值。 */
function readFlag(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`
  const hit = argv.find(argument => argument.startsWith(prefix))
  if (hit) return hit.slice(prefix.length)
  const index = argv.indexOf(`--${name}`)
  if (index < 0) return undefined
  const next = argv[index + 1]
  return next && !next.startsWith('--') ? next : undefined
}

function parseArgs(argv: string[]): CliOptions {
  const report = (readFlag(argv, 'report') ?? 'daily') as CliOptions['report']
  if (!['daily', 'weekly', 'monthly', 'both', 'none'].includes(report)) {
    throw new Error(`--report 只接受 daily/weekly/monthly/both/none，收到 ${report}`)
  }
  const nowFlag = readFlag(argv, 'now')
  const now = nowFlag ? Date.parse(nowFlag) : Date.now()
  if (Number.isNaN(now)) throw new Error(`--now 需要一个可解析的时间，收到 ${nowFlag}`)

  const days = Number(readFlag(argv, 'days') ?? 45)
  const limit = Number(readFlag(argv, 'limit') ?? 2000)
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days 需要正整数')
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('--limit 需要正整数')

  return {
    database: resolve(process.cwd(), readFlag(argv, 'database') ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite'),
    days: Math.floor(days),
    limit: Math.floor(limit),
    dryRun: argv.includes('--dry-run'),
    report,
    now
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const client = getDatabase(options.database)
  try {
    runMigrations(client)
    const result = rebuildSignalIndex(client, {
      now: options.now,
      lookbackDays: options.days,
      maxCandidates: options.limit,
      dryRun: options.dryRun
    })

    const reports: Array<{ kind: SignalReportKind, periodKey: string, items: number }> = []
    if (!options.dryRun && options.report !== 'none') {
      if (options.report === 'daily' || options.report === 'both') {
        const payload = ensureDailyReport(client, options.now)
        reports.push({
          kind: 'daily',
          periodKey: payload.periodKey,
          items: payload.lead.length + payload.sections.reduce((total, section) => total + section.items.length, 0)
        })
      }
      if (options.report === 'weekly' || options.report === 'both') {
        for (const kind of ['weekly', 'monthly'] as const) {
          const payload = ensurePeriodReport(client, kind, options.now)
          reports.push({
            kind,
            periodKey: payload.periodKey,
            items: payload.lead.length + payload.sections.reduce((total, section) => total + section.items.length, 0)
          })
        }
      }
    }

    console.log(JSON.stringify({
      database: options.database,
      now: new Date(options.now).toISOString(),
      lookbackDays: options.days,
      dryRun: options.dryRun,
      ...result,
      reports
    }, null, 2))
  } finally {
    closeDatabase(options.database)
  }
}

main()
