import { requireAdminCapability } from '../../utils/auth'
import { useAdminRequest } from '../../utils/http'

interface AdminOverviewSlice { label: string, value: number }

export interface AdminOverviewResponse {
  generatedAt: string
  range: { days: number, startAt: string }
  kpis: { key: string, label: string, value: number, previous: number, delta: number | null, series: number[] }[]
  trend: { labels: string[], visits: number[], visitors: number[] }
  contentByKind: AdminOverviewSlice[]
  contentByStatus: AdminOverviewSlice[]
  publishedTotal: number
  totalContents: number
  topPaths: AdminOverviewSlice[]
  auditActions: AdminOverviewSlice[]
  recruitFunnel: AdminOverviewSlice[]
  hourly: number[]
  heatmapStart: string
  heatmapWeeks: number
  heatmap: { week: number, day: number, value: number }[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function dayKey(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function clampDays(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 30
  return Math.min(120, Math.max(7, Math.round(n)))
}

interface CountRow { n: number }
interface DailyRow { day: string, visits: number, visitors: number }
interface PathRow { path: string | null, n: number }
interface ActionRow { action: string | null, n: number }
interface ContentRow { kind: string, status: string, n: number }
interface HourRow { hour: number, n: number }

export default defineEventHandler((event): AdminOverviewResponse => {
  const { client, session } = useAdminRequest(event)
  requireAdminCapability(session, 'analytics.view')

  const days = clampDays(getQuery(event).days)
  const now = Date.now()
  const start = now - days * DAY_MS
  const prevStart = start - days * DAY_MS
  const sqlite = client.sqlite

  const daily = sqlite.prepare(
    `select strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') as day,
            count(*) as visits,
            count(distinct visitor_id) as visitors
       from visitor_events
      where created_at >= ?
      group by day
      order by day`
  ).all(start) as DailyRow[]

  const currentVisits = sqlite.prepare('select count(*) as n from visitor_events where created_at >= ?').get(start) as CountRow
  const currentVisitors = sqlite.prepare('select count(distinct visitor_id) as n from visitor_events where created_at >= ?').get(start) as CountRow
  const prevVisits = sqlite.prepare('select count(*) as n from visitor_events where created_at >= ? and created_at < ?').get(prevStart, start) as CountRow
  const prevVisitors = sqlite.prepare('select count(distinct visitor_id) as n from visitor_events where created_at >= ? and created_at < ?').get(prevStart, start) as CountRow

  const submissions = sqlite.prepare('select count(*) as n from recruit_submissions where created_at >= ?').get(start) as CountRow
  const prevSubmissions = sqlite.prepare('select count(*) as n from recruit_submissions where created_at >= ? and created_at < ?').get(prevStart, start) as CountRow
  const auditEvents = sqlite.prepare('select count(*) as n from audit_logs where created_at >= ?').get(start) as CountRow
  const prevAuditEvents = sqlite.prepare('select count(*) as n from audit_logs where created_at >= ? and created_at < ?').get(prevStart, start) as CountRow

  const contentRows = sqlite.prepare('select kind, status, count(*) as n from contents group by kind, status').all() as ContentRow[]
  const publishedTotal = contentRows.filter(row => row.status === 'published').reduce((sum, row) => sum + row.n, 0)
  const statusLabels: Record<string, string> = { published: '已发布', draft: '草稿', archived: '已归档' }
  const contentByStatus = ['published', 'draft', 'archived'].map(status => ({
    label: statusLabels[status]!,
    value: contentRows.filter(row => row.status === status).reduce((sum, row) => sum + row.n, 0)
  }))
  const kindLabels: Record<string, string> = { guide: '指南', department: '部门', club: '社团', notice: '公告' }
  const contentByKind = Object.entries(
    contentRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.kind] = (acc[row.kind] || 0) + row.n
      return acc
    }, {})
  ).map(([kind, n]) => ({ label: kindLabels[kind] || kind, value: n }))

  const topPaths = (sqlite.prepare(
    `select path, count(*) as n from visitor_events
      where created_at >= ? and path is not null and path <> ''
      group by path order by n desc limit 6`
  ).all(start) as PathRow[]).map(row => ({ label: row.path || '—', value: row.n }))

  const actionLabels: Record<string, string> = {
    'create': '新建', 'update': '更新', 'delete': '删除', 'login': '登录', 'logout': '登出',
    'publish': '发布', 'unpublish': '撤回', 'upload': '上传', 'ban': '封禁', 'review': '审核'
  }
  const auditActions = (sqlite.prepare(
    `select action, count(*) as n from audit_logs
      where created_at >= ?
      group by action order by n desc limit 6`
  ).all(start) as ActionRow[]).map(row => ({ label: actionLabels[row.action || ''] || row.action || '其他', value: row.n }))

  const formViews = sqlite.prepare('select coalesce(sum(views), 0) as n from recruit_forms').get() as CountRow
  const drafts = sqlite.prepare('select count(*) as n from recruit_drafts').get() as CountRow
  const totalSubmissions = sqlite.prepare('select count(*) as n from recruit_submissions').get() as CountRow
  const confirmed = sqlite.prepare('select count(*) as n from recruit_submissions where payment_confirmed = 1').get() as CountRow
  const recruitFunnel = [
    { label: '表单浏览', value: formViews.n },
    { label: '填写草稿', value: drafts.n },
    { label: '提交申请', value: totalSubmissions.n },
    { label: '确认缴费', value: confirmed.n }
  ]

  const hourly = sqlite.prepare(
    `select cast(strftime('%H', created_at / 1000, 'unixepoch', 'localtime') as integer) as hour,
            count(*) as n
       from visitor_events
      where created_at >= ?
      group by hour order by hour`
  ).all(start) as HourRow[]
  const hourlyCounts = Array.from({ length: 24 }, (_, hour) => hourly.find(row => row.hour === hour)?.n || 0)

  const submissionRows = sqlite.prepare(
    `select strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') as day, count(*) as n
       from recruit_submissions where created_at >= ? group by day`
  ).all(start) as { day: string, n: number }[]
  const auditRows = sqlite.prepare(
    `select strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') as day, count(*) as n
       from audit_logs where created_at >= ? group by day`
  ).all(start) as { day: string, n: number }[]
  const submissionByDay = new Map(submissionRows.map(row => [row.day, row.n]))
  const auditByDay = new Map(auditRows.map(row => [row.day, row.n]))

  const byDay = new Map(daily.map(row => [row.day, row]))
  const series: { day: string, visits: number, visitors: number }[] = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(now - i * DAY_MS)
    const row = byDay.get(key)
    series.push({ day: key, visits: row?.visits || 0, visitors: row?.visitors || 0 })
  }

