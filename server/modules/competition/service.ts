import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import * as XLSX from '@e965/xlsx'
import { and, asc, desc, eq, isNull, like, or } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import {
  competitionEmailImages,
  competitionEmailSends,
  competitionEmailTemplates,
  competitionEvents,
  competitionJudges,
  competitionPreRegistrations,
  competitionRoundEntries,
  competitionRounds,
  competitionScores,
  competitionSingers,
  contents
} from '../../database/schema'
import { hashPasswordWithMinLength } from '../../utils/password'
import {
  COMPETITION_MAX_DIMENSION_SCORE,
  COMPETITION_MAX_DIMENSIONS,
  COMPETITION_MAX_JUDGES,
  COMPETITION_MAX_SINGERS,
  DEFAULT_COMPETITION_DIMENSIONS,
  calculateCompetitionTotal,
  competitionMaxTotal,
  roundCompetitionScore
} from '../../../shared/utils/competition'
import type {
  CompetitionAdminPayload,
  CompetitionCallBoard,
  CompetitionCallBoardRow,
  CompetitionCurrentSinger,
  CompetitionDimension,
  CompetitionEmailImage,
  CompetitionEmailRoundStats,
  CompetitionEmailSendRecord,
  CompetitionEmailSendStatus,
  CompetitionEmailState,
  CompetitionEmailTemplate,
  CompetitionEvent,
  CompetitionFormField,
  CompetitionFormFieldKey,
  CompetitionJudge,
  CompetitionJudgeCredentials,
  CompetitionJudgePayload,
  CompetitionPreRegistration,
  CompetitionQueuePosition,
  CompetitionQueueState,
  CompetitionRegistrationStatus,
  CompetitionRound,
  CompetitionRoundEntry,
  CompetitionRoundKey,
  CompetitionRoundStatus,
  CompetitionRoundView,
  CompetitionScheduleItem,
  CompetitionScore,
  CompetitionScoreDimension,
  CompetitionSinger,
  CompetitionSingerPublic
} from '../../../shared/types'

/** 本功能仅开放给音乐协会，其他社团内容一律拒绝。 */
export const MUSIC_ASSOCIATION_SLUG = 'music-association'
export const MUSIC_ASSOCIATION_TITLE = '音乐协会'

const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const MAX_SCORE = COMPETITION_MAX_DIMENSION_SCORE
const MAX_COMMENT_LENGTH = 500
/** 现场登记里这些写法等于没报歌，一律按未填处理。 */
const COMPETITION_SONG_PLACEHOLDERS = new Set(['待定', '未定', '暂无', '无', '没有', '还没定', '没定', 'tbd', 'tba', 'na', 'n/a'])

export {
  COMPETITION_MAX_DIMENSION_SCORE,
  COMPETITION_MAX_DIMENSIONS,
  COMPETITION_MAX_JUDGES,
  COMPETITION_MAX_SINGERS,
  DEFAULT_COMPETITION_DIMENSIONS,
  calculateCompetitionTotal,
  competitionMaxTotal,
  roundCompetitionScore
} from '../../../shared/utils/competition'

interface RoundDefinition {
  key: CompetitionRoundKey
  title: string
  position: number
  advanceCount: number | null
}

/** 固定三轮；初赛取前 30，复赛名额待定（null），决赛不再晋级。 */
export const COMPETITION_ROUND_DEFINITIONS: RoundDefinition[] = [
  { key: 'prelim', title: '初赛', position: 1, advanceCount: 30 },
  { key: 'semi', title: '复赛', position: 2, advanceCount: null },
  { key: 'final', title: '决赛', position: 3, advanceCount: null }
]

function validationError(message: string, field?: string): never {
  throw createError({
    statusCode: 422,
    statusMessage: 'Validation failed',
    data: { code: 'VALIDATION_ERROR', field, message }
  })
}

function conflictError(code: string, message: string): never {
  throw createError({
    statusCode: 409,
    message,
    data: { code, message }
  })
}

export function validateCompetitionDimensions(input: unknown): CompetitionDimension[] {
  if (!Array.isArray(input) || input.length === 0) {
    validationError('至少保留一个评分维度', 'dimensions')
  }
  if (input.length > COMPETITION_MAX_DIMENSIONS) {
    validationError(`评分维度不能超过 ${COMPETITION_MAX_DIMENSIONS} 个`, 'dimensions')
  }

  const seen = new Set<string>()
  return input.map((item, index) => {
    if (!item || typeof item !== 'object') validationError(`第 ${index + 1} 个评分维度格式不正确`, 'dimensions')
    const record = item as Record<string, unknown>
    const key = String(record.key ?? '').trim() || `dimension-${index + 1}`
    if (seen.has(key)) validationError('评分维度标识重复', 'dimensions')
    seen.add(key)

    const label = String(record.label ?? '').replace(/\s+/g, ' ').trim()
    if (!label || label.length > 20) {
      validationError(`第 ${index + 1} 个评分维度名称必填且不超过 20 字`, 'dimensions')
    }
    const weight = Number(record.weight)
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      validationError(`「${label}」的占比需为 0-100 之间的正数`, 'dimensions')
    }
    return { key, label, weight: roundCompetitionScore(weight) }
  })
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function getCompetitionDimensions(row: { dimensionsJson: string }): CompetitionDimension[] {
  const parsed = parseJson<CompetitionDimension[]>(row.dimensionsJson, [])
  if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_COMPETITION_DIMENSIONS]
  return parsed
}

type EventRow = typeof competitionEvents.$inferSelect
type RoundRow = typeof competitionRounds.$inferSelect
type JudgeRow = typeof competitionJudges.$inferSelect
type EntryRow = typeof competitionRoundEntries.$inferSelect
type SingerRow = typeof competitionSingers.$inferSelect
type ScoreRow = typeof competitionScores.$inferSelect
type PreRegistrationRow = typeof competitionPreRegistrations.$inferSelect

// -- 音乐协会定位 --------------------------------------------------------------

export function findMusicAssociationContent(client: DatabaseClient) {
  const rows = client.db.select({
    id: contents.id,
    slug: contents.slug,
    title: contents.title,
    status: contents.status
  }).from(contents)
    .where(and(
      eq(contents.kind, 'club'),
      or(
        eq(contents.slug, MUSIC_ASSOCIATION_SLUG),
        eq(contents.title, MUSIC_ASSOCIATION_TITLE)
      )
    ))
    .all()

  if (rows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Music association content not found',
      data: { code: 'MUSIC_ASSOCIATION_NOT_FOUND' }
    })
  }
  return rows.find(row => row.status === 'published') ?? rows[0]!
}

export function isMusicAssociationContent(client: DatabaseClient, contentId: string): boolean {
  const row = client.db.select({ slug: contents.slug, title: contents.title })
    .from(contents)
    .where(and(eq(contents.id, contentId), eq(contents.kind, 'club')))
    .get()
  return Boolean(row
    && (row.slug === MUSIC_ASSOCIATION_SLUG || row.title === MUSIC_ASSOCIATION_TITLE))
}

export function getCompetitionClub(client: DatabaseClient, contentId: string) {
  return client.db.select({
    id: contents.id,
    slug: contents.slug,
    title: contents.title
  }).from(contents).where(eq(contents.id, contentId)).get() ?? null
}

// -- 赛事与轮次 ----------------------------------------------------------------

export function getCompetitionEventRow(client: DatabaseClient, contentId: string): EventRow | null {
  return client.db.select().from(competitionEvents)
    .where(eq(competitionEvents.contentId, contentId))
    .get() ?? null
}

function ensureRounds(client: DatabaseClient, eventId: string): RoundRow[] {
  const existing = client.db.select().from(competitionRounds)
    .where(eq(competitionRounds.eventId, eventId))
    .all()
  const byKey = new Map(existing.map(round => [round.key, round]))
  const now = Date.now()

  for (const definition of COMPETITION_ROUND_DEFINITIONS) {
    if (byKey.has(definition.key)) continue
    client.db.insert(competitionRounds).values({
      id: randomUUID(),
      eventId,
      key: definition.key,
      title: definition.title,
      position: definition.position,
      status: 'draft',
      judgeCount: 5,
      advanceCount: definition.advanceCount,
      createdAt: now,
      updatedAt: now
    }).run()
  }

  return client.db.select().from(competitionRounds)
    .where(eq(competitionRounds.eventId, eventId))
    .orderBy(asc(competitionRounds.position))
    .all()
}

/** 赛程默认值：初赛两天、复赛、决赛；后台可逐项改。 */
export const DEFAULT_COMPETITION_SCHEDULE: CompetitionScheduleItem[] = [
  { key: 'prelim', dateLabel: '11 月 14 日（周六）', timeLabel: '19:00 开始', venue: '旧区宏船楼 303', note: '第一天，唱到当天最后一位结束' },
  { key: 'prelim', dateLabel: '11 月 15 日（周日）', timeLabel: '19:00 开始', venue: '旧区宏船楼 303', note: '第二天，两天自选一天来' },
  { key: 'semi', dateLabel: '11 月 21 日（周六）', timeLabel: '19:00 开始', venue: '新区和昌讲堂', note: '30 进 12' },
  { key: 'final', dateLabel: '12 月 5 日（周六）', timeLabel: '19:00 - 21:30', venue: '旧区普照大礼堂', note: '决赛' }
]

/** 报名表单默认字段：预报名只要姓名，其余到现场再补。 */
export const DEFAULT_COMPETITION_FORM_FIELDS: CompetitionFormField[] = [
  { key: 'name', label: '姓名', required: true, enabled: true },
  { key: 'className', label: '班级', required: true, enabled: true },
  { key: 'studentNo', label: '学号', required: true, enabled: true },
  { key: 'phone', label: '联系电话', required: true, enabled: true },
  { key: 'email', label: '邮箱', required: true, enabled: true },
  { key: 'song', label: '参赛歌曲', required: true, enabled: true },
  { key: 'preferredDay', label: '打算哪天来', required: true, enabled: true }
]

const FORM_FIELD_KEYS = new Set(DEFAULT_COMPETITION_FORM_FIELDS.map(item => item.key))

/** 读赛程：库里空数组时回落到默认值。 */
export function getCompetitionSchedule(row: EventRow): CompetitionScheduleItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(row.scheduleJson || '[]')
  } catch {
    return DEFAULT_COMPETITION_SCHEDULE
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_COMPETITION_SCHEDULE
  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    const key = raw.key
    if (key !== 'prelim' && key !== 'semi' && key !== 'final') return []
    return [{
      key,
      dateLabel: String(raw.dateLabel ?? '').slice(0, 40),
      timeLabel: String(raw.timeLabel ?? '').slice(0, 40),
      venue: String(raw.venue ?? '').slice(0, 60),
      note: String(raw.note ?? '').slice(0, 80)
    }]
  })
}

/** 读表单字段：缺项补齐、顺序按默认顺序，未知 key 丢掉。 */
export function getCompetitionFormFields(row: EventRow): CompetitionFormField[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(row.formFieldsJson || '[]')
  } catch {
    return DEFAULT_COMPETITION_FORM_FIELDS
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_COMPETITION_FORM_FIELDS
  const stored = new Map<string, { label: string, required: boolean, enabled: boolean }>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const key = String(raw.key ?? '')
    if (!FORM_FIELD_KEYS.has(key as CompetitionFormFieldKey)) continue
    stored.set(key, {
      label: String(raw.label ?? '').slice(0, 20) || (DEFAULT_COMPETITION_FORM_FIELDS.find(field => field.key === key)!.label),
      required: raw.required === true,
      enabled: raw.enabled !== false
    })
  }
  if (stored.size === 0) return DEFAULT_COMPETITION_FORM_FIELDS
  return DEFAULT_COMPETITION_FORM_FIELDS
    .filter(field => stored.has(field.key))
    .map((field) => {
      const saved = stored.get(field.key)!
      return { key: field.key, ...saved }
    })
}

export function ensureCompetitionEvent(client: DatabaseClient, contentId: string): EventRow {
  const existing = getCompetitionEventRow(client, contentId)
  if (existing) {
    ensureRounds(client, existing.id)
    return existing
  }

  const now = Date.now()
  const eventId = randomUUID()
  client.db.transaction((transaction) => {
    transaction.insert(competitionEvents).values({
      id: eventId,
      contentId,
      title: '新声歌手大赛',
      edition: '',
      scheduleJson: JSON.stringify(DEFAULT_COMPETITION_SCHEDULE),
      formFieldsJson: JSON.stringify(DEFAULT_COMPETITION_FORM_FIELDS),
      dimensionsJson: JSON.stringify(DEFAULT_COMPETITION_DIMENSIONS),
      createdAt: now,
      updatedAt: now
    }).run()
  })
  ensureRounds(client, eventId)
  return getCompetitionEventRow(client, contentId)!
}

export function listRounds(client: DatabaseClient, eventId: string): RoundRow[] {
  return client.db.select().from(competitionRounds)
    .where(eq(competitionRounds.eventId, eventId))
    .orderBy(asc(competitionRounds.position))
    .all()
}

export function getRoundByKey(
  client: DatabaseClient,
  eventId: string,
  key: string
): RoundRow {
  const round = client.db.select().from(competitionRounds)
    .where(and(eq(competitionRounds.eventId, eventId), eq(competitionRounds.key, key as CompetitionRoundKey)))
    .get()
  if (!round) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Competition round not found',
      data: { code: 'NOT_FOUND' }
    })
  }
  return round
}

export function nextRoundOf(client: DatabaseClient, round: RoundRow): RoundRow | null {
  return client.db.select().from(competitionRounds)
    .where(and(
      eq(competitionRounds.eventId, round.eventId),
      eq(competitionRounds.position, round.position + 1)
    ))
    .get() ?? null
}

