import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import * as XLSX from '@e965/xlsx'
import { and, asc, desc, eq, isNull, like, or } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import {
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
import { hashPassword } from '../../utils/password'
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
  CompetitionDimension,
  CompetitionEmailRoundStats,
  CompetitionEmailSendRecord,
  CompetitionEmailSendStatus,
  CompetitionEmailState,
  CompetitionEmailTemplate,
  CompetitionEvent,
  CompetitionJudge,
  CompetitionJudgeCredentials,
  CompetitionJudgePayload,
  CompetitionPreRegistration,
  CompetitionRegistrationStatus,
  CompetitionRound,
  CompetitionRoundEntry,
  CompetitionRoundKey,
  CompetitionRoundStatus,
  CompetitionRoundView,
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
      title: '新生歌手大赛',
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
 */
export function buildRoundRanking(
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

  return {
    ...serializeRound(round),
    entries: buildRoundRanking(round, entries, singersById, scoreRows),
    judges: judges.map(judge => serializeJudge(judge, scoreCountByJudge.get(judge.id) ?? 0)),
    scores: scoreRows.map(score => serializeScore(score, judgeNameById.get(score.judgeId) ?? '评委')),
    maxTotal: competitionMaxTotal(dimensions),
    hasScores: scoreRows.length > 0
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
  })
}

/** 管理员手动调整出场顺序：提交本轮完整、无重复的 entryId 列表。 */
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
      updatedAt: Date.now()
    }).where(eq(competitionRounds.id, round.id)).run()
  })
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
    const passwordHash = await hashPassword(password)
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

export function updateJudge(
  client: DatabaseClient,
  roundId: string,
  judgeId: string,
  input: { displayName?: unknown, isActive?: unknown }
): CompetitionJudge {
  requireJudgeRow(client, roundId, judgeId)
  const patch: Partial<typeof competitionJudges.$inferInsert> = { updatedAt: Date.now() }

  if (input.displayName !== undefined) {
    const displayName = String(input.displayName ?? '').replace(/\s+/g, ' ').trim()
    if (!displayName || displayName.length > 20) validationError('评委名称必填且不超过 20 字', 'displayName')
    patch.displayName = displayName
  }
  if (input.isActive !== undefined) {
    patch.isActive = input.isActive === true
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
  const passwordHash = await hashPassword(password)
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

function addPrelimEntry(client: DatabaseClient, eventId: string, singerId: string, sortOrder: number): void {
  const prelim = getRoundByKey(client, eventId, 'prelim')
  client.db.insert(competitionRoundEntries).values({
    id: randomUUID(),
    roundId: prelim.id,
    singerId,
    sortOrder,
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

  const singers = entryRows
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
    finalResults,
    finalRound: finalRound ? { title: finalRound.title, status: finalRound.status } : null,
    progress: {
      scored: ownScores.size,
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
  const entry = client.db.select({ id: competitionRoundEntries.id }).from(competitionRoundEntries)
    .where(and(
      eq(competitionRoundEntries.roundId, round.id),
      eq(competitionRoundEntries.singerId, singerId)
    ))
    .get()
  if (!entry) {
    validationError('该选手不在本轮名单中', 'singerId')
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
  return { open: eventRow.registrationOpen !== false, title: eventRow.title }
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
  addPrelimEntry(client, eventRow.id, id, sortOrder)
  return { id, sortOrder }
}

// -- 结果邮件通知 ---------------------------------------------------------------

export const COMPETITION_EMAIL_TEMPLATE_DEFAULTS: Record<CompetitionRoundKey, { subject: string, body: string }> = {
  prelim: {
    subject: '【音乐协会】新生歌手大赛初赛结果通知',
    body: [
      '{{姓名}} 同学：',
      '',
      '感谢你参加仰恩大学音乐协会2026新生歌手大赛！',
      '',
      '你的初赛成绩：{{平均分}} 分（第{{名次}}名，{{结果}}）。',
      '',
      '后续安排请留意初赛群通知，期待在舞台上再次见到你！',
      '',
      '仰恩大学音乐协会'
    ].join('\n')
  },
  semi: {
    subject: '【音乐协会】新生歌手大赛复赛结果通知',
    body: [
      '{{姓名}} 同学：',
      '',
      '你在仰恩大学音乐协会2026新生歌手大赛复赛中的成绩：{{平均分}} 分（第{{名次}}名，{{结果}}）。',
      '',
      '后续安排请留意复赛群通知。感谢你的精彩演唱！',
      '',
      '仰恩大学音乐协会'
    ].join('\n')
  },
  final: {
    subject: '【音乐协会】新生歌手大赛决赛结果通知',
    body: [
      '{{姓名}} 同学：',
      '',
      '你在仰恩大学音乐协会2026新生歌手大赛决赛中的成绩：{{平均分}} 分（第{{名次}}名）。',
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

export function competitionEmailBodyToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<p style="margin:0 0 4px;line-height:1.8;">${escaped.split('\n').join('<br>')}</p>`
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
  return { templates, stats, latest }
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
  client.db.insert(competitionPreRegistrations).values({
    id,
    eventId: eventRow.id,
    name: normalized.name,
    className: normalized.className,
    studentNo: normalized.studentNo,
    phone: normalized.phone,
    email: normalized.email,
    song: normalized.song,
    createdAt: Date.now()
  }).run()
  return { id }
}

function countPreRegistrations(client: DatabaseClient, eventId: string): number {
  return client.db.select({ id: competitionPreRegistrations.id }).from(competitionPreRegistrations)
    .where(eq(competitionPreRegistrations.eventId, eventId)).all().length
}

/**
 * 现场正式报名时按姓名检索未使用的预报名：先精确同名，再模糊包含。
 * 返回联系方式用于一键填表；已确认的（registered_at 非空）不再出现。
 */
export function lookupPreRegistrations(
  client: DatabaseClient,
  contentId: string,
  nameInput: string
): Array<CompetitionPreRegistration & { registered: boolean }> {
  const name = String(nameInput ?? '').replace(/\s+/g, ' ').trim()
  if (!name) return []

  const eventRow = ensureCompetitionEvent(client, contentId)
  const unused = and(
    eq(competitionPreRegistrations.eventId, eventRow.id),
    isNull(competitionPreRegistrations.registeredAt)
  )
  const mapRows = (rows: PreRegistrationRow[]) => rows.map(row => ({
    id: row.id,
    name: row.name,
    className: row.className,
    studentNo: row.studentNo,
    phone: row.phone,
    email: row.email,
    song: row.song,
    registeredAt: null,
    createdAt: Number(row.createdAt ?? 0),
    registered: false,
    registeredSingerName: null
  }))

  const exact = client.db.select().from(competitionPreRegistrations)
    .where(and(unused, eq(competitionPreRegistrations.name, name)))
    .orderBy(desc(competitionPreRegistrations.createdAt))
    .limit(COMPETITION_LOOKUP_LIMIT)
    .all()
  if (exact.length > 0) return mapRows(exact)

  const partial = client.db.select().from(competitionPreRegistrations)
    .where(and(unused, like(competitionPreRegistrations.name, `%${name}%`)))
    .orderBy(desc(competitionPreRegistrations.createdAt))
    .limit(COMPETITION_LOOKUP_LIMIT)
    .all()
  return mapRows(partial)
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
    registeredAt: row.registeredAt ? Number(row.registeredAt) : null,
    createdAt: Number(row.createdAt ?? 0),
    registeredSingerName: row.registeredAt ? singerNameByPreId.get(row.id) ?? null : null
  }))
}