  const heatmapWeeks = 26
  const heatStartDay = new Date(now - (heatmapWeeks * 7 - 1) * DAY_MS)
  heatStartDay.setHours(0, 0, 0, 0)
  const heatStart = heatStartDay.getTime() - heatStartDay.getDay() * DAY_MS
  const heatmapDays = heatmapWeeks * 7
  const heatRows = sqlite.prepare(
    `select strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') as day,
            count(*) as visits
       from visitor_events
      where created_at >= ?
      group by day`
  ).all(heatStart) as { day: string, visits: number }[]
  const heatByDay = new Map(heatRows.map(row => [row.day, row.visits]))
  const heatmap: { week: number, day: number, value: number }[] = []
  for (let i = 0; i < heatmapDays; i += 1) {
    const ms = heatStart + i * DAY_MS
    const key = dayKey(ms)
    heatmap.push({ week: Math.floor(i / 7), day: new Date(ms).getDay(), value: heatByDay.get(key) || 0 })
  }
  heatmap.sort((a, b) => a.week - b.week || a.day - b.day)

  const percent = (value: number, prev: number): number | null => {
    if (!prev) return value > 0 ? 100 : null
    return Math.round(((value - prev) / prev) * 1000) / 10
  }

  return {
    generatedAt: new Date(now).toISOString(),
    range: { days, startAt: new Date(start).toISOString() },
    kpis: [
      { key: 'visits', label: '访问量', value: currentVisits.n, previous: prevVisits.n, delta: percent(currentVisits.n, prevVisits.n), series: series.map(row => row.visits) },
      { key: 'visitors', label: '独立访客', value: currentVisitors.n, previous: prevVisitors.n, delta: percent(currentVisitors.n, prevVisitors.n), series: series.map(row => row.visitors) },
      { key: 'recruits', label: '纳新提交', value: submissions.n, previous: prevSubmissions.n, delta: percent(submissions.n, prevSubmissions.n), series: series.map(row => submissionByDay.get(row.day) || 0) },
      { key: 'audit', label: '操作记录', value: auditEvents.n, previous: prevAuditEvents.n, delta: percent(auditEvents.n, prevAuditEvents.n), series: series.map(row => auditByDay.get(row.day) || 0) }
    ],
    trend: { labels: series.map(row => row.day), visits: series.map(row => row.visits), visitors: series.map(row => row.visitors) },
    contentByKind,
    contentByStatus,
    publishedTotal,
    totalContents: contentRows.reduce((sum, row) => sum + row.n, 0),
    topPaths,
    auditActions,
    recruitFunnel,
    hourly: hourlyCounts,
    heatmapStart: new Date(heatStart).toISOString(),
    heatmapWeeks,
    heatmap
  }
})