export function serializeCompetitionEvent(row: EventRow, club: { slug: string, title: string }): CompetitionEvent {
  const dimensions = getCompetitionDimensions(row)
  return {
    id: row.id,
    contentId: row.contentId,
    clubName: club.title,
    clubSlug: club.slug,
    title: row.title,
    registrationOpen: row.registrationOpen !== false,
    edition: row.edition ?? '',
    schedule: getCompetitionSchedule(row),
    formFields: getCompetitionFormFields(row),
    dimensions,
    maxTotal: competitionMaxTotal(dimensions),
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? 0)
  }
}

export function serializeRound(row: RoundRow): CompetitionRound {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    position: row.position,
    status: row.status,
    judgeCount: row.judgeCount,
    advanceCount: row.advanceCount,
    activeDay: row.activeDay ?? null,
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? 0)
  }
}

export function serializeJudge(row: JudgeRow, scoreCount = 0): CompetitionJudge {
  return {
    id: row.id,
    roundId: row.roundId,
    username: row.username,
    displayName: row.displayName,
    isActive: row.isActive,
    day: row.day ?? null,
    lastLoginAt: row.lastLoginAt ? Number(row.lastLoginAt) : null,
    createdAt: Number(row.createdAt ?? 0),
    scoreCount
  }
}

export function serializeSingerPublic(row: SingerRow): CompetitionSingerPublic {
  return {
    id: row.id,
    name: row.name,
    song: row.song,
    className: row.className,
    remark: row.remark,
    sortOrder: row.sortOrder,
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? 0)
  }
}

export function serializeSinger(row: SingerRow): CompetitionSinger {
  return {
    ...serializeSingerPublic(row),
    studentNo: row.studentNo,
    phone: row.phone,
    email: row.email,
    source: row.source,
    preRegistrationId: row.preRegistrationId
  }
}

export function serializeScore(row: ScoreRow, judgeName: string): CompetitionScore {
  return {
    id: row.id,
    roundId: row.roundId,
    singerId: row.singerId,
    judgeId: row.judgeId,
    judgeName,
    dimensions: parseJson<CompetitionScoreDimension[]>(row.dimensionsJson, []),
    total: roundCompetitionScore(Number(row.totalScore ?? 0)),
    comment: row.comment ?? '',
    updatedAt: Number(row.updatedAt ?? row.createdAt ?? 0)
  }
}

export interface UpdateCompetitionInput {
  title: unknown
  registrationOpen: unknown
  dimensions: unknown
  edition?: unknown
  schedule?: unknown
  formFields?: unknown
}

function normalizeSchedule(input: unknown): CompetitionScheduleItem[] {
  if (!Array.isArray(input)) validationError('赛程格式不正确', 'schedule')
  const items: CompetitionScheduleItem[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const key = item.key
    if (key !== 'prelim' && key !== 'semi' && key !== 'final') continue
    items.push({
      key,
      dateLabel: String(item.dateLabel ?? '').trim().slice(0, 40),
      timeLabel: String(item.timeLabel ?? '').trim().slice(0, 40),
      venue: String(item.venue ?? '').trim().slice(0, 60),
      note: String(item.note ?? '').trim().slice(0, 80)
    })
  }
  if (items.length === 0) validationError('赛程至少要有一行', 'schedule')
  return items
}

function normalizeFormFields(input: unknown): CompetitionFormField[] {
  if (!Array.isArray(input)) validationError('表单字段格式不正确', 'formFields')
  const byKey = new Map<string, CompetitionFormField>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const key = String(item.key ?? '')
    if (!FORM_FIELD_KEYS.has(key as CompetitionFormFieldKey)) continue
    byKey.set(key, {
      key: key as CompetitionFormFieldKey,
      label: String(item.label ?? '').trim().slice(0, 20) || '未命名字段',
      required: item.required === true,
      enabled: item.enabled !== false
    })
  }
  if (!byKey.has('name')) {
    byKey.set('name', { key: 'name', label: '姓名', required: true, enabled: true })
  }
  return DEFAULT_COMPETITION_FORM_FIELDS
    .filter(field => byKey.has(field.key))
    .map(field => byKey.get(field.key)!)
}

export function updateCompetitionEvent(
  client: DatabaseClient,
  row: EventRow,
  input: UpdateCompetitionInput
): EventRow {
  const title = String(input.title ?? '').replace(/\s+/g, ' ').trim()
  if (!title || title.length > 60) validationError('比赛名称必填且不超过 60 字', 'title')
  const registrationOpen = input.registrationOpen === true
  const dimensions = validateCompetitionDimensions(input.dimensions)
  const edition = String(input.edition ?? row.edition ?? '').trim().slice(0, 40)
  const schedule = input.schedule === undefined
    ? getCompetitionSchedule(row)
    : normalizeSchedule(input.schedule)
  const formFields = input.formFields === undefined
    ? getCompetitionFormFields(row)
    : normalizeFormFields(input.formFields)

  const currentDimensions = getCompetitionDimensions(row)
  if (JSON.stringify(currentDimensions) !== JSON.stringify(dimensions)) {
    const scoreCount = client.db.select({ id: competitionScores.id }).from(competitionScores)
      .where(eq(competitionScores.eventId, row.id)).all().length
    if (scoreCount > 0) {
      conflictError('COMPETITION_HAS_SCORES', '比赛已有评分，不能修改评分维度或占比；请在评分开始前完成设置')
    }
  }

  client.db.update(competitionEvents).set({
    title,
    registrationOpen,
    edition,
    scheduleJson: JSON.stringify(schedule),
    formFieldsJson: JSON.stringify(formFields),
    dimensionsJson: JSON.stringify(dimensions),
    updatedAt: Date.now()
  }).where(eq(competitionEvents.id, row.id)).run()

  return getCompetitionEventRow(client, row.contentId)!
}

export interface UpdateRoundInput {
  status?: unknown
  judgeCount?: unknown
  advanceCount?: unknown
}

export function updateRound(
  client: DatabaseClient,
  round: RoundRow,
  input: UpdateRoundInput
): RoundRow {
  const nextRound = nextRoundOf(client, round)
  const downstreamEntries = nextRound ? countEntries(client, nextRound.id) : 0
  const scores = countRoundScores(client, round.id)
  const patch: Partial<typeof competitionRounds.$inferInsert> = { updatedAt: Date.now() }

  if (input.status !== undefined) {
    const status = String(input.status) as CompetitionRoundStatus
    if (!['draft', 'open', 'closed'].includes(status)) validationError('轮次状态无效', 'status')

    if (status === 'open' && countEntries(client, round.id) === 0) {
      validationError('本轮还没有参赛名单，不能开放评分', 'status')
    }
    if (round.status === 'closed' && status !== 'closed' && downstreamEntries > 0) {
      conflictError('ROUND_DOWNSTREAM_LOCKED', '下一轮名单已生成，不能重新打开上一轮；请先清空下一轮名单')
    }
    if (status === 'draft' && scores > 0) {
      conflictError('ROUND_HAS_SCORES', '本轮已有评分，不能退回未开始状态')
    }
    patch.status = status
    // 结束本轮时退出顺序评分，避免下一位还挂着人。
    if (status === 'closed') patch.currentEntryId = null
  }

  if (input.judgeCount !== undefined) {
    const judgeCount = Number(input.judgeCount)
    if (!Number.isInteger(judgeCount) || judgeCount < 1 || judgeCount > COMPETITION_MAX_JUDGES) {
      validationError(`评委人数需为 1-${COMPETITION_MAX_JUDGES} 的整数`, 'judgeCount')
    }
    patch.judgeCount = judgeCount
  }

  if (round.key === 'final') {
    patch.advanceCount = null
  } else if (input.advanceCount !== undefined) {
    let advanceCount: number | null = null
    if (input.advanceCount !== null && String(input.advanceCount).trim() !== '') {
      const value = Number(input.advanceCount)
      if (!Number.isInteger(value) || value < 1 || value > COMPETITION_MAX_SINGERS) {
        validationError('晋级人数需为正整数', 'advanceCount')
      }
      advanceCount = value
    }
    if (round.key === 'prelim' && advanceCount === null) {
      validationError('初赛需设置晋级人数（默认前 30）', 'advanceCount')
    }
    if (round.advanceCount !== advanceCount && downstreamEntries > 0) {
      conflictError('ROUND_ADVANCE_LOCKED', '下一轮名单已生成，不能修改本轮晋级人数；请先清空下一轮名单')
    }
    patch.advanceCount = advanceCount
  }

  client.db.update(competitionRounds).set(patch).where(eq(competitionRounds.id, round.id)).run()
  return client.db.select().from(competitionRounds)
    .where(eq(competitionRounds.id, round.id)).get()!
}

// -- 名单与排名 ----------------------------------------------------------------

function countEntries(client: DatabaseClient, roundId: string): number {
  return client.db.select({ id: competitionRoundEntries.id }).from(competitionRoundEntries)
    .where(eq(competitionRoundEntries.roundId, roundId)).all().length
}

function countRoundScores(client: DatabaseClient, roundId: string): number {
  return client.db.select({ id: competitionScores.id }).from(competitionScores)
    .where(eq(competitionScores.roundId, roundId)).all().length
}

export function listSingers(client: DatabaseClient, eventId: string): SingerRow[] {
  return client.db.select().from(competitionSingers)
    .where(eq(competitionSingers.eventId, eventId))
    .orderBy(asc(competitionSingers.sortOrder), asc(competitionSingers.createdAt))
    .all()
}

export function listJudges(client: DatabaseClient, eventId: string): JudgeRow[] {
  return client.db.select().from(competitionJudges)
    .where(eq(competitionJudges.eventId, eventId))
    .orderBy(asc(competitionJudges.createdAt))
    .all()
}

export function listRoundJudges(client: DatabaseClient, roundId: string): JudgeRow[] {
  return client.db.select().from(competitionJudges)
    .where(eq(competitionJudges.roundId, roundId))
    .orderBy(asc(competitionJudges.createdAt))
    .all()
}

export function listRoundScores(client: DatabaseClient, roundId: string): ScoreRow[] {
  return client.db.select().from(competitionScores)
    .where(eq(competitionScores.roundId, roundId))
    .orderBy(desc(competitionScores.updatedAt))
    .all()
}

export function listRoundEntryRows(client: DatabaseClient, roundId: string): EntryRow[] {
  return client.db.select().from(competitionRoundEntries)
    .where(eq(competitionRoundEntries.roundId, roundId))
    .orderBy(asc(competitionRoundEntries.sortOrder), asc(competitionRoundEntries.createdAt))
    .all()
}

function averageOf(totals: number[]): number | null {
  if (totals.length === 0) return null
  return roundCompetitionScore(totals.reduce((sum, value) => sum + value, 0) / totals.length)
}

/**
 * 本轮排名：有分选手按平均分降序，同分按本轮出场顺序靠前者优先；
 * 未评分选手排在最后。本轮结束后仍未评分的标记为弃权。
 *
 * 名次只在整轮结束后给（初赛两天共用一轮，中途不出排名，免得第一天就看出
 * 谁进谁出）；评分进行中按出场顺序排，名次列为空，平均分照常算，记分与
 * 复核要用。
 */
export /**
 * 现场状态：正在唱的、已唱完的、前面还有几位的，都按「当天出场顺序」算。
 * 没开顺序评分时，只区分已打分 / 未打分。
 */
function buildQueueBoard(
  round: RoundRow,
  entries: EntryRow[],
  scoreRows: ScoreRow[],
  alreadyScoped = false
): Map<string, { state: CompetitionQueueState, ahead: number | null, position: number | null }> {
  const board = new Map<string, { state: CompetitionQueueState, ahead: number | null, position: number | null }>()
  const dayEntries = alreadyScoped ? entries : entriesForDay(round, entries)
  const singingIndex = round.currentEntryId
    ? dayEntries.findIndex(entry => entry.id === round.currentEntryId)
    : -1
  const scoredSingerIds = new Set(scoreRows.map(score => score.singerId))

  dayEntries.forEach((entry, index) => {
    const position = index + 1
    if (singingIndex >= 0) {
      if (index < singingIndex) {
        board.set(entry.id, { state: 'finished', ahead: null, position })
      } else if (index === singingIndex) {
        board.set(entry.id, { state: 'singing', ahead: 0, position })
      } else {
        board.set(entry.id, { state: 'waiting', ahead: index - singingIndex - 1, position })
      }
      return
    }
    board.set(entry.id, {
      state: scoredSingerIds.has(entry.singerId) ? 'finished' : 'idle',
      // 没开顺序评分时，队伍就是名单顺序：前面还有 index 个人。
      ahead: index,
      position
    })
  })
  return board
}

