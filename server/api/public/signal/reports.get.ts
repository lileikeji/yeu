import { getQuery, setHeader } from 'h3'
import { ensureDailyReport, listSignalReports } from '../../../modules/signal/service'
import type { SignalReportKind } from '../../../modules/signal/time'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'

const KINDS: SignalReportKind[] = ['daily', 'weekly', 'monthly']

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  const kind = (typeof query.kind === 'string' ? query.kind : 'daily') as SignalReportKind
  if (!KINDS.includes(kind)) {
    throw createError({ statusCode: 400, statusMessage: 'kind 只接受 daily/weekly/monthly' })
  }
  const parsed = Number(query.limit)
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10
  const client = useAppDatabase(event)

  // 定时任务没跑的时候，允许显式要一份当天的：只写自己这一天，重复请求拿回同一份。
  if (query.live === '1' && kind === 'daily') ensureDailyReport(client, Date.now())

  const payload = { kind, reports: listSignalReports(client, kind, limit) }
  setPublicCache(event, 60)
  return payload
})