function buildRoundRanking(
  round: RoundRow,
  entries: EntryRow[],
  singersById: Map<string, SingerRow>,
  scoreRows: ScoreRow[]
): CompetitionRoundEntry[] {
  const totalsBySinger = new Map<string, number[]>()
  for (const score of scoreRows) {
    const list = totalsBySinger.get(score.singerId) ?? []
    list.push(roundCompetitionScore(Number(score.totalScore ?? 0)))
    totalsBySinger.set(score.singerId, list)
  }

  const rows = entries
    .map((entry) => {
      const singer = singersById.get(entry.singerId)
      if (!singer) return null
      const totals = totalsBySinger.get(entry.singerId) ?? []
      return {
        entry,
        singer,
        average: averageOf(totals),
        scoreCount: totals.length
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  const scored = rows
    .filter(row => row.average !== null)
    .sort((left, right) =>
      (right.average! - left.average!)
      || (left.entry.sortOrder - right.entry.sortOrder)
      || left.singer.name.localeCompare(right.singer.name, 'zh-Hans-CN'))
  const unscored = rows
    .filter(row => row.average === null)
    .sort((left, right) =>
      (left.entry.sortOrder - right.entry.sortOrder)
      || left.singer.name.localeCompare(right.singer.name, 'zh-Hans-CN'))

  const settled = round.status === 'closed'
  if (!settled) {
    // 未结束：按出场顺序平铺，不给名次。
    return rows
      .slice()
      .sort((left, right) =>
        (left.entry.sortOrder - right.entry.sortOrder)
        || left.singer.name.localeCompare(right.singer.name, 'zh-Hans-CN'))
      .map(row => ({
        id: row.entry.id,
        singer: serializeSingerPublic(row.singer),
        sortOrder: row.entry.sortOrder,
        contestDay: row.entry.contestDay ?? null,
        checkedInAt: row.entry.checkedInAt ?? null,
        advancedFromRank: row.entry.advancedFromRank,
        average: row.average,
        scoreCount: row.scoreCount,
        rank: null,
        qualified: false,
        forfeited: false
      }))
  }

  const result: CompetitionRoundEntry[] = []
  let lastAverage: number | null = null
  let lastRank = 0
  scored.forEach((row, index) => {
    if (lastAverage === null || row.average !== lastAverage) {
      lastRank = index + 1
      lastAverage = row.average
    }
    result.push({
      id: row.entry.id,
      singer: serializeSingerPublic(row.singer),
      sortOrder: row.entry.sortOrder,
      contestDay: row.entry.contestDay ?? null,
      checkedInAt: row.entry.checkedInAt ?? null,
      advancedFromRank: row.entry.advancedFromRank,
      average: row.average,
      scoreCount: row.scoreCount,
      rank: lastRank,
      qualified: round.status === 'closed'
        && round.advanceCount !== null
        && index < round.advanceCount,
      forfeited: false
    })
  })
  for (const row of unscored) {
    result.push({
      id: row.entry.id,
      singer: serializeSingerPublic(row.singer),
      sortOrder: row.entry.sortOrder,
      contestDay: row.entry.contestDay ?? null,
      checkedInAt: row.entry.checkedInAt ?? null,
      advancedFromRank: row.entry.advancedFromRank,
      average: null,
      scoreCount: 0,
      rank: null,
      qualified: false,
      forfeited: round.status === 'closed'
    })
  }
  return result
}

/**
 * 顺序评分：当前这位选手 + 本场提交情况。
 *
 * `round.currentEntryId` 为空、或指向已被删掉的条目时返回 null（等同未开启
 * 顺序评分，评委可自由打分）。`pending` 只算启用中的评委，停用的人不计入，
 * 否则一停用就永远凑不齐、切不了下一位。
 *
 * 收票门槛不是「账号数」，而是本轮 `judgeCount`（本场到岗人数）：初赛两天
 * 共用同一个 prelim 轮，账号里既有 14 号的人也有 15 号的人，9 个账号只有 6
 * 个当天在场，所以 6 票齐了就该切下一位。
 */
/** 分天时只取当天的出场名单；不分天时返回全部。 */
export function entriesForDay(round: RoundRow, entries: EntryRow[]): EntryRow[] {
  if (!round.activeDay) return entries
  return entries.filter(entry => entry.contestDay === round.activeDay)
}

/**
 * 当天已现场签到的人。评委看谁、顺序评分走到谁、排队人数算多少，都以这一批
 * 为准：提前导入但还没到场的名字不占位置，也不进评委的名单。
 */
export function presentEntriesForDay(round: RoundRow, entries: EntryRow[]): EntryRow[] {
  return entriesForDay(round, entries).filter(entry => entry.checkedInAt != null)
}

/** 赛程里初赛那两行的真实日期，用来判断「今天该排哪一天的队」。 */
const COMPETITION_DATE_PATTERN = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/

export function prelimDayDates(eventRow: EventRow): { day: 1 | 2, dateKey: string }[] {
  const year = Number(String(eventRow.edition ?? '').match(/\d{4}/)?.[0] ?? new Date().getFullYear())
  const dates: string[] = []
  for (const item of getCompetitionSchedule(eventRow)) {
    if (item.key !== 'prelim') continue
    const matched = COMPETITION_DATE_PATTERN.exec(item.dateLabel)
    if (!matched) continue
    const month = String(Number(matched[1])).padStart(2, '0')
    const day = String(Number(matched[2])).padStart(2, '0')
    dates.push(`${year}-${month}-${day}`)
  }
  return dates.slice(0, 2).map((dateKey, index) => ({ day: (index + 1) as 1 | 2, dateKey }))
}

function shanghaiDateKey(now: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(now))
}

/**
 * 今天排哪一天：管理员手动切天优先；没切就按赛程里的初赛日期比对系统日期。
 * source 为 date 且 day 为空，说明今天不是初赛日，现场不该收人。
 */
export function resolvePrelimDay(
  eventRow: EventRow,
  round: RoundRow,
  now: number = Date.now()
): { day: 1 | 2 | null, source: 'active' | 'date' | 'unknown' } {
  if (round.activeDay === 1 || round.activeDay === 2) return { day: round.activeDay, source: 'active' }
  const dates = prelimDayDates(eventRow)
  if (dates.length === 0) return { day: null, source: 'unknown' }
  const today = shanghaiDateKey(now)
  const matched = dates.find(item => item.dateKey === today)
  return matched ? { day: matched.day, source: 'date' } : { day: null, source: 'date' }
}

/** 分天时只算当天到岗的启用评委；不分天时是全部启用评委。 */
export function judgesForDay(client: DatabaseClient, round: RoundRow): JudgeRow[] {
  const active = listRoundJudges(client, round.id).filter(judge => judge.isActive)
  if (!round.activeDay) return active
  const onDuty = active.filter(judge => judge.day === null || judge.day === round.activeDay)
  return onDuty.length > 0 ? onDuty : active
}

export function requiredJudgeCount(client: DatabaseClient, round: RoundRow): number {
  if (round.activeDay) {
    // 分天：当天到岗的启用评委就是收票数。judgeCount 只在不分天时生效。
    return Math.max(1, judgesForDay(client, round).length)
  }
  const activeCount = listRoundJudges(client, round.id).filter(judge => judge.isActive).length
  const wanted = Math.max(1, Number(round.judgeCount) || 1)
  return Math.min(activeCount, wanted)
}

export function buildCurrentSinger(
  client: DatabaseClient,
  round: RoundRow,
  entries: EntryRow[],
  singersById: Map<string, SingerRow>,
  scoreRows: ScoreRow[]
): CompetitionCurrentSinger | null {
  if (!round.currentEntryId) return null
  const dayEntries = entriesForDay(round, entries)
  const index = dayEntries.findIndex(entry => entry.id === round.currentEntryId)
  if (index < 0) return null
  const entry = dayEntries[index]
  if (!entry) return null
  const singer = singersById.get(entry.singerId)
  if (!singer) return null

  const judges = judgesForDay(client, round)
  const judgedTotal = requiredJudgeCount(client, round)
  const scoredJudgeIds = new Set(
    scoreRows.filter(score => score.singerId === entry.singerId).map(score => score.judgeId)
  )
  const submitted: string[] = []
  const missing: string[] = []
  const progress = judges.map((judge) => {
    const done = scoredJudgeIds.has(judge.id)
    if (done) submitted.push(judge.displayName)
    else missing.push(judge.displayName)
    return { id: judge.id, name: judge.displayName, submitted: done }
  })
  // 还差几位就只列几位：本场 6 人、账号 9 个时，5 票时不能喊「还差 4 位」。
  const pending = missing.slice(0, Math.max(0, judgedTotal - submitted.length))

  return {
    entryId: entry.id,
    singer: serializeSingerPublic(singer),
    index: index + 1,
    total: dayEntries.length,
    judgeTotal: judgedTotal,
    day: round.activeDay ?? null,
    judges: progress,
    submitted,
    pending,
    allSubmitted: judgedTotal > 0 && submitted.length >= judgedTotal
  }
}

/** 提交/切人之后重新取一次当前状态。 */
export function getCurrentSinger(
  client: DatabaseClient,
  round: RoundRow
): CompetitionCurrentSinger | null {
  if (!round.currentEntryId) return null
  const entries = listRoundEntryRows(client, round.id)
  const singersById = new Map(listSingers(client, round.eventId).map(singer => [singer.id, singer]))
  return buildCurrentSinger(client, round, entries, singersById, listRoundScores(client, round.id))
}

function setCurrentEntryId(
  client: DatabaseClient,
  roundId: string,
  entryId: string | null
): void {
  client.db.update(competitionRounds)
    .set({ currentEntryId: entryId, updatedAt: Date.now() })
    .where(eq(competitionRounds.id, roundId))
    .run()
}

export type CurrentEntryAction = 'start' | 'next' | 'prev' | 'skip' | 'stop' | 'set'

/**
 * 顺序评分切人。
 *
 * - `start`：从第一位开始（已在评某人时保持不变）
 * - `next`：全员提交才允许，缺人时 409 `COMPETITION_PENDING_JUDGES` 并带上缺谁
 * - `skip`：不管提交情况强制下一位（选手弃权/临时缺席）
 * - `prev`：回上一位改分；回去后评审再提交不会自动往前推，等管理员点 next
 * - `stop`：退出顺序评分，评委恢复自由打分
 * - `set`：指到指定条目
 */
export function moveCurrentEntry(
  client: DatabaseClient,
  round: RoundRow,
  action: CurrentEntryAction,
  entryId?: string
): CompetitionCurrentSinger | null {
  if (round.status !== 'open') {
    conflictError('ROUND_NOT_OPEN', '请先开放本轮评分，再控制出场顺序')
  }
  const entries = presentEntriesForDay(round, listRoundEntryRows(client, round.id))
  if (entries.length === 0) {
    validationError(round.activeDay ? '这一天的名单还是空的，先把选手分配到这一天' : '本轮还没有出场名单', 'entries')
  }

  const currentIndex = round.currentEntryId
    ? entries.findIndex(entry => entry.id === round.currentEntryId)
    : -1

  if (action === 'stop') {
    setCurrentEntryId(client, round.id, null)
    return null
  }

  if (action === 'set') {
    const target = entries.find(entry => entry.id === entryId)
    if (!target) validationError('出场条目不存在', 'entryId')
    setCurrentEntryId(client, round.id, target!.id)
    return buildCurrentSinger(
      client,
      { ...round, currentEntryId: target!.id },
      entries,
      new Map(listSingers(client, round.eventId).map(singer => [singer.id, singer])),
      listRoundScores(client, round.id)
    )
  }

  if (action === 'prev') {
    const target = entries[Math.max(0, currentIndex - 1)]
    if (!target) validationError('本轮还没有出场名单', 'entries')
    setCurrentEntryId(client, round.id, target.id)
    return getCurrentSinger(client, { ...round, currentEntryId: target.id })
  }

  if (action === 'start' || currentIndex < 0) {
    const target = entries[currentIndex >= 0 ? currentIndex : 0]
    if (!target) validationError('本轮还没有出场名单', 'entries')
    setCurrentEntryId(client, round.id, target.id)
    return getCurrentSinger(client, { ...round, currentEntryId: target.id })
  }

  if (action === 'next') {
    const current = getCurrentSinger(client, round)
    if (current && !current.allSubmitted) {
      conflictError(
        'COMPETITION_PENDING_JUDGES',
        `还有 ${current.pending.length} 位评委没提交：${current.pending.join('、')}；确认弃评请用「跳过此人」`
      )
    }
  }

  const target = entries[currentIndex + 1] ?? null
  setCurrentEntryId(client, round.id, target ? target.id : null)
  return target ? getCurrentSinger(client, { ...round, currentEntryId: target.id }) : null
}

function roundView(
  client: DatabaseClient,
  round: RoundRow,
  singers: SingerRow[],
  dimensions: CompetitionDimension[]
): CompetitionRoundView {
  const entries = listRoundEntryRows(client, round.id)
  const scoreRows = listRoundScores(client, round.id)
  const judges = listRoundJudges(client, round.id)
  const judgeNameById = new Map(judges.map(judge => [judge.id, judge.displayName]))
  const singersById = new Map(singers.map(singer => [singer.id, singer]))
  const scoreCountByJudge = new Map<string, number>()
  for (const score of scoreRows) {
    scoreCountByJudge.set(score.judgeId, (scoreCountByJudge.get(score.judgeId) ?? 0) + 1)
  }

  const presentEntries = presentEntriesForDay(round, entries)
  const queueBoard = buildQueueBoard(round, presentEntries, scoreRows, true)
  const rankedEntries = buildRoundRanking(round, entries, singersById, scoreRows).map((entry) => {
    const board = queueBoard.get(entry.id)
    return {
      ...entry,
      queueState: board?.state ?? 'idle',
      ahead: board?.ahead ?? null,
      queuePosition: board?.position ?? null
    }
  })

  return {
    ...serializeRound(round),
    entries: rankedEntries,
    judges: judges.map(judge => serializeJudge(judge, scoreCountByJudge.get(judge.id) ?? 0)),
    scores: scoreRows.map(score => serializeScore(score, judgeNameById.get(score.judgeId) ?? '评委')),
    maxTotal: competitionMaxTotal(dimensions),
    hasScores: scoreRows.length > 0,
    current: buildCurrentSinger(client, round, presentEntries, singersById, scoreRows)
  }
}

/**
 * 扫码登记的选手看自己的排队情况：他在初赛第几位、前面还有几位、是不是正在唱。
 * 只回人数与状态，不回别人的姓名。
 */
/**
 * 免登录叫号台：只列当天已经签到的选手，按出场顺序给序号与状态。
 * 不返回电话、邮箱、评分——叫号的人只需要知道谁该上台。
 */
export function getCallBoard(client: DatabaseClient, contentId: string): CompetitionCallBoard {
  const eventRow = ensureCompetitionEvent(client, contentId)
  const prelim = getRoundByKey(client, eventRow.id, 'prelim')
  const entries = presentEntriesForDay(prelim, listRoundEntryRows(client, prelim.id))
  const singersById = new Map(listSingers(client, prelim.eventId).map(singer => [singer.id, singer]))
  const board = buildQueueBoard(prelim, entries, listRoundScores(client, prelim.id), true)

  const rows: CompetitionCallBoardRow[] = []
  entries.forEach((entry, index) => {
    const singer = singersById.get(entry.singerId)
    if (!singer) return
    const seat = board.get(entry.id)
    rows.push({
      position: seat?.position ?? index + 1,
      name: singer.name,
      song: singer.song ?? '',
      className: singer.className ?? '',
      state: seat?.state ?? 'idle',
      ahead: seat?.ahead ?? null
    })
  })

  return {
    round: {
      key: prelim.key,
      title: prelim.title,
      status: prelim.status,
      activeDay: prelim.activeDay === 1 || prelim.activeDay === 2 ? prelim.activeDay : null
    },
    total: rows.length,
    current: rows.find(row => row.state === 'singing') ?? null,
    next: rows.find(row => row.state === 'waiting' && row.ahead === 0) ?? null,
    rows,
    updatedAt: Date.now()
  }
}

export function getSingerQueuePosition(
  client: DatabaseClient,
  contentId: string,
  singerId: string
): CompetitionQueuePosition {
  const eventRow = ensureCompetitionEvent(client, contentId)
  const prelim = getRoundByKey(client, eventRow.id, 'prelim')
  const entries = listRoundEntryRows(client, prelim.id)
  const mine = entries.find(item => item.singerId === singerId)
  // 同一天的排同一天的队：按这位选手自己登记的场次算，不按管理员此刻停在哪天。
  const day = mine?.contestDay ?? prelim.activeDay ?? null
  const dayEntries = (day ? entries.filter(item => item.contestDay === day) : entries)
    .filter(item => item.checkedInAt != null)
  if (!mine) {
    return { state: 'unknown', ahead: null, position: null, total: dayEntries.length }
  }
  if (mine.checkedInAt == null) {
    return { state: 'idle', ahead: null, position: null, total: dayEntries.length }
  }
  const board = buildQueueBoard(prelim, dayEntries, listRoundScores(client, prelim.id), true)
  const seat = board.get(mine.id)
  return {
    state: seat?.state ?? 'idle',
    ahead: seat?.ahead ?? null,
    position: seat?.position ?? null,
    total: dayEntries.length
  }
}

export function getAdminCompetitionPayload(client: DatabaseClient, contentId: string): CompetitionAdminPayload {
  const club = getCompetitionClub(client, contentId)
  if (!club) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Music association content not found',
      data: { code: 'MUSIC_ASSOCIATION_NOT_FOUND' }
    })
  }

  const eventRow = ensureCompetitionEvent(client, contentId)
  const dimensions = getCompetitionDimensions(eventRow)
  const singers = listSingers(client, eventRow.id)
  const rounds = listRounds(client, eventRow.id)

  return {
    event: serializeCompetitionEvent(eventRow, club),
    singers: singers.map(serializeSinger),
    rounds: rounds.map(round => roundView(client, round, singers, dimensions)),
    email: listEmailState(client, eventRow.id),
    preRegistrations: listPreRegistrations(client, eventRow.id)
  }
}

// -- 晋级与抽签 ----------------------------------------------------------------

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    const current = copy[index]!
    copy[index] = copy[swapIndex]!
    copy[swapIndex] = current
  }
  return copy
}

export function generateNextRound(
  client: DatabaseClient,
  currentRound: RoundRow
): { round: RoundRow, advanced: number } {
  const nextRound = nextRoundOf(client, currentRound)
  if (!nextRound) validationError('决赛没有下一轮', 'round')
  if (currentRound.status !== 'closed') {
    conflictError('ROUND_NOT_CLOSED', '请先结束本轮评分，再生成下一轮名单')
  }
  if (currentRound.advanceCount === null) {
    validationError('请先设置本轮晋级人数', 'advanceCount')
  }
  if (countRoundScores(client, nextRound.id) > 0) {
    conflictError('NEXT_ROUND_HAS_SCORES', '下一轮已有评分，不能重新生成名单')
  }
  if (countEntries(client, nextRound.id) > 0) {
    conflictError('NEXT_ROUND_ALREADY_GENERATED', '下一轮名单已生成；如需重做，请先清空下一轮名单')
  }

  const singers = listSingers(client, currentRound.eventId)
  const singersById = new Map(singers.map(singer => [singer.id, singer]))
  const ranking = buildRoundRanking(
    currentRound,
    listRoundEntryRows(client, currentRound.id),
    singersById,
    listRoundScores(client, currentRound.id)
  )
  const qualified = ranking
    .filter(row => row.scoreCount > 0)
    .slice(0, currentRound.advanceCount)

  if (qualified.length === 0) {
    validationError('本轮没有有效成绩（全部弃权），无法生成下一轮名单', 'round')
  }

  const shuffled = shuffle(qualified)
  const now = Date.now()
  client.db.transaction((transaction) => {
    shuffled.forEach((row, index) => {
      transaction.insert(competitionRoundEntries).values({
        id: randomUUID(),
        roundId: nextRound.id,
        singerId: row.singer.id,
        sortOrder: index + 1,
        advancedFromRank: row.rank,
        createdAt: now
      }).run()
    })
    transaction.update(competitionRounds).set({
      status: 'draft',
      updatedAt: now
    }).where(eq(competitionRounds.id, nextRound.id)).run()
  })

  return {
    round: client.db.select().from(competitionRounds)
      .where(eq(competitionRounds.id, nextRound.id)).get()!,
    advanced: qualified.length
  }
}

export function redrawRound(client: DatabaseClient, round: RoundRow): void {
  if (round.key === 'prelim') validationError('初赛按导入顺序出场，不能重新抽签', 'round')
  if (round.status === 'closed') conflictError('ROUND_CLOSED', '本轮已结束，不能重新抽签')
  if (countRoundScores(client, round.id) > 0) {
    conflictError('ROUND_HAS_SCORES', '本轮已有评分，不能重新抽签')
  }
  const entries = listRoundEntryRows(client, round.id)
  if (entries.length < 2) validationError('本轮名单不足 2 人，无需抽签', 'round')

  const shuffled = shuffle(entries)
  client.db.transaction((transaction) => {
    shuffled.forEach((entry, index) => {
      transaction.update(competitionRoundEntries).set({ sortOrder: index + 1 })
        .where(eq(competitionRoundEntries.id, entry.id))
        .run()
    })
    // 顺序变了，原来指着的「当前选手」已经没意义。
    transaction.update(competitionRounds).set({
      currentEntryId: null,
      updatedAt: Date.now()
    }).where(eq(competitionRounds.id, round.id)).run()
  })
}

/** 管理员手动调整出场顺序：提交本轮完整、无重复的 entryId 列表。 */
/**
 * 拖动排序：把 entryId 挪到 targetId 的前面或后面，其余顺序不变。
 * 分天时只显示当天名单，但服务端按整轮列表重排，避免把另一天的选手冲掉。
 */
export function moveRoundEntry(
  client: DatabaseClient,
  round: RoundRow,
  entryId: string,
  targetId: string,
  place: 'before' | 'after' = 'before'
): void {
  if (round.status === 'closed') {
    conflictError('ROUND_CLOSED', '本轮已结束，出场顺序已锁定')
  }
  if (entryId === targetId) return

  const entries = listRoundEntryRows(client, round.id)
  const fromIndex = entries.findIndex(entry => entry.id === entryId)
  if (fromIndex < 0) validationError('没有找到要移动的选手', 'entryId')
  if (!entries.some(entry => entry.id === targetId)) validationError('没有找到目标位置', 'targetId')

  const [moved] = entries.splice(fromIndex, 1)
  if (!moved) return
  const targetIndex = entries.findIndex(entry => entry.id === targetId)
  entries.splice(targetIndex + (place === 'after' ? 1 : 0), 0, moved)

  client.db.transaction((transaction) => {
    entries.forEach((entry, index) => {
      transaction.update(competitionRoundEntries).set({ sortOrder: index + 1 })
        .where(eq(competitionRoundEntries.id, entry.id))
        .run()
    })
  })
}

export function reorderRoundEntries(
  client: DatabaseClient,
  round: RoundRow,
  entryIds: string[]
): void {
  if (round.status === 'closed') {
    conflictError('ROUND_CLOSED', '本轮已结束，出场顺序已锁定')
  }
  const entries = listRoundEntryRows(client, round.id)
  if (entryIds.length !== entries.length) {
    validationError('顺序列表必须包含本轮全部选手', 'entryIds')
  }
  const validIds = new Set(entries.map(entry => entry.id))
  const seen = new Set<string>()
  for (const id of entryIds) {
    if (!validIds.has(id) || seen.has(id)) {
      validationError('顺序列表包含无效或重复的选手', 'entryIds')
    }
    seen.add(id)
  }

  client.db.transaction((transaction) => {
    entryIds.forEach((entryId, index) => {
      transaction.update(competitionRoundEntries).set({ sortOrder: index + 1 })
        .where(eq(competitionRoundEntries.id, entryId))
        .run()
    })
    transaction.update(competitionRounds).set({
      currentEntryId: null,
      updatedAt: Date.now()
    }).where(eq(competitionRounds.id, round.id)).run()
  })
}

export function clearRoundRoster(client: DatabaseClient, round: RoundRow): void {
  if (round.key === 'prelim') validationError('初赛名单来自选手库，不能清空', 'round')
  if (round.status === 'open') conflictError('ROUND_OPEN', '请先暂停/结束本轮评分，再清空名单')
  if (countRoundScores(client, round.id) > 0) {
    conflictError('ROUND_HAS_SCORES', '本轮已有评分，不能清空名单')
  }
  const nextRound = nextRoundOf(client, round)
  if (nextRound && countEntries(client, nextRound.id) > 0) {
    conflictError('ROUND_DOWNSTREAM_LOCKED', '下一轮名单已生成，请先清空下一轮名单')
  }

  client.db.transaction((transaction) => {
    transaction.delete(competitionRoundEntries)
      .where(eq(competitionRoundEntries.roundId, round.id))
      .run()
    transaction.update(competitionRounds).set({
      status: 'draft',
      currentEntryId: null,
      updatedAt: Date.now()
    }).where(eq(competitionRounds.id, round.id)).run()
  })
}

// -- 初赛分天 ------------------------------------------------------------------

/**
 * 切换赛程天（初赛两天共用 prelim 轮）。
 *
 * - `day` = 1 / 2：这一天的名单顺序评分、只收当天到岗评委的票
 * - `day` = null：回到不分天（复赛/决赛，或还没分天的初赛）
 * - `split` = true：按当前出场顺序把名单平分成两天（前一半第一天）
 *
 * 排行不在这里算——整轮结束才出排名。
 */
export function setRoundDay(
  client: DatabaseClient,
  round: RoundRow,
  day: number | null,
  split = false
): void {
  if (round.status === 'closed') {
    conflictError('ROUND_CLOSED', '本轮已结束，赛程天已锁定')
  }
  if (day !== null && day !== 1 && day !== 2) {
    validationError('赛程天只能是第一天或第二天', 'day')
  }
  const entries = listRoundEntryRows(client, round.id)

  client.db.transaction((transaction) => {
    if (split) {
      const half = Math.ceil(entries.length / 2)
      entries.forEach((entry, index) => {
        transaction.update(competitionRoundEntries)
          .set({ contestDay: index < half ? 1 : 2 })
          .where(eq(competitionRoundEntries.id, entry.id))
          .run()
      })
    }
    // 换天等于换名单，原来指着的「当前选手」不再成立。
    transaction.update(competitionRounds).set({
      activeDay: day,
      currentEntryId: null,
      updatedAt: Date.now()
    }).where(eq(competitionRounds.id, round.id)).run()
  })
}

/** 单条出场名单改到某一天（null = 不分配）。 */
/**
 * 现场签到：勾上这个人，评委与顺序评分立刻能看到；取消签到把他移出队列，
 * 如果正好是当前这位，指针一并清空。
 */
export function setEntryCheckIn(
  client: DatabaseClient,
  round: RoundRow,
  entryId: string,
  checkedIn: boolean
): void {
  if (round.status === 'closed') {
    conflictError('ROUND_CLOSED', '本轮已结束，不能再改签到')
  }
  const row = client.db.select().from(competitionRoundEntries)
    .where(and(eq(competitionRoundEntries.roundId, round.id), eq(competitionRoundEntries.id, entryId)))
    .get()
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Entry not found', data: { code: 'NOT_FOUND' } })
  }
  client.db.update(competitionRoundEntries)
    .set({
      checkedInAt: checkedIn ? Date.now() : null,
      contestDay: checkedIn && row.contestDay == null ? round.activeDay ?? null : row.contestDay
    })
    .where(eq(competitionRoundEntries.id, entryId))
    .run()
  if (!checkedIn && round.currentEntryId === entryId) {
    setCurrentEntryId(client, round.id, null)
  }
}

export function setEntryDay(
  client: DatabaseClient,
  round: RoundRow,
  entryId: string,
  day: number | null
): void {
  if (round.status === 'closed') {
    conflictError('ROUND_CLOSED', '本轮已结束，名单天数已锁定')
  }
  if (day !== null && day !== 1 && day !== 2) {
    validationError('只能分配到第一天、第二天或不分天', 'day')
  }
  const entry = listRoundEntryRows(client, round.id).find(item => item.id === entryId)
  if (!entry) validationError('出场条目不存在', 'entryId')

  client.db.update(competitionRoundEntries).set({ contestDay: day })
    .where(eq(competitionRoundEntries.id, entryId)).run()
  if (round.currentEntryId === entryId && round.activeDay && day !== round.activeDay) {
    setCurrentEntryId(client, round.id, null)
  }
}

// -- 评委账号 ------------------------------------------------------------------

function generateJudgePassword(): string {
  const bytes = randomBytes(10)
  let password = ''
  for (const byte of bytes) password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]!
  return password
}

function nextJudgeIdentity(
  client: DatabaseClient,
  round: RoundRow
): { username: string, displayName: string } {
  const existingUsernames = new Set(
    client.db.select({ username: competitionJudges.username }).from(competitionJudges).all()
      .map(row => row.username)
  )
  const existingDisplayNames = new Set(
    listRoundJudges(client, round.id).map(row => row.displayName)
  )

  for (let index = 1; index <= 9999; index += 1) {
    const username = `judge${index}`
    if (existingUsernames.has(username)) continue
    existingUsernames.add(username)

    // 展示名按本轮顺序从 1 开始，不受其他轮次账号占用用户名的影响。
    let displayIndex = 1
    while (existingDisplayNames.has(`${round.title}评委${displayIndex}`)) displayIndex += 1
    const displayName = `${round.title}评委${displayIndex}`
    existingDisplayNames.add(displayName)
    return { username, displayName }
  }

  throw createError({
    statusCode: 409,
    statusMessage: 'Unable to allocate judge username',
    data: { code: 'JUDGE_USERNAME_EXHAUSTED' }
  })
}

/** 评委密码门槛：现场发号，够用就行。 */
const JUDGE_PASSWORD_MIN_LENGTH = 6
const JUDGE_USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/

function normalizeJudgeUsername(raw: unknown): string {
  const username = String(raw ?? '').trim()
  if (!JUDGE_USERNAME_PATTERN.test(username)) {
    validationError('登录账号用 3-32 位字母、数字、下划线或短横线', 'username')
  }
  return username
}

function assertJudgeUsernameFree(client: DatabaseClient, username: string, exceptJudgeId?: string): void {
  const taken = client.db.select({ id: competitionJudges.id, username: competitionJudges.username })
    .from(competitionJudges).all()
    .some(row => row.username.toLowerCase() === username.toLowerCase() && row.id !== exceptJudgeId)
  if (taken) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Judge username taken',
      data: { code: 'JUDGE_USERNAME_TAKEN', message: `账号 ${username} 已被占用，换一个` }
    })
  }
}

/** 自定义账号密码建一个评委；账号/密码/显示名留空则自动生成。 */
export async function createJudgeAccount(
  client: DatabaseClient,
  round: RoundRow,
  input: { username?: unknown, password?: unknown, displayName?: unknown } = {}
): Promise<CompetitionJudgeCredentials> {
  const auto = nextJudgeIdentity(client, round)
  const username = String(input.username ?? '').trim()
    ? normalizeJudgeUsername(input.username)
    : auto.username
  assertJudgeUsernameFree(client, username)

  const rawPassword = String(input.password ?? '')
  if (rawPassword && rawPassword.length < JUDGE_PASSWORD_MIN_LENGTH) {
    validationError(`密码至少 ${JUDGE_PASSWORD_MIN_LENGTH} 位`, 'password')
  }
  const password = rawPassword || generateJudgePassword()

  const rawDisplayName = String(input.displayName ?? '').replace(/\s+/g, ' ').trim()
  const displayName = rawDisplayName || auto.displayName
  const passwordHash = await hashPasswordWithMinLength(password, JUDGE_PASSWORD_MIN_LENGTH)
  const id = randomUUID()
  const now = Date.now()
  client.db.insert(competitionJudges).values({
    id,
    eventId: round.eventId,
    roundId: round.id,
    username,
    passwordHash,
    displayName,
    isActive: true,
    createdAt: now,
    updatedAt: now
  }).run()
  return { id, username, displayName, password }
}

export async function createJudgeAccounts(
  client: DatabaseClient,
  round: RoundRow,
  count: number
): Promise<CompetitionJudgeCredentials[]> {
  if (!Number.isInteger(count) || count < 1 || count > COMPETITION_MAX_JUDGES) {
    validationError(`每次生成 1-${COMPETITION_MAX_JUDGES} 个评委账号`, 'count')
  }

  const created: CompetitionJudgeCredentials[] = []
  for (let index = 0; index < count; index += 1) {
    const identity = nextJudgeIdentity(client, round)
    const password = generateJudgePassword()
    const passwordHash = await hashPasswordWithMinLength(password, JUDGE_PASSWORD_MIN_LENGTH)
    const id = randomUUID()
    const now = Date.now()
    client.db.insert(competitionJudges).values({
      id,
      eventId: round.eventId,
      roundId: round.id,
      username: identity.username,
      passwordHash,
      displayName: identity.displayName,
      isActive: true,
      createdAt: now,
      updatedAt: now
    }).run()
    created.push({
      id,
      username: identity.username,
      displayName: identity.displayName,
      password
    })
  }
  return created
}

function requireJudgeRow(client: DatabaseClient, roundId: string, judgeId: string): JudgeRow {
  const row = client.db.select().from(competitionJudges)
    .where(and(eq(competitionJudges.roundId, roundId), eq(competitionJudges.id, judgeId)))
    .get()
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Judge not found',
      data: { code: 'NOT_FOUND' }
    })
  }
  return row
}

export async function updateJudge(
  client: DatabaseClient,
  roundId: string,
  judgeId: string,
  input: { displayName?: unknown, isActive?: unknown, day?: unknown, username?: unknown, password?: unknown }
): Promise<CompetitionJudge> {
  requireJudgeRow(client, roundId, judgeId)
  const patch: Partial<typeof competitionJudges.$inferInsert> = { updatedAt: Date.now() }

  if (input.username !== undefined) {
    const username = normalizeJudgeUsername(input.username)
    assertJudgeUsernameFree(client, username, judgeId)
    patch.username = username
  }
  if (input.password !== undefined) {
    const password = String(input.password ?? '')
    if (password.length < JUDGE_PASSWORD_MIN_LENGTH) {
      validationError(`密码至少 ${JUDGE_PASSWORD_MIN_LENGTH} 位`, 'password')
    }
    patch.passwordHash = await hashPasswordWithMinLength(password, JUDGE_PASSWORD_MIN_LENGTH)
  }

  if (input.displayName !== undefined) {
    const displayName = String(input.displayName ?? '').replace(/\s+/g, ' ').trim()
    if (!displayName || displayName.length > 20) validationError('评委名称必填且不超过 20 字', 'displayName')
    patch.displayName = displayName
  }
  if (input.isActive !== undefined) {
    patch.isActive = input.isActive === true
  }
  if (input.day !== undefined) {
    if (input.day === null) patch.day = null
    else if (input.day === 1 || input.day === 2) patch.day = input.day
    else validationError('到岗天只能是第一天、第二天或两天都在', 'day')
  }

  client.db.update(competitionJudges).set(patch).where(eq(competitionJudges.id, judgeId)).run()
  const updated = requireJudgeRow(client, roundId, judgeId)
  const scoreCount = client.db.select({ id: competitionScores.id }).from(competitionScores)
    .where(eq(competitionScores.judgeId, judgeId)).all().length
  return serializeJudge(updated, scoreCount)
}

export async function resetJudgePassword(
  client: DatabaseClient,
  roundId: string,
  judgeId: string
): Promise<string> {
  requireJudgeRow(client, roundId, judgeId)
  const password = generateJudgePassword()
  const passwordHash = await hashPasswordWithMinLength(password, JUDGE_PASSWORD_MIN_LENGTH)
  client.db.update(competitionJudges).set({
    passwordHash,
    updatedAt: Date.now()
  }).where(eq(competitionJudges.id, judgeId)).run()
  return password
}

export function deleteJudge(client: DatabaseClient, roundId: string, judgeId: string): void {
  requireJudgeRow(client, roundId, judgeId)
  client.db.delete(competitionJudges).where(eq(competitionJudges.id, judgeId)).run()
}

// -- 歌手名单 ------------------------------------------------------------------

export interface SingerInput {
  name?: unknown
  song?: unknown
  className?: unknown
  remark?: unknown
  studentNo?: unknown
  phone?: unknown
  email?: unknown
  sortOrder?: unknown
}

function normalizeSingerInput(input: SingerInput): {
  name: string
  song: string
  className: string | null
  remark: string | null
  studentNo: string | null
  phone: string | null
  email: string | null
  sortOrder: number | null
} {
  const name = String(input.name ?? '').replace(/\s+/g, ' ').trim()
  if (!name || name.length > 40) validationError('选手姓名必填且不超过 40 字', 'name')
  // 歌曲允许留空（可待定），评委端与排行展示为「待定」。
  const song = String(input.song ?? '').replace(/\s+/g, ' ').trim()
  if (song.length > 80) validationError('参赛歌曲不超过 80 字', 'song')

  const classNameRaw = String(input.className ?? '').replace(/\s+/g, ' ').trim()
  if (classNameRaw.length > 60) validationError('班级不超过 60 字', 'className')
  const remarkRaw = String(input.remark ?? '').trim()
  if (remarkRaw.length > MAX_COMMENT_LENGTH) validationError(`备注不超过 ${MAX_COMMENT_LENGTH} 字`, 'remark')
  const studentNoRaw = String(input.studentNo ?? '').trim()
  if (studentNoRaw.length > 20) validationError('学号不超过 20 字', 'studentNo')
  const phoneRaw = String(input.phone ?? '').trim()
  if (phoneRaw.length > 20) validationError('电话不超过 20 字', 'phone')
  const emailRaw = String(input.email ?? '').trim()
  if (emailRaw.length > 120) validationError('邮箱不超过 120 字', 'email')

  let sortOrder: number | null = null
  if (input.sortOrder !== undefined && input.sortOrder !== null && String(input.sortOrder).trim() !== '') {
    const value = Number(input.sortOrder)
    if (!Number.isInteger(value) || value < 0 || value > 9999) {
      validationError('出场序号需为 0-9999 的整数', 'sortOrder')
    }
    sortOrder = value
  }

  return {
    name,
    song,
    className: classNameRaw || null,
    remark: remarkRaw || null,
    studentNo: studentNoRaw || null,
    phone: phoneRaw || null,
    email: emailRaw || null,
    sortOrder
  }
}

function nextSingerOrder(client: DatabaseClient, eventId: string): number {
  const rows = client.db.select({ sortOrder: competitionSingers.sortOrder })
    .from(competitionSingers).where(eq(competitionSingers.eventId, eventId)).all()
  return rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1
}

/**
 * 现场登记直接进初赛名单：当天切到第几天（rounds.active_day）就归到哪一天，
 * 预报名填的「打算哪天来」只作参考，实际以现场签到为准。
 */
function addPrelimEntry(
  client: DatabaseClient,
  eventId: string,
  singerId: string,
  sortOrder: number,
  contestDay?: 1 | 2 | null,
  checkedInAt?: number | null
): void {
  const prelim = getRoundByKey(client, eventId, 'prelim')
  client.db.insert(competitionRoundEntries).values({
    id: randomUUID(),
    roundId: prelim.id,
    singerId,
    sortOrder,
    contestDay: contestDay ?? prelim.activeDay ?? null,
    checkedInAt: checkedInAt ?? null,
    createdAt: Date.now()
  }).run()
}

export function createSinger(client: DatabaseClient, eventId: string, input: SingerInput): CompetitionSinger {
  const normalized = normalizeSingerInput(input)
  const id = randomUUID()
  const now = Date.now()
  const sortOrder = normalized.sortOrder ?? nextSingerOrder(client, eventId)
  client.db.transaction((transaction) => {
    transaction.insert(competitionSingers).values({
      id,
      eventId,
      name: normalized.name,
      song: normalized.song,
      className: normalized.className,
      remark: normalized.remark,
      studentNo: normalized.studentNo,
      phone: normalized.phone,
      email: normalized.email,
      source: 'admin',
      sortOrder,
      createdAt: now,
      updatedAt: now
    }).run()
  })
  addPrelimEntry(client, eventId, id, sortOrder)

  const row = client.db.select().from(competitionSingers)
    .where(eq(competitionSingers.id, id)).get()!
  return serializeSinger(row)
}

function requireSingerRow(client: DatabaseClient, eventId: string, singerId: string): SingerRow {
  const row = client.db.select().from(competitionSingers)
    .where(and(eq(competitionSingers.eventId, eventId), eq(competitionSingers.id, singerId)))
    .get()
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Singer not found',
      data: { code: 'NOT_FOUND' }
    })
  }
  return row
}

export function updateSinger(
  client: DatabaseClient,
  eventId: string,
  singerId: string,
  input: SingerInput
): CompetitionSinger {
  const current = requireSingerRow(client, eventId, singerId)
  const normalized = normalizeSingerInput({
    name: input.name ?? current.name,
    song: input.song ?? current.song,
    className: input.className ?? current.className,
    remark: input.remark ?? current.remark,
    sortOrder: input.sortOrder ?? current.sortOrder
  })
  const sortOrder = normalized.sortOrder ?? current.sortOrder

  client.db.transaction((transaction) => {
    transaction.update(competitionSingers).set({
      name: normalized.name,
      song: normalized.song,
      className: normalized.className,
      remark: normalized.remark,
      studentNo: normalized.studentNo,
      phone: normalized.phone,
      email: normalized.email,
      sortOrder,
      updatedAt: Date.now()
    }).where(eq(competitionSingers.id, singerId)).run()
  })

  return serializeSinger(requireSingerRow(client, eventId, singerId))
}

export function deleteSinger(client: DatabaseClient, eventId: string, singerId: string): void {
  requireSingerRow(client, eventId, singerId)
  client.db.delete(competitionSingers).where(eq(competitionSingers.id, singerId)).run()
}

export interface ImportedSinger {
  name: string
  song: string
  className: string | null
}

const NAME_HEADERS = ['姓名', '选手姓名', '参赛选手', '选手', '名字']
const SONG_HEADERS = ['参赛歌曲', '演唱歌曲', '参赛曲目', '歌曲名称', '歌曲', '曲目', '歌名']
const CLASS_HEADERS = ['专业班级', '学院班级', '年级班级', '班级']

function normalizeHeaderCell(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').replace(/[()（）:：]/g, '').trim()
}

function findColumn(headerRow: unknown[], aliases: string[]): number {
  const normalized = headerRow.map(normalizeHeaderCell)
  for (const alias of aliases) {
    const exact = normalized.indexOf(alias)
    if (exact >= 0) return exact
  }
  for (const alias of aliases) {
    const partial = normalized.findIndex(cell => cell.includes(alias))
    if (partial >= 0) return partial
  }
  return -1
}

/**
 * 解析导入文件。支持表头别名与常见顺序，逐行校验；
 * 空行跳过，只填了半行会报行号，避免安静丢数据。
 */
export function parseSingerWorkbook(bytes: Uint8Array): ImportedSinger[] {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer' })
  } catch {
    validationError('无法读取文件，请上传 .xlsx / .xls / .csv 格式的名单', 'file')
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) validationError('文件中没有可读取的工作表', 'file')

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: ''
  })
  if (rows.length === 0) validationError('名单为空', 'file')

  let headerIndex = -1
  let nameColumn = -1
  let songColumn = -1
  let classColumn = -1
  const headerScanLimit = Math.min(rows.length, 10)
  for (let index = 0; index < headerScanLimit; index += 1) {
    const row = rows[index] ?? []
    const nameCandidate = findColumn(row, NAME_HEADERS)
    const songCandidate = findColumn(row, SONG_HEADERS)
    if (nameCandidate >= 0 && songCandidate >= 0) {
      headerIndex = index
      nameColumn = nameCandidate
      songColumn = songCandidate
      classColumn = findColumn(row, CLASS_HEADERS)
      break
    }
  }

  if (headerIndex < 0) {
    validationError('未识别到表头：请确保第一行包含「姓名」和「歌曲」两列', 'file')
  }

  const singers: ImportedSinger[] = []
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    const name = String(row[nameColumn] ?? '').replace(/\s+/g, ' ').trim()
    const song = String(row[songColumn] ?? '').replace(/\s+/g, ' ').trim()
    if (!name && !song) continue
    if (!name || !song) {
      validationError(`第 ${index + 1} 行缺少${name ? '歌曲' : '姓名'}`, 'file')
    }
    if (name.length > 40) validationError(`第 ${index + 1} 行姓名超过 40 字`, 'file')
    if (song.length > 80) validationError(`第 ${index + 1} 行歌曲超过 80 字`, 'file')

    const className = classColumn >= 0
      ? String(row[classColumn] ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || null
      : null
    singers.push({ name, song, className })
    if (singers.length > COMPETITION_MAX_SINGERS) {
      validationError(`单次最多导入 ${COMPETITION_MAX_SINGERS} 位选手`, 'file')
    }
  }

  if (singers.length === 0) validationError('名单中没有有效数据行', 'file')
  return singers
}

export function importSingers(
  client: DatabaseClient,
  eventId: string,
  items: ImportedSinger[]
): { imported: number, skipped: number } {
  const existing = new Set(
    listSingers(client, eventId).map(singer => `${singer.name}\u0000${singer.song}`)
  )
  const prelim = getRoundByKey(client, eventId, 'prelim')
  let sortOrder = nextSingerOrder(client, eventId) - 1
  let imported = 0
  let skipped = 0
  const now = Date.now()

  for (const item of items) {
    const dedupeKey = `${item.name}\u0000${item.song}`
    if (existing.has(dedupeKey)) {
      skipped += 1
      continue
    }
    existing.add(dedupeKey)
    sortOrder += 1
    const singerId = randomUUID()
    client.db.transaction((transaction) => {
      transaction.insert(competitionSingers).values({
        id: singerId,
        eventId,
        name: item.name,
        song: item.song,
        className: item.className,
        sortOrder,
        createdAt: now,
        updatedAt: now
      }).run()
      transaction.insert(competitionRoundEntries).values({
        id: randomUUID(),
        roundId: prelim.id,
        singerId,
        sortOrder,
        createdAt: now
      }).run()
    })
    imported += 1
  }
  return { imported, skipped }
}

// -- 评委评分 ------------------------------------------------------------------

export interface JudgeSessionIdentity {
  id: string
  username: string
  displayName: string
  eventId: string
  roundId: string
}

export function getRound(client: DatabaseClient, roundId: string): RoundRow | null {
  return client.db.select().from(competitionRounds)
    .where(eq(competitionRounds.id, roundId))
    .get() ?? null
}

function getEvent(client: DatabaseClient, eventId: string): EventRow | null {
  return client.db.select().from(competitionEvents)
    .where(eq(competitionEvents.id, eventId))
    .get() ?? null
}

export function getJudgePayload(client: DatabaseClient, judge: JudgeSessionIdentity): CompetitionJudgePayload {
  const eventRow = getEvent(client, judge.eventId)
  const round = getRound(client, judge.roundId)
  if (!eventRow || !round) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Competition not found',
      data: { code: 'NOT_FOUND' }
    })
  }

  const dimensions = getCompetitionDimensions(eventRow)
  const singersById = new Map(listSingers(client, eventRow.id).map(singer => [singer.id, singer]))
  const entryRows = listRoundEntryRows(client, round.id)
  const scoreRows = listRoundScores(client, round.id)
  const ownScores = new Map(
    scoreRows
      .filter(score => score.judgeId === judge.id)
      .map(score => [score.singerId, serializeScore(score, judge.displayName)])
  )

  const dayEntries = presentEntriesForDay(round, entryRows)
  const singers = dayEntries
    .map((entry) => {
      const singer = singersById.get(entry.singerId)
      if (!singer) return null
      return {
        ...serializeSingerPublic(singer),
        sortOrder: entry.sortOrder,
        advancedFromRank: entry.advancedFromRank,
        score: ownScores.get(singer.id) ?? null
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  const daySingerIds = new Set(dayEntries.map(entry => entry.singerId))
  const dayScored = [...ownScores.keys()].filter(singerId => daySingerIds.has(singerId)).length

  const roundResults = round.status === 'closed'
    ? buildRoundRanking(round, entryRows, singersById, scoreRows)
    : null

  const finalRound = getRoundByKeySafe(client, eventRow.id, 'final')
  const finalResults = finalRound?.status === 'closed'
    ? buildRoundRanking(
        finalRound,
        listRoundEntryRows(client, finalRound.id),
        singersById,
        listRoundScores(client, finalRound.id)
      )
    : null

  return {
    event: {
      id: eventRow.id,
      title: eventRow.title,
      dimensions,
      maxTotal: competitionMaxTotal(dimensions)
    },
    judge: {
      id: judge.id,
      username: judge.username,
      displayName: judge.displayName,
      roundId: judge.roundId
    },
    round: {
      id: round.id,
      key: round.key,
      title: round.title,
      status: round.status,
      advanceCount: round.advanceCount
    },
    singers,
    roundResults,
    current: buildCurrentSinger(client, round, presentEntriesForDay(round, entryRows), singersById, scoreRows),
    finalResults,
    finalRound: finalRound ? { title: finalRound.title, status: finalRound.status } : null,
    progress: {
      scored: dayScored,
      total: singers.length
    }
  }
}

function getRoundByKeySafe(client: DatabaseClient, eventId: string, key: CompetitionRoundKey): RoundRow | null {
  return client.db.select().from(competitionRounds)
    .where(and(eq(competitionRounds.eventId, eventId), eq(competitionRounds.key, key)))
    .get() ?? null
}

export function submitJudgeScore(
  client: DatabaseClient,
  judge: JudgeSessionIdentity,
  singerId: string,
  input: { scores?: unknown, comment?: unknown }
): CompetitionScore {
  const eventRow = getEvent(client, judge.eventId)
  const round = getRound(client, judge.roundId)
  if (!eventRow || !round) {
    throw createError({ statusCode: 404, statusMessage: 'Competition not found', data: { code: 'NOT_FOUND' } })
  }
  if (round.status !== 'open') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Scoring is closed',
      data: { code: 'COMPETITION_SCORING_CLOSED', message: '本轮评分未开放或已结束，无法提交成绩' }
    })
  }

  requireSingerRow(client, eventRow.id, singerId)
  const entry = client.db.select({
    id: competitionRoundEntries.id,
    checkedInAt: competitionRoundEntries.checkedInAt
  }).from(competitionRoundEntries)
    .where(and(
      eq(competitionRoundEntries.roundId, round.id),
      eq(competitionRoundEntries.singerId, singerId)
    ))
    .get()
  if (!entry) {
    validationError('该选手不在本轮名单中', 'singerId')
  }
  if (entry.checkedInAt == null) {
    conflictError('COMPETITION_NOT_CHECKED_IN', '这位选手还没签到，先让现场签到再打分')
  }

  // 顺序评分：只接受「当前这位」的分数。六位评委看到的是同一个选手，
  // 谁想跳到下一位都会被这里挡住，避免有人先给后面的人打分。
  if (round.currentEntryId && entry.id !== round.currentEntryId) {
    const current = getCurrentSinger(client, round)
    conflictError(
      'COMPETITION_NOT_CURRENT_SINGER',
      current
        ? `现在评的是 ${current.index}/${current.total}「${current.singer.name}」，请等主持人切到下一位`
        : '现在不在顺序评分中，请刷新页面'
    )
  }

  // 分天时只认当天到岗的评委：第二天的人不能给第一天的选手凑票。
  if (round.activeDay) {
    const dutyRow = client.db.select({ day: competitionJudges.day }).from(competitionJudges)
      .where(eq(competitionJudges.id, judge.id))
      .get()
    if (dutyRow?.day && dutyRow.day !== round.activeDay) {
      conflictError(
        'COMPETITION_JUDGE_OFF_DAY',
        `今天是第 ${round.activeDay} 天，你的评分班次是第 ${dutyRow.day} 天`
      )
    }
  }

  const dimensions = getCompetitionDimensions(eventRow)
  const rawScores = input.scores
  if (!rawScores || typeof rawScores !== 'object' || Array.isArray(rawScores)) {
    validationError('评分数据格式不正确', 'scores')
  }

  const scoreMap = rawScores as Record<string, unknown>
  const snapshot: CompetitionScoreDimension[] = dimensions.map((dimension) => {
    const value = Number(scoreMap[dimension.key])
    if (!Number.isFinite(value) || value < 0 || value > MAX_SCORE) {
      validationError(`「${dimension.label}」需为 0-${MAX_SCORE} 的分数`, `scores.${dimension.key}`)
    }
    return {
      key: dimension.key,
      label: dimension.label,
      weight: dimension.weight,
      score: Math.round(value * 10) / 10
    }
  })

  const comment = String(input.comment ?? '').trim()
  if (comment.length > MAX_COMMENT_LENGTH) {
    validationError(`备注不超过 ${MAX_COMMENT_LENGTH} 字`, 'comment')
  }

  const total = calculateCompetitionTotal(
    dimensions,
    Object.fromEntries(snapshot.map(item => [item.key, item.score]))
  )
  const now = Date.now()
  const existing = client.db.select().from(competitionScores)
    .where(and(
      eq(competitionScores.roundId, round.id),
      eq(competitionScores.singerId, singerId),
      eq(competitionScores.judgeId, judge.id)
    ))
    .get()

  if (existing) {
    client.db.update(competitionScores).set({
      dimensionsJson: JSON.stringify(snapshot),
      totalScore: total,
      comment,
      updatedAt: now
    }).where(eq(competitionScores.id, existing.id)).run()
  } else {
    client.db.insert(competitionScores).values({
      id: randomUUID(),
      eventId: eventRow.id,
      roundId: round.id,
      singerId,
      judgeId: judge.id,
      dimensionsJson: JSON.stringify(snapshot),
      totalScore: total,
      comment,
      createdAt: now,
      updatedAt: now
    }).run()
  }

  const row = client.db.select().from(competitionScores)
    .where(and(
      eq(competitionScores.roundId, round.id),
      eq(competitionScores.singerId, singerId),
      eq(competitionScores.judgeId, judge.id)
    ))
    .get()!

  // 顺序评分：这一位凑齐本场到岗人数（judgeCount，不超过启用中的账号数），
  // 才自动切下一位。初赛两天共用 prelim 轮、账号有 9 个但当天只有 6 人。
  // 只在「这次提交把人数补齐」时推进——管理员回上一位改分后，再提交不会被
  // 立刻推回去，要等管理员点「下一位」。
  if (!existing && round.currentEntryId === entry.id) {
    const required = requiredJudgeCount(client, round)
    // 只数当天到岗评委的票，第二天/没排班的人不算。
    const dutyJudgeIds = new Set(judgesForDay(client, round).map(item => item.id))
    const beforeCount = new Set(
      client.db.select({ judgeId: competitionScores.judgeId }).from(competitionScores)
        .where(and(
          eq(competitionScores.roundId, round.id),
          eq(competitionScores.singerId, singerId)
        ))
        .all()
        .map(item => item.judgeId)
        .filter(id => dutyJudgeIds.has(id))
    ).size
    if (required > 0 && beforeCount >= required) {
      const entries = presentEntriesForDay(round, listRoundEntryRows(client, round.id))
      const index = entries.findIndex(item => item.id === entry.id)
      const nextEntry = index >= 0 ? entries[index + 1] ?? null : null
      setCurrentEntryId(client, round.id, nextEntry ? nextEntry.id : null)
    }
  }

  return serializeScore(row, judge.displayName)
}

// -- 现场扫码登记 ---------------------------------------------------------------

export interface CompetitionRegistrationInput {
  className: string
  name: string
  studentNo: string
  phone: string
  email: string
  song?: string
  /** 命中预报名确认生成时传入；服务端校验归属与未使用。 */
  preRegistrationId?: string
}

export function getRegistrationState(client: DatabaseClient, contentId: string): CompetitionRegistrationStatus {
  const eventRow = ensureCompetitionEvent(client, contentId)
  return {
    open: eventRow.registrationOpen !== false,
    title: eventRow.title,
    edition: eventRow.edition ?? '',
    schedule: getCompetitionSchedule(eventRow),
    formFields: getCompetitionFormFields(eventRow)
  }
}

function countSingers(client: DatabaseClient, eventId: string): number {
  return client.db.select({ id: competitionSingers.id }).from(competitionSingers)
    .where(eq(competitionSingers.eventId, eventId)).all().length
}

/** 现场扫码登记：按学号去重，登记顺序即初赛出场顺序。 */
export function registerSingerFromForm(
  client: DatabaseClient,
  contentId: string,
  input: CompetitionRegistrationInput
): { id: string, sortOrder: number } {
  const eventRow = ensureCompetitionEvent(client, contentId)
  if (eventRow.registrationOpen === false) {
    conflictError('COMPETITION_REGISTRATION_CLOSED', '登记已结束，如需报名请联系现场工作人员')
  }

  const normalized = normalizeSingerInput({
    className: input.className,
    name: input.name,
    studentNo: input.studentNo,
    phone: input.phone,
    email: input.email,
    song: input.song ?? ''
  })
  if (!normalized.studentNo) validationError('学号必填', 'studentNo')
  if (!normalized.phone) validationError('电话必填', 'phone')
  if (!normalized.email) validationError('邮箱必填', 'email')
  // 现场登记必须报具体曲目：留空或写「待定」的都拦下，避免上台前才发现没歌。
  if (!normalized.song) validationError('参赛歌曲必填，请填写具体歌名', 'song')
  if (COMPETITION_SONG_PLACEHOLDERS.has(normalized.song.replace(/\s+/g, '').toLowerCase())) {
    validationError('参赛歌曲要填具体歌名，不能填「待定」', 'song')
  }

  const existing = client.db.select({ id: competitionSingers.id }).from(competitionSingers)
    .where(and(
      eq(competitionSingers.eventId, eventRow.id),
      eq(competitionSingers.studentNo, normalized.studentNo)
    ))
    .get()
  if (existing) {
    conflictError('SINGER_ALREADY_REGISTERED', '该学号已完成登记，请勿重复提交；信息有误请联系现场工作人员修改')
  }
  if (countSingers(client, eventRow.id) >= COMPETITION_MAX_SINGERS) {
    conflictError('COMPETITION_SINGERS_FULL', '报名人数已满，请联系现场工作人员')
  }

  // 预报名确认：记录必须属于本场且尚未被使用；来源标记为 pre。
  let preRegistration: PreRegistrationRow | null = null
  if (input.preRegistrationId) {
    preRegistration = client.db.select().from(competitionPreRegistrations)
      .where(and(
        eq(competitionPreRegistrations.id, input.preRegistrationId),
        eq(competitionPreRegistrations.eventId, eventRow.id)
      ))
      .get() ?? null
    if (!preRegistration) validationError('预报名记录不存在', 'preRegistrationId')
    if (preRegistration.registeredAt) {
      conflictError('PRE_REGISTRATION_ALREADY_USED', '该预报名已被确认使用，请直接手动填写')
    }
  }

  const prelim = getRoundByKey(client, eventRow.id, 'prelim')
  const resolved = resolvePrelimDay(eventRow, prelim)
  if (resolved.day === null && resolved.source === 'date') {
    validationError('今天不是初赛日，现场不登记；请联系工作人员确认场次', 'day')
  }

  const id = randomUUID()
  const now = Date.now()
  const sortOrder = nextSingerOrder(client, eventRow.id)
  client.db.transaction((transaction) => {
    transaction.insert(competitionSingers).values({
      id,
      eventId: eventRow.id,
      name: normalized.name,
      song: normalized.song,
      className: normalized.className,
      remark: normalized.remark,
      studentNo: normalized.studentNo,
      phone: normalized.phone,
      email: normalized.email,
      source: preRegistration ? 'pre' : 'form',
      preRegistrationId: preRegistration?.id ?? null,
      sortOrder,
      createdAt: now,
      updatedAt: now
    }).run()
    if (preRegistration) {
      transaction.update(competitionPreRegistrations).set({ registeredAt: now })
        .where(eq(competitionPreRegistrations.id, preRegistration.id)).run()
    }
  })
  addPrelimEntry(client, eventRow.id, id, sortOrder, resolved.day, now)
  return { id, sortOrder }
}

// -- 结果邮件通知 ---------------------------------------------------------------

export const COMPETITION_EMAIL_TEMPLATE_DEFAULTS: Record<CompetitionRoundKey, { subject: string, body: string }> = {
  prelim: {
    subject: '【音乐协会】新声歌手大赛初赛结果通知',
    body: [
      '{{姓名}} 同学：',
      '',
      '感谢你参加仰恩大学音乐协会2026新声歌手大赛！',
      '',
      '你的初赛成绩：{{平均分}} 分（第{{名次}}名，{{结果}}）。',
      '',
      '后续安排请留意初赛群通知，期待在舞台上再次见到你！',
      '',
      '仰恩大学音乐协会'
    ].join('\n')
  },
  semi: {
    subject: '【音乐协会】新声歌手大赛复赛结果通知',
    body: [
      '{{姓名}} 同学：',
      '',
      '你在仰恩大学音乐协会2026新声歌手大赛复赛中的成绩：{{平均分}} 分（第{{名次}}名，{{结果}}）。',
      '',
      '后续安排请留意复赛群通知。感谢你的精彩演唱！',
      '',
      '仰恩大学音乐协会'
    ].join('\n')
  },
  final: {
    subject: '【音乐协会】新声歌手大赛决赛结果通知',
    body: [
      '{{姓名}} 同学：',
      '',
      '你在仰恩大学音乐协会2026新声歌手大赛决赛中的成绩：{{平均分}} 分（第{{名次}}名）。',
      '',
      '感谢你一路唱到决赛，期待来年再会！',
      '',
      '仰恩大学音乐协会'
    ].join('\n')
  }
}

function getEmailTemplateRow(client: DatabaseClient, eventId: string, roundKey: CompetitionRoundKey) {
  return client.db.select().from(competitionEmailTemplates)
    .where(and(
      eq(competitionEmailTemplates.eventId, eventId),
      eq(competitionEmailTemplates.roundKey, roundKey)
    ))
    .get() ?? null
}

export function getEmailTemplate(client: DatabaseClient, eventId: string, roundKey: CompetitionRoundKey): CompetitionEmailTemplate {
  const row = getEmailTemplateRow(client, eventId, roundKey)
  if (row) return { roundKey, subject: row.subject, body: row.body }
  return { roundKey, ...COMPETITION_EMAIL_TEMPLATE_DEFAULTS[roundKey] }
}

export function updateEmailTemplate(
  client: DatabaseClient,
  eventId: string,
  roundKey: CompetitionRoundKey,
  input: { subject: string, body: string }
): CompetitionEmailTemplate {
  const now = Date.now()
  const existing = getEmailTemplateRow(client, eventId, roundKey)
  if (existing) {
    client.db.update(competitionEmailTemplates).set({
      subject: input.subject,
      body: input.body,
      updatedAt: now
    }).where(eq(competitionEmailTemplates.id, existing.id)).run()
  } else {
    client.db.insert(competitionEmailTemplates).values({
      id: randomUUID(),
      eventId,
      roundKey,
      subject: input.subject,
      body: input.body,
      updatedAt: now
    }).run()
  }
  return getEmailTemplate(client, eventId, roundKey)
}

export function recordEmailSend(
  client: DatabaseClient,
  eventId: string,
  roundKey: CompetitionRoundKey,
  singerId: string | null,
  email: string,
  status: CompetitionEmailSendStatus,
  error: string | null
): void {
  client.db.insert(competitionEmailSends).values({
    id: randomUUID(),
    eventId,
    roundKey,
    singerId,
    email,
    status,
    error,
    createdAt: Date.now()
  }).run()
}

/** 合并字段渲染：未识别的占位符原样保留，方便管理员发现拼写问题。 */
export function renderCompetitionEmailTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key: string) => {
    const value = variables[key]
    return value === undefined ? match : value
  })
}

/**
 * 正文转邮件 HTML。`[[图片:id]]` 换成 cid 内嵌图（发信时作为附件带上），
 * 其余文字照旧转义、换行转 <br>。
 */
export function competitionEmailBodyToHtml(
  body: string,
  images: CompetitionEmailImageBinary[] = []
): string {
  const byId = new Map(images.map(image => [image.id, image]))
  const escape = (text: string): string => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const parts: string[] = []
  let cursor = 0
  for (const match of body.matchAll(EMAIL_IMAGE_TOKEN_PATTERN)) {
    const index = match.index ?? 0
    parts.push(escape(body.slice(cursor, index)))
    const image = match[1] ? byId.get(match[1]) : null
    if (image) {
      parts.push(`<img src="cid:${emailImageCid(image.id)}" alt="${escape(image.filename)}" style="max-width:100%;height:auto;display:block;margin:8px 0;border-radius:6px;">`)
    } else {
      parts.push(escape(match[0]))
    }
    cursor = index + match[0].length
  }
  parts.push(escape(body.slice(cursor)))

  return `<p style="margin:0 0 4px;line-height:1.8;">${parts.join('').split('\n').join('<br>')}</p>`
}

export function buildEmailVariables(
  round: RoundRow,
  entry: CompetitionRoundEntry,
  singer: CompetitionSinger
): Record<string, string> {
  let result: string
  if (entry.forfeited) result = '弃权'
  else if (round.advanceCount !== null) result = entry.qualified ? '晋级' : '未能晋级'
  else result = '完赛'
  return {
    姓名: singer.name,
    班级: singer.className || '—',
    学号: singer.studentNo || '—',
    歌曲: singer.song || '待定',
    轮次: round.title,
    平均分: entry.average === null ? '—' : entry.average.toFixed(2),
    名次: entry.rank === null ? '未排名' : String(entry.rank),
    结果: result
  }
}

export function listEmailState(client: DatabaseClient, eventId: string): CompetitionEmailState {
  const roundKeys: CompetitionRoundKey[] = ['prelim', 'semi', 'final']
  const templates = Object.fromEntries(
    roundKeys.map(key => [key, getEmailTemplate(client, eventId, key)])
  ) as Record<CompetitionRoundKey, CompetitionEmailTemplate>
  const stats = Object.fromEntries(
    roundKeys.map(key => [key, { sent: 0, failed: 0, lastSentAt: null as number | null }])
  ) as Record<CompetitionRoundKey, CompetitionEmailRoundStats>

  const rows = client.db.select().from(competitionEmailSends)
    .where(eq(competitionEmailSends.eventId, eventId))
    .orderBy(desc(competitionEmailSends.createdAt))
    .all()

  const latest: CompetitionEmailSendRecord[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const roundKey = row.roundKey as CompetitionRoundKey
    const stat = stats[roundKey]
    if (row.status === 'sent') stat.sent += 1
    else stat.failed += 1
    const createdAt = Number(row.createdAt ?? 0)
    if (stat.lastSentAt === null || createdAt > stat.lastSentAt) stat.lastSentAt = createdAt
    if (row.singerId && latest.length < 500) {
      const key = `${row.roundKey}:${row.singerId}`
      if (!seen.has(key)) {
        seen.add(key)
        latest.push({
          roundKey,
          singerId: row.singerId,
          email: row.email,
          status: row.status as CompetitionEmailSendStatus,
          error: row.error,
          createdAt
        })
      }
    }
  }
  return { templates, stats, latest, images: listEmailImages(client, eventId) }
}

// -- 邮件图片 ------------------------------------------------------------------

/** 单张图片上限 4MB（base64 前），够放证书或活动海报。 */
export const EMAIL_IMAGE_MAX_BYTES = 4 * 1024 * 1024
export const EMAIL_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

/** 正文里插入图片的占位写法：[[图片:图片ID]]。 */
export const EMAIL_IMAGE_TOKEN_PATTERN = /\[\[图片:([0-9a-fA-F-]{36})\]\]/g

export interface CompetitionEmailImageBinary {
  id: string
  filename: string
  mime: string
  data: string
}

export function emailImageCid(id: string): string {
  return `email-image-${id}`
}

export function emailImageUrl(id: string): string {
  // 走 /media 而不是 /api：api 全局 no-store，邮件插图需要 CDN 长期缓存。
  return `/media/competition/${id}.png`
}

function serializeEmailImage(row: typeof competitionEmailImages.$inferSelect): CompetitionEmailImage {
  return {
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    byteSize: Number(row.byteSize),
    url: emailImageUrl(row.id),
    createdAt: Number(row.createdAt ?? 0)
  }
}

export function listEmailImages(client: DatabaseClient, eventId: string): CompetitionEmailImage[] {
  return client.db.select().from(competitionEmailImages)
    .where(eq(competitionEmailImages.eventId, eventId))
    .orderBy(desc(competitionEmailImages.createdAt))
    .all()
    .map(serializeEmailImage)
}

/** 校验上传：只收图片，按解码后的字节数卡上限。 */
export function normalizeEmailImageInput(input: { filename?: string, mime?: string, data?: string }): {
  filename: string
  mime: string
  data: string
  byteSize: number
} {
  const mime = String(input.mime || '').trim().toLowerCase()
  if (!(EMAIL_IMAGE_MIMES as readonly string[]).includes(mime)) {
    validationError('只支持 JPG / PNG / WebP / GIF 图片', 'mime')
  }
  const raw = String(input.data || '').trim()
  const base64 = raw.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '')
  if (!base64) validationError('图片内容为空', 'data')
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) validationError('图片内容不是合法的 base64', 'data')
  const byteSize = Buffer.from(base64, 'base64').byteLength
  if (byteSize === 0) validationError('图片内容为空', 'data')
  if (byteSize > EMAIL_IMAGE_MAX_BYTES) {
    validationError(`单张图片不能超过 ${Math.round(EMAIL_IMAGE_MAX_BYTES / 1024 / 1024)}MB`, 'data')
  }
  const filename = String(input.filename || '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .trim()
    .slice(0, 120) || `图片-${Date.now()}`
  return { filename, mime, data: base64, byteSize }
}

export function createEmailImage(
  client: DatabaseClient,
  eventId: string,
  input: { filename?: string, mime?: string, data?: string }
): CompetitionEmailImage {
  const normalized = normalizeEmailImageInput(input)
  const id = randomUUID()
  const row = {
    id,
    eventId,
    filename: normalized.filename,
    mime: normalized.mime,
    byteSize: normalized.byteSize,
    data: normalized.data,
    createdAt: Date.now()
  }
  client.db.insert(competitionEmailImages).values(row).run()
  return serializeEmailImage(row as typeof competitionEmailImages.$inferSelect)
}

export function deleteEmailImage(client: DatabaseClient, eventId: string, imageId: string): boolean {
  const existing = client.db.select({ id: competitionEmailImages.id }).from(competitionEmailImages)
    .where(and(eq(competitionEmailImages.eventId, eventId), eq(competitionEmailImages.id, imageId)))
    .get()
  if (!existing) return false
  client.db.delete(competitionEmailImages).where(eq(competitionEmailImages.id, imageId)).run()
  return true
}

/** 取出正文里引用到的图片（带 base64），发送时按需带上。 */
export function loadEmailImagesForBody(
  client: DatabaseClient,
  eventId: string,
  body: string
): CompetitionEmailImageBinary[] {
  const ids = new Set<string>()
  for (const match of body.matchAll(EMAIL_IMAGE_TOKEN_PATTERN)) {
    if (match[1]) ids.add(match[1])
  }
  if (ids.size === 0) return []
  const rows = client.db.select().from(competitionEmailImages)
    .where(eq(competitionEmailImages.eventId, eventId))
    .all()
  return rows
    .filter(row => ids.has(row.id))
    .map(row => ({ id: row.id, filename: row.filename, mime: row.mime, data: row.data }))
}

/** 正文引用的图片转成 nodemailer 附件（cid 内嵌）。 */
export function emailImageAttachments(
  body: string,
  images: CompetitionEmailImageBinary[]
): Array<{ filename: string, mime: string, data: string, cid: string }> {
  const byId = new Map(images.map(image => [image.id, image]))
  const attachments: Array<{ filename: string, mime: string, data: string, cid: string }> = []
  for (const match of body.matchAll(EMAIL_IMAGE_TOKEN_PATTERN)) {
    const id = match[1]
    if (!id) continue
    const image = byId.get(id)
    if (!image) continue
    if (attachments.some(item => item.cid === emailImageCid(id))) continue
    attachments.push({
      filename: image.filename,
      mime: image.mime,
      data: image.data,
      cid: emailImageCid(id)
    })
  }
  return attachments
}

export interface CompetitionEmailRecipient {
  singer: CompetitionSinger
  entry: CompetitionRoundEntry
}

/**
 * 组装一轮的收件人：轮次结束后才允许发送；
 * scope 过滤目标，显式 singerIds 视为重发（跳过已发送去重）。
 */
export function buildEmailSendPlan(
  client: DatabaseClient,
  eventId: string,
  round: RoundRow,
  scope: 'all' | 'qualified' | 'unqualified',
  singerIds?: string[]
): {
  template: CompetitionEmailTemplate
  recipients: CompetitionEmailRecipient[]
  skippedNoEmail: number
  skippedAlreadySent: number
} {
  if (round.status !== 'closed') {
    conflictError('ROUND_NOT_CLOSED', '请先结束本轮评分并确认成绩，再发送通知邮件')
  }
  if (scope !== 'all' && scope !== 'qualified' && scope !== 'unqualified') {
    validationError('发送范围无效', 'scope')
  }

  const template = getEmailTemplate(client, eventId, round.key)
  const singers = listSingers(client, eventId)
  const singersById = new Map(singers.map(singer => [singer.id, singer]))
  const ranking = buildRoundRanking(
    round,
    listRoundEntryRows(client, round.id),
    singersById,
    listRoundScores(client, round.id)
  )

  let pool = ranking
  if (singerIds && singerIds.length > 0) {
    const requested = new Set(singerIds)
    pool = ranking.filter(entry => requested.has(entry.singer.id))
  } else if (scope === 'qualified') {
    pool = ranking.filter(entry => entry.qualified)
  } else if (scope === 'unqualified') {
    pool = ranking.filter(entry => !entry.qualified && !entry.forfeited)
  }

  const sentOk = new Set(
    client.db.select({ singerId: competitionEmailSends.singerId }).from(competitionEmailSends)
      .where(and(
        eq(competitionEmailSends.eventId, eventId),
        eq(competitionEmailSends.roundKey, round.key),
        eq(competitionEmailSends.status, 'sent')
      ))
      .all()
      .map(row => row.singerId)
      .filter((id): id is string => id !== null)
  )

  const recipients: CompetitionEmailRecipient[] = []
  let skippedNoEmail = 0
  let skippedAlreadySent = 0
  for (const entry of pool) {
    const singer = singersById.get(entry.singer.id)
    if (!singer) continue
    if (!singer.email) {
      skippedNoEmail += 1
      continue
    }
    if (!singerIds && sentOk.has(singer.id)) {
      skippedAlreadySent += 1
      continue
    }
    recipients.push({ singer, entry })
  }
  return { template, recipients, skippedNoEmail, skippedAlreadySent }
}

// -- 赛前预报名 ----------------------------------------------------------------

const COMPETITION_MAX_PRE_REGISTRATIONS = 2000
const COMPETITION_LOOKUP_LIMIT = 5

export interface CompetitionPreRegisterInput {
  name: string
  className?: string
  studentNo?: string
  phone?: string
  email?: string
  song?: string
  /** 自选参赛日：1 / 2；现场以签到当天为准。 */
  preferredDay?: number | null
}

export function serializePreRegistration(row: PreRegistrationRow, registeredSingerName: string | null): CompetitionPreRegistration {
  return {
    id: row.id,
    name: row.name,
    className: row.className,
    studentNo: row.studentNo,
    phone: row.phone,
    email: row.email,
    song: row.song,
    preferredDay: row.preferredDay === 1 || row.preferredDay === 2 ? row.preferredDay : null,
    registeredAt: row.registeredAt ? Number(row.registeredAt) : null,
    createdAt: Number(row.createdAt ?? 0),
    registeredSingerName
  }
}

/** 赛前预报名：姓名必填；有学号时按学号去重，防止重复占位。 */
export function preRegisterFromForm(
  client: DatabaseClient,
  contentId: string,
  input: CompetitionPreRegisterInput
): { id: string } {
  const eventRow = ensureCompetitionEvent(client, contentId)
  if (eventRow.registrationOpen === false) {
    conflictError('COMPETITION_REGISTRATION_CLOSED', '报名已结束，如需报名请联系音乐协会工作人员')
  }

  const normalized = normalizeSingerInput({
    name: input.name,
    className: input.className,
    studentNo: input.studentNo,
    phone: input.phone,
    email: input.email,
    song: input.song
  })

  // 表单里标了必填的项，服务端也拦一遍，不只靠页面上的 required。
  const requiredFields = getCompetitionFormFields(eventRow).filter(field => field.enabled && field.required)
  const values: Record<string, string | null> = {
    name: normalized.name,
    className: normalized.className,
    studentNo: normalized.studentNo,
    phone: normalized.phone,
    email: normalized.email,
    song: normalized.song
  }
  for (const field of requiredFields) {
    if (field.key === 'preferredDay') continue
    if (!values[field.key]) validationError(`${field.label}必填`, field.key)
  }
  if (requiredFields.some(field => field.key === 'preferredDay')
    && input.preferredDay !== 1 && input.preferredDay !== 2) {
    validationError('请选择打算哪天来', 'preferredDay')
  }

  if (normalized.studentNo) {
    const existing = client.db.select({ id: competitionPreRegistrations.id }).from(competitionPreRegistrations)
      .where(and(
        eq(competitionPreRegistrations.eventId, eventRow.id),
        eq(competitionPreRegistrations.studentNo, normalized.studentNo)
      ))
      .get()
    if (existing) {
      conflictError('ALREADY_PRE_REGISTERED', '该学号已预报名过，请勿重复提交')
    }
  }
  if (countPreRegistrations(client, eventRow.id) >= COMPETITION_MAX_PRE_REGISTRATIONS) {
    conflictError('COMPETITION_PRE_REGISTRATIONS_FULL', '预报名人数已满，请联系音乐协会工作人员')
  }

  const id = randomUUID()
  const preferredDay = input.preferredDay === 1 || input.preferredDay === 2 ? input.preferredDay : null
  client.db.insert(competitionPreRegistrations).values({
    id,
    eventId: eventRow.id,
    name: normalized.name,
    className: normalized.className,
    studentNo: normalized.studentNo,
    phone: normalized.phone,
    email: normalized.email,
    song: normalized.song,
    preferredDay,
    createdAt: Date.now()
  }).run()
  return { id }
}

function countPreRegistrations(client: DatabaseClient, eventId: string): number {
  return client.db.select({ id: competitionPreRegistrations.id }).from(competitionPreRegistrations)
    .where(eq(competitionPreRegistrations.eventId, eventId)).all().length
}

/** 现场登记时命中的预报名：只够让本人认出自己那条，不构成通讯录。 */
export interface CompetitionPreRegistrationMatch {
  id: string
  name: string
  className: string | null
  song: string | null
  preferredDay: 1 | 2 | null
  createdAt: number
  /** 只下发后四位（形如 `****0077`），完整学号留在库里。 */
  studentNoMasked: string
  /** 预报名当时有没有留手机或邮箱；具体值不下发。 */
  hasContact: boolean
}

/**
 * 现场正式报名时检索未使用的预报名：姓名必须同名，且学号后四位要对上。
 * 双因子是这条接口的下限——单凭姓名查不到任何人的记录；返回值不含手机、邮箱与完整学号。
 * 已确认的（registered_at 非空）不再出现。
 */
export function lookupPreRegistrations(
  client: DatabaseClient,
  contentId: string,
  nameInput: string,
  studentNoTailInput: string
): CompetitionPreRegistrationMatch[] {
  const name = String(nameInput ?? '').replace(/\s+/g, ' ').trim()
  const tail = String(studentNoTailInput ?? '').replace(/\D/g, '').slice(-4)
  if (!name || tail.length !== 4) return []

  const eventRow = ensureCompetitionEvent(client, contentId)
  const rows = client.db.select().from(competitionPreRegistrations)
    .where(and(
      eq(competitionPreRegistrations.eventId, eventRow.id),
      isNull(competitionPreRegistrations.registeredAt),
      eq(competitionPreRegistrations.name, name),
      like(competitionPreRegistrations.studentNo, `%${tail}`)
    ))
    .orderBy(desc(competitionPreRegistrations.createdAt))
    .limit(COMPETITION_LOOKUP_LIMIT)
    .all()

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    className: row.className,
    song: row.song,
    preferredDay: row.preferredDay === 1 || row.preferredDay === 2 ? row.preferredDay : null,
    createdAt: Number(row.createdAt ?? 0),
    studentNoMasked: `****${tail}`,
    hasContact: Boolean(row.phone || row.email)
  }))
}

export function listPreRegistrations(client: DatabaseClient, eventId: string): CompetitionPreRegistration[] {
  const rows = client.db.select().from(competitionPreRegistrations)
    .where(eq(competitionPreRegistrations.eventId, eventId))
    .orderBy(desc(competitionPreRegistrations.createdAt))
    .limit(500)
    .all()
  const singerNameByPreId = new Map(
    listSingers(client, eventId)
      .filter(singer => singer.preRegistrationId)
      .map(singer => [singer.preRegistrationId!, singer.name])
  )
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    className: row.className,
    studentNo: row.studentNo,
    phone: row.phone,
    email: row.email,
    song: row.song,
    preferredDay: row.preferredDay === 1 || row.preferredDay === 2 ? row.preferredDay : null,
    registeredAt: row.registeredAt ? Number(row.registeredAt) : null,
    createdAt: Number(row.createdAt ?? 0),
    registeredSingerName: row.registeredAt ? singerNameByPreId.get(row.id) ?? null : null
  }))
}
