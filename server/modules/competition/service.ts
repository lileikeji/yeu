import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import * as XLSX from '@e965/xlsx'
import { and, asc, desc, eq, gt, isNull, like, or } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import {
  competitionEmailImages,
  competitionEmailReceipts,
  competitionEmailSends,
  competitionEmailTemplates,
  competitionEvents,
  competitionFinalSongs,
  competitionJudges,
  competitionPopularityBallots,
  competitionPopularityInspections,
  competitionPopularitySettings,
  competitionPopularityVoteLogs,
  competitionPreRegistrations,
  competitionRoundEntries,
  competitionRounds,
  competitionScores,
  competitionSingers,
  contents
} from '../../database/schema'
import { hashPasswordWithMinLength } from '../../utils/password'
import { transcodeToMp3 } from '../../utils/audio-transcode'
import { detectUploadedAudioType, storeUploadedAudio } from '../../utils/uploaded-audio'
import { createZip, StreamingZip } from '../../utils/zip-archive'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { uploadDirectory } from '../../utils/uploaded-images'
import { contentTypeForName, cosConfig, headCosObject, newAccompanimentKey, presignCosGet, presignCosPut, putCosObject, type CosConfig } from '../../utils/cos-storage'
import {
  COMPETITION_MAX_DIMENSION_SCORE,
  COMPETITION_MAX_DIMENSIONS,
  COMPETITION_MAX_JUDGES,
  COMPETITION_MAX_SINGERS,
  DEFAULT_COMPETITION_DIMENSIONS,
  calculateCompetitionTotal,
  competitionMaxTotal,
  dimensionMaxOf,
  plainSortName,
  roundCompetitionScore
} from '../../../shared/utils/competition'
import type {
  CompetitionAdminPayload,
  CompetitionAdvanceMode,
  CompetitionAdvanceRow,
  CompetitionCallBoard,
  CompetitionCallBoardRow,
  CompetitionCurrentSinger,
  CompetitionDimension,
  CompetitionDuelPair,
  CompetitionEmailImage,
  CompetitionEmailRoundKey,
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
  CompetitionPopularityAdminState,
  CompetitionPopularityAuthMode,
  CompetitionPopularityBallot,
  CompetitionPopularityCandidate,
  CompetitionPopularityPublicState,
  CompetitionPopularityResultRow,
  CompetitionPopularitySettings,
  CompetitionPopularityStatus,
  CompetitionPreRegistration,
  CompetitionQueuePosition,
  CompetitionRankBoard,
  CompetitionRankRow,
  CompetitionQueueState,
  CompetitionReceiptState,
  CompetitionRegistrationStatus,
  CompetitionResultLookup,
  CompetitionRevivalState,
  CompetitionRound,
  CompetitionRoundEntry,
  CompetitionEntryAccompaniment,
  CompetitionFinalSongsPair,
  CompetitionFinalSongsState,
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
  dimensionMaxOf,
  roundCompetitionScore
} from '../../../shared/utils/competition'

interface RoundDefinition {
  key: CompetitionRoundKey
  title: string
  position: number
  advanceCount: number | null
}

/** 决赛第一轮取前六进第二轮；第二轮不再晋级。 */
export const COMPETITION_FINAL_ADVANCE_COUNT = 6

/** 固定四轮：初赛 → 复赛 → 决赛（第一轮）→ 决赛·第二轮。 */
export const COMPETITION_ROUND_DEFINITIONS: RoundDefinition[] = [
  { key: 'prelim', title: '初赛', position: 1, advanceCount: 30 },
  { key: 'semi', title: '复赛', position: 2, advanceCount: null },
  { key: 'final', title: '决赛', position: 3, advanceCount: COMPETITION_FINAL_ADVANCE_COUNT },
  { key: 'final2', title: '决赛·第二轮', position: 4, advanceCount: null }
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
  const withMax = input.filter((item) => {
    const own = Number((item as Record<string, unknown> | null)?.max)
    return Number.isFinite(own) && own > 0
  }).length
  if (withMax > 0 && withMax < input.length) {
    validationError('维度满分要么每个都填，要么都不填', 'dimensions')
  }
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
    const ownMax = Number(record.max)
    const dimension: CompetitionDimension = { key, label, weight: roundCompetitionScore(weight) }
    if (Number.isFinite(ownMax) && ownMax > 0) {
      if (ownMax > 100) validationError(`「${label}」的满分需为 1-100`, 'dimensions')
      dimension.max = Math.round(ownMax)
    }
    return dimension
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
type PopularitySettingsRow = typeof competitionPopularitySettings.$inferSelect
type PopularityBallotRow = typeof competitionPopularityBallots.$inferSelect

/** 本轮评分维度：单独配置优先，否则回落赛事级维度。 */
export function getRoundDimensions(round: RoundRow, eventRow?: EventRow | null): CompetitionDimension[] {
  const parsed = parseJson<CompetitionDimension[]>(round.dimensionsJson ?? '', [])
  if (Array.isArray(parsed) && parsed.length > 0) return parsed
  return eventRow ? getCompetitionDimensions(eventRow) : [...DEFAULT_COMPETITION_DIMENSIONS]
}

/** 本轮每维满分：初赛 10（满分 50），复赛/决赛 20（满分 100）。 */
export function getRoundDimensionMax(round: RoundRow): number {
  const value = Number(round.dimensionMax ?? 0)
  if (!Number.isFinite(value) || value < 1 || value > 100) return COMPETITION_MAX_DIMENSION_SCORE
  return Math.round(value)
}
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
    .where(and(eq(competitionEvents.contentId, contentId), eq(competitionEvents.isCurrent, 1)))
    .get()
    ?? client.db.select().from(competitionEvents)
      .where(eq(competitionEvents.contentId, contentId))
      .orderBy(desc(competitionEvents.createdAt))
      .get()
      ?? null
}

function ensureRounds(client: DatabaseClient, eventId: string): RoundRow[] {
  const existing = client.db.select().from(competitionRounds)
    .where(eq(competitionRounds.eventId, eventId))
    .all()
  const byKey = new Map(existing.map(round => [round.key, round]))
  const now = Date.now()
  let createdFinal2 = false

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
    if (definition.key === 'final2') createdFinal2 = true
  }

  // 老赛事升级：决赛第一轮原本没有晋级名额，升级时补成前六。
  const existingFinal = byKey.get('final')
  if (existingFinal && existingFinal.advanceCount === null) {
    client.db.update(competitionRounds)
      .set({ advanceCount: COMPETITION_FINAL_ADVANCE_COUNT, updatedAt: now })
      .where(eq(competitionRounds.id, existingFinal.id)).run()
  }

  // 决赛第二轮刚建出来时沿用第一轮的评分维度、精度与去极值设置。
  if (createdFinal2) {
    const rounds = client.db.select().from(competitionRounds)
      .where(eq(competitionRounds.eventId, eventId))
      .all()
    const finalRound = rounds.find(round => round.key === 'final')
    const final2Round = rounds.find(round => round.key === 'final2')
    if (finalRound && final2Round) {
      client.db.update(competitionRounds).set({
        judgeCount: finalRound.judgeCount,
        scorePrecision: finalRound.scorePrecision,
        dimensionsJson: finalRound.dimensionsJson,
        dimensionMax: finalRound.dimensionMax,
        trimExtremes: finalRound.trimExtremes,
        updatedAt: now
      }).where(eq(competitionRounds.id, final2Round.id)).run()
    }
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
  { key: 'qq', label: 'QQ', required: true, enabled: true },
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
    if (key !== 'prelim' && key !== 'semi' && key !== 'final' && key !== 'final2') return []
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
    trimExtremes: row.trimExtremes === 1,
    isCurrent: row.isCurrent !== 0,
    reminderSubject: row.reminderSubject || COMPETITION_REMINDER_DEFAULTS.subject,
    reminderBody: row.reminderBody || COMPETITION_REMINDER_DEFAULTS.body,
    qqGroupUrl: row.qqGroupUrl ?? '',
    dimensions,
    maxTotal: competitionMaxTotal(dimensions),
    revivalEnabled: row.revivalEnabled === true,
    revivalSlots: row.revivalSlots > 0 ? row.revivalSlots : 2,
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? 0)
  }
}

export function serializeRound(row: RoundRow, eventRow?: EventRow | null): CompetitionRound {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    position: row.position,
    status: row.status,
    judgeCount: row.judgeCount,
    advanceCount: row.advanceCount,
    advanceMode: row.advanceMode === 'duel' ? 'duel' : 'rank',
    rosterConfirmedAt: row.rosterConfirmedAt ?? null,
    resultQueryOpen: row.resultQueryOpen === 1,
    scorePrecision: row.scorePrecision === 'decimal' ? 'decimal' : 'integer',
    dimensions: getRoundDimensions(row, eventRow),
    dimensionMax: getRoundDimensionMax(row),
    maxTotal: competitionMaxTotal(getRoundDimensions(row, eventRow), getRoundDimensionMax(row)),
    trimExtremes: row.trimExtremes === null || row.trimExtremes === undefined
      ? eventRow?.trimExtremes === 1
      : row.trimExtremes === 1,
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

/** 条目上的曲目优先；只有初赛（报名登记的 song）允许回退到选手库，复赛/决赛空着就是空着。 */
export function entrySingerPublic(
  entry: EntryRow,
  singer: SingerRow,
  roundKey?: CompetitionRoundKey
): CompetitionSingerPublic {
  const base = serializeSingerPublic(singer)
  const song = (entry.song ?? '').trim()
  if (song) return { ...base, song }
  if (roundKey === 'prelim' || roundKey === undefined) return base
  return { ...base, song: '' }
}

/** 照片：库里存对象存储 key，读的时候现签 6 小时地址；没配 COS 时给出空值。 */
export function singerPhotoUrl(row: { photoKey: string | null }): string | null {
  const key = String(row.photoKey ?? '').trim()
  if (!key) return null
  const config = cosConfig()
  if (!config) return null
  // 按扩展名给正确的 Content-Type，别把 PNG/WebP/HEIC 一律当 jpeg，否则部分浏览器不渲染。
  const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
  const contentType
    = extension === 'png'
      ? 'image/png'
      : extension === 'webp'
        ? 'image/webp'
        : extension === 'heic' || extension === 'heif'
          ? 'image/heic'
          : 'image/jpeg'
  return presignCosGet(config, key, 6 * 60 * 60, contentType)
}

export function serializeSingerPublic(row: SingerRow): CompetitionSingerPublic {
  return {
    id: row.id,
    name: row.name,
    song: row.song,
    className: row.className,
    remark: row.remark,
    sortOrder: row.sortOrder,
    photoUrl: singerPhotoUrl(row),
    photoUpdatedAt: row.photoUpdatedAt == null ? null : Number(row.photoUpdatedAt),
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? 0)
  }
}

/** 上传/替换选手照片：写对象存储后只记 key，读的时候现签地址。 */
export async function setSingerPhoto(
  client: DatabaseClient,
  singerId: string,
  file: { filename: string, data: Uint8Array }
): Promise<{ url: string | null }> {
  const singer = client.db.select().from(competitionSingers)
    .where(eq(competitionSingers.id, singerId))
    .get()
  if (!singer) conflictError('SINGER_NOT_FOUND', '找不到这位选手')

  const config = cosConfig()
  if (!config) conflictError('STORAGE_NOT_CONFIGURED', '对象存储还没配置')
  const extension = (file.filename.split('.').pop() ?? '').toLowerCase()
  const safe = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension) ? extension : 'jpg'
  const key = `competition/photos/${randomUUID()}.${safe}`
  const contentType = safe === 'png' ? 'image/png' : safe === 'webp' ? 'image/webp' : 'image/jpeg'
  await putCosObject(config, key, file.data, contentType)
  client.db.update(competitionSingers)
    .set({ photoKey: key, photoUpdatedAt: Date.now() })
    .where(eq(competitionSingers.id, singerId))
    .run()
  const row = client.db.select().from(competitionSingers).where(eq(competitionSingers.id, singerId)).get()
  return { url: row ? singerPhotoUrl(row) : null }
}

export function serializeSinger(row: SingerRow): CompetitionSinger {
  return {
    ...serializeSingerPublic(row),
    studentNo: row.studentNo,
    phone: row.phone,
    email: row.email,
    qq: row.qq,
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

export interface AdminRoundScoreInput {
  singerId: string
  judgeId: string
  scores: Record<string, number>
  comment?: string
}

/**
 * 后台替某位评委改分或补录。
 *
 * 与评委自己提交的差别只有校验口径：不看轮次是否开放、不看评委当天班次、
 * 不锁「正在唱」的那位。现场要救场的情况很多（评委手机没电、漏打一个维度、
 * 结束评分后才发现算错），由管理员直接改，改完平均分与排名按同一套规则重算。
 */
export function adminUpsertRoundScore(
  client: DatabaseClient,
  round: RoundRow,
  input: AdminRoundScoreInput
): CompetitionScore {
  const eventRow = getEvent(client, round.eventId)
  if (!eventRow) {
    throw createError({ statusCode: 404, statusMessage: 'Competition not found', data: { code: 'NOT_FOUND' } })
  }

  const entry = client.db.select({ id: competitionRoundEntries.id }).from(competitionRoundEntries)
    .where(and(
      eq(competitionRoundEntries.roundId, round.id),
      eq(competitionRoundEntries.singerId, input.singerId)
    ))
    .get()
  if (!entry) validationError('该选手不在本轮名单中', 'singerId')

  const judge = client.db.select().from(competitionJudges)
    .where(and(
      eq(competitionJudges.id, input.judgeId),
      eq(competitionJudges.roundId, round.id)
    ))
    .get()
  if (!judge) validationError('这位评委不在本轮', 'judgeId')

  const dimensions = getRoundDimensions(round, eventRow)
  const dimensionMax = getRoundDimensionMax(round)
  const snapshot: CompetitionScoreDimension[] = dimensions.map((dimension) => {
    const value = Number(input.scores?.[dimension.key])
    const max = dimensionMaxOf(dimension, dimensionMax)
    if (!Number.isFinite(value) || value < 0 || value > max) {
      validationError(`「${dimension.label}」需为 0-${max} 的分数`, `scores.${dimension.key}`)
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
    Object.fromEntries(snapshot.map(item => [item.key, item.score])),
    dimensionMax
  )
  const now = Date.now()
  const where = and(
    eq(competitionScores.roundId, round.id),
    eq(competitionScores.singerId, input.singerId),
    eq(competitionScores.judgeId, input.judgeId)
  )
  const existing = client.db.select().from(competitionScores).where(where).get()

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
      singerId: input.singerId,
      judgeId: input.judgeId,
      dimensionsJson: JSON.stringify(snapshot),
      totalScore: total,
      comment,
      createdAt: now,
      updatedAt: now
    }).run()
  }

  const row = client.db.select().from(competitionScores).where(where).get()!
  return serializeScore(row, judge.displayName)
}

export interface UpdateCompetitionInput {
  title: unknown
  registrationOpen: unknown
  dimensions: unknown
  edition?: unknown
  schedule?: unknown
  formFields?: unknown
  trimExtremes?: unknown
  qqGroupUrl?: unknown
  /** 隐藏赛制复活开关与名额。 */
  revivalEnabled?: unknown
  revivalSlots?: unknown
}

function normalizeSchedule(input: unknown): CompetitionScheduleItem[] {
  if (!Array.isArray(input)) validationError('赛程格式不正确', 'schedule')
  const items: CompetitionScheduleItem[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const key = item.key
    if (key !== 'prelim' && key !== 'semi' && key !== 'final' && key !== 'final2') continue
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

  const trimExtremes = input.trimExtremes === undefined
    ? row.trimExtremes === 1
    : input.trimExtremes === true
  const qqGroupUrl = input.qqGroupUrl === undefined
    ? (row.qqGroupUrl ?? '')
    : String(input.qqGroupUrl).trim().slice(0, 400)
  const revivalEnabled = input.revivalEnabled === undefined
    ? row.revivalEnabled === true
    : input.revivalEnabled === true
  const revivalSlots = input.revivalSlots === undefined
    ? revivalSlotSetting(row)
    : Math.min(REVIVAL_MAX_SLOTS, Math.max(REVIVAL_MIN_SLOTS, Math.trunc(Number(input.revivalSlots) || 2)))
  client.db.update(competitionEvents).set({
    title,
    registrationOpen,
    edition,
    qqGroupUrl,
    trimExtremes: trimExtremes ? 1 : 0,
    revivalEnabled,
    revivalSlots,
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
  /** 决赛晋级方式：rank / duel；其他轮次不允许切换。 */
  advanceMode?: unknown
  scorePrecision?: unknown
  /** 本轮评分维度（不传则沿用赛事级或上次设置）。 */
  dimensions?: unknown
  /** 本轮每维满分：初赛 10、复赛/决赛 20。 */
  dimensionMax?: unknown
  /** 本轮算平均分是否去掉一个最高分和一个最低分。 */
  trimExtremes?: unknown
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
  let clearPairData = false

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

  if (input.scorePrecision !== undefined) {
    const precision = String(input.scorePrecision)
    if (precision !== 'integer' && precision !== 'decimal') {
      validationError('打分精度只能是整数或小数', 'scorePrecision')
    }
    patch.scorePrecision = precision
  }

  if (input.dimensions !== undefined) {
    if (scores > 0) {
      conflictError('COMPETITION_HAS_SCORES', '本轮已有评分，不能修改评分维度')
    }
    patch.dimensionsJson = JSON.stringify(validateCompetitionDimensions(input.dimensions))
  }

  if (input.dimensionMax !== undefined || input.dimensions !== undefined) {
    if (scores > 0 && input.dimensionMax !== undefined) {
      conflictError('COMPETITION_HAS_SCORES', '本轮已有评分，不能修改每维满分')
    }
    if (input.dimensionMax !== undefined) {
      const max = Number(input.dimensionMax)
      if (!Number.isInteger(max) || max < 1 || max > 100) {
        validationError('每维满分需为 1-100 的整数', 'dimensionMax')
      }
      patch.dimensionMax = max
    }
  }

  if (input.trimExtremes !== undefined) {
    patch.trimExtremes = input.trimExtremes === true ? 1 : 0
  }

  if (input.judgeCount !== undefined) {
    const judgeCount = Number(input.judgeCount)
    if (!Number.isInteger(judgeCount) || judgeCount < 1 || judgeCount > COMPETITION_MAX_JUDGES) {
      validationError(`评委人数需为 1-${COMPETITION_MAX_JUDGES} 的整数`, 'judgeCount')
    }
    patch.judgeCount = judgeCount
  }

  if (input.advanceMode !== undefined) {
    if (round.key !== 'final') validationError('只有决赛可以切换晋级方式', 'advanceMode')
    const mode = String(input.advanceMode) as CompetitionAdvanceMode
    if (mode !== 'rank' && mode !== 'duel') validationError('晋级方式无效', 'advanceMode')
    if (mode !== (round.advanceMode === 'duel' ? 'duel' : 'rank')) {
      if (scores > 0) conflictError('ROUND_HAS_SCORES', '本轮已有评分，不能切换晋级方式；先清空评分再切换')
      if (round.rosterConfirmedAt !== null) {
        conflictError('ROUND_ROSTER_CONFIRMED', '晋级名单已确认，不能切换晋级方式；请先取消确认')
      }
      if (downstreamEntries > 0) {
        conflictError('ROUND_ADVANCE_LOCKED', '下一轮名单已生成，不能切换晋级方式；请先清空下一轮名单')
      }
      patch.advanceMode = mode
      clearPairData = true
    }
  }

  if (round.key === 'final') {
    // 决赛第一轮固定取前六进第二轮；第二轮不再产生下一轮。
    patch.advanceCount = COMPETITION_FINAL_ADVANCE_COUNT
  } else if (round.key === 'final2') {
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

  client.db.transaction((transaction) => {
    transaction.update(competitionRounds).set(patch).where(eq(competitionRounds.id, round.id)).run()
    if (clearPairData) {
      transaction.update(competitionRoundEntries)
        .set({ pairNo: null, pairSlot: null, advanced: null })
        .where(eq(competitionRoundEntries.roundId, round.id)).run()
    }
  })
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

function averageOf(totals: number[], trimExtremes = false): number | null {
  if (totals.length === 0) return null
  // 去掉一个最高分和一个最低分：至少 3 位评委才有意义，人少时照常取全部。
  const usable = trimExtremes && totals.length >= 3
    ? [...totals].sort((left, right) => left - right).slice(1, -1)
    : totals
  return roundCompetitionScore(usable.reduce((sum, value) => sum + value, 0) / usable.length)
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

function trimExtremesFor(client: DatabaseClient, round: RoundRow): boolean {
  if (round.trimExtremes === 0 || round.trimExtremes === 1) return round.trimExtremes === 1
  return getEvent(client, round.eventId)?.trimExtremes === 1
}

interface DuelOutcome {
  winnerEntryId: string | null
  note: string
}

/**
 * 抽签 1v1 的组内胜负：平均分 → 评委多数 → 最高单项分 → 次高单项分。
 * 仍然分不出就返回 null，由后台要求加赛或人工裁定，绝不静默按出场顺序晋级。
 */
function duelOutcomes(
  entries: EntryRow[],
  scoreRows: ScoreRow[],
  trimExtremes: boolean
): Map<number, DuelOutcome> {
  const groups = new Map<number, EntryRow[]>()
  for (const entry of entries) {
    if (entry.pairNo === null || entry.pairNo === undefined) continue
    const list = groups.get(entry.pairNo) ?? []
    list.push(entry)
    groups.set(entry.pairNo, list)
  }
  const scoresBySinger = new Map<string, ScoreRow[]>()
  for (const score of scoreRows) {
    const list = scoresBySinger.get(score.singerId) ?? []
    list.push(score)
    scoresBySinger.set(score.singerId, list)
  }

  const outcomes = new Map<number, DuelOutcome>()
  for (const [pairNo, pairEntries] of groups) {
    const ordered = pairEntries.slice().sort((left, right) =>
      (left.pairSlot ?? 0) - (right.pairSlot ?? 0))
    const left = ordered[0]
    const right = ordered[1]
    if (!left || !right) {
      outcomes.set(pairNo, {
        winnerEntryId: left?.id ?? null,
        note: left ? '轮空，直接晋级' : '这一组还没有选手'
      })
      continue
    }
    const leftScores = scoresBySinger.get(left.singerId) ?? []
    const rightScores = scoresBySinger.get(right.singerId) ?? []
    if (leftScores.length === 0 || rightScores.length === 0) {
      outcomes.set(pairNo, { winnerEntryId: null, note: '等待两位选手都完成评分' })
      continue
    }

    const leftAverage = averageOf(leftScores.map(score => roundCompetitionScore(Number(score.totalScore ?? 0))), trimExtremes)
    const rightAverage = averageOf(rightScores.map(score => roundCompetitionScore(Number(score.totalScore ?? 0))), trimExtremes)
    if (leftAverage !== rightAverage) {
      outcomes.set(pairNo, {
        winnerEntryId: (leftAverage ?? -1) > (rightAverage ?? -1) ? left.id : right.id,
        note: `平均分 ${leftAverage} : ${rightAverage}`
      })
      continue
    }

    // 评委多数：同一位评委对两人的总分谁高；平票不计。
    const rightByJudge = new Map(rightScores.map(score => [score.judgeId, score]))
    let leftVotes = 0
    let rightVotes = 0
    let commonJudges = 0
    for (const leftScore of leftScores) {
      const rightScore = rightByJudge.get(leftScore.judgeId)
      if (!rightScore) continue
      commonJudges += 1
      const leftTotal = Number(leftScore.totalScore ?? 0)
      const rightTotal = Number(rightScore.totalScore ?? 0)
      if (leftTotal > rightTotal) leftVotes += 1
      else if (rightTotal > leftTotal) rightVotes += 1
    }
    if (commonJudges !== leftScores.length || commonJudges !== rightScores.length) {
      outcomes.set(pairNo, { winnerEntryId: null, note: '两位选手的评委票不齐，等评分补齐' })
      continue
    }
    if (leftVotes !== rightVotes) {
      outcomes.set(pairNo, {
        winnerEntryId: leftVotes > rightVotes ? left.id : right.id,
        note: `平均分相同，评委多数 ${leftVotes} : ${rightVotes}`
      })
      continue
    }

    // 最高单项分：把所有维度得分从高到低逐项比较，先大者胜。
    const dimensionScores = (scores: ScoreRow[]): number[] => scores
      .flatMap(score => parseJson<CompetitionScoreDimension[]>(score.dimensionsJson, []))
      .map(item => Number(item.score ?? 0))
      .filter(value => Number.isFinite(value))
      .sort((a, b) => b - a)
    const leftDimensions = dimensionScores(leftScores)
    const rightDimensions = dimensionScores(rightScores)
    let dimensionWinner: 'left' | 'right' | null = null
    const maxLength = Math.max(leftDimensions.length, rightDimensions.length)
    for (let index = 0; index < maxLength; index += 1) {
      const leftValue = leftDimensions[index] ?? -1
      const rightValue = rightDimensions[index] ?? -1
      if (leftValue === rightValue) continue
      dimensionWinner = leftValue > rightValue ? 'left' : 'right'
      break
    }
    if (dimensionWinner) {
      outcomes.set(pairNo, {
        winnerEntryId: dimensionWinner === 'left' ? left.id : right.id,
        note: '平均分、评委多数相同，按单项分决胜'
      })
      continue
    }

    outcomes.set(pairNo, { winnerEntryId: null, note: '同分，需加赛或人工裁定' })
  }
  return outcomes
}

function buildDuelPairs(
  rankedEntries: CompetitionRoundEntry[],
  outcomes: Map<number, DuelOutcome>
): CompetitionDuelPair[] {
  const groups = new Map<number, CompetitionRoundEntry[]>()
  for (const entry of rankedEntries) {
    if (entry.pairNo === null) continue
    const list = groups.get(entry.pairNo) ?? []
    list.push(entry)
    groups.set(entry.pairNo, list)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([pairNo, pairEntries]) => {
      const entries = pairEntries.slice().sort((left, right) =>
        (left.pairSlot ?? 0) - (right.pairSlot ?? 0))
      const outcome = outcomes.get(pairNo)
      const winner = outcome?.winnerEntryId ?? null
      return {
        pairNo,
        entries,
        winnerEntryId: winner,
        winnerName: entries.find(entry => entry.id === winner)?.singer.name ?? null,
        ready: Boolean(winner),
        note: outcome?.note ?? '等待抽签'
      }
    })
}

const REVIVAL_MIN_SLOTS = 1
const REVIVAL_MAX_SLOTS = 6

/** 后台设置的复活名额（1–6，默认 2）；开关是否生效由调用方判断。 */
function revivalSlotSetting(eventRow: EventRow | null): number {
  const raw = Number(eventRow?.revivalSlots ?? 2)
  if (!Number.isFinite(raw)) return 2
  return Math.min(REVIVAL_MAX_SLOTS, Math.max(REVIVAL_MIN_SLOTS, Math.trunc(raw)))
}

/** 实际生效的复活名额；开关关掉就是 0。 */
export function revivalSlotsOf(eventRow: EventRow | null): number {
  return eventRow?.revivalEnabled === true ? revivalSlotSetting(eventRow) : 0
}

/**
 * 隐藏赛制复活：只有「决赛 + 抽签 1v1」才有这个状态。
 *
 * 候选人是每组已经分出胜负的败者，按本轮均分从高到低排；轮空组没有败者，
 * 没有评分的败者也不排队——宁可少复活，也不能让缺席的人占掉名额。
 */
export function revivalState(
  client: DatabaseClient,
  round: RoundRow,
  eventRow: EventRow | null
): CompetitionRevivalState | null {
  if (round.key !== 'final' || round.advanceMode !== 'duel') return null
  const slots = revivalSlotSetting(eventRow)
  if (eventRow?.revivalEnabled !== true) return { enabled: false, slots, candidates: [] }

  const entries = listRoundEntryRows(client, round.id)
  const scoreRows = listRoundScores(client, round.id)
  const trimExtremes = trimExtremesFor(client, round)
  const singersById = new Map(listSingers(client, round.eventId).map(singer => [singer.id, singer]))
  const totalsBySinger = new Map<string, number[]>()
  for (const score of scoreRows) {
    const list = totalsBySinger.get(score.singerId) ?? []
    list.push(roundCompetitionScore(Number(score.totalScore ?? 0)))
    totalsBySinger.set(score.singerId, list)
  }

  const losers: Array<{ entry: EntryRow, average: number, scoreCount: number }> = []
  for (const [pairNo, outcome] of duelOutcomes(entries, scoreRows, trimExtremes)) {
    if (!outcome.winnerEntryId) continue
    const pairEntries = entries.filter(entry => entry.pairNo === pairNo)
    if (pairEntries.length < 2) continue
    const loser = pairEntries.find(entry => entry.id !== outcome.winnerEntryId)
    if (!loser) continue
    const totals = totalsBySinger.get(loser.singerId) ?? []
    const average = averageOf(totals, trimExtremes)
    if (average === null) continue
    losers.push({ entry: loser, average, scoreCount: totals.length })
  }
  losers.sort((left, right) =>
    (right.average - left.average) || (left.entry.sortOrder - right.entry.sortOrder))

  return {
    enabled: true,
    slots,
    candidates: losers.map((row, index) => {
      const singer = singersById.get(row.entry.singerId)
      return {
        entryId: row.entry.id,
        singerId: row.entry.singerId,
        name: singer?.name ?? '未知选手',
        className: singer?.className ?? '',
        average: row.average,
        scoreCount: row.scoreCount,
        loserRank: index + 1,
        revived: index < slots
      }
    })
  }
}

function buildRoundRanking(
  round: RoundRow,
  entries: EntryRow[],
  singersById: Map<string, SingerRow>,
  scoreRows: ScoreRow[],
  options: { trimExtremes?: boolean } = {}
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
        average: averageOf(totals, options.trimExtremes === true),
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
  const duelMode = round.key === 'final' && round.advanceMode === 'duel'
  const duelWinners = duelMode
    ? new Set(
        [...duelOutcomes(entries, scoreRows, options.trimExtremes === true).values()]
          .map(outcome => outcome.winnerEntryId)
          .filter((entryId): entryId is string => Boolean(entryId))
      )
    : null
  if (!settled) {
    // 进行中也出名次（实时排行），但名单仍按出场顺序返回，避免后台名单表被排名打乱；
    // 晋级标记只有整轮结束才给。
    const liveRank = new Map<string, number>()
    let liveAverage: number | null = null
    let liveRankValue = 0
    scored.forEach((row, index) => {
      if (liveAverage === null || row.average !== liveAverage) {
        liveRankValue = index + 1
        liveAverage = row.average
      }
      liveRank.set(row.entry.id, liveRankValue)
    })

    return rows
      .slice()
      .sort((left, right) =>
        (left.entry.sortOrder - right.entry.sortOrder)
        || left.singer.name.localeCompare(right.singer.name, 'zh-Hans-CN'))
      .map(row => ({
        id: row.entry.id,
        singer: entrySingerPublic(row.entry, row.singer, round.key),
        sortOrder: row.entry.sortOrder,
        contestDay: row.entry.contestDay ?? null,
        checkedInAt: row.entry.checkedInAt ?? null,
        advanced: row.entry.advanced ?? null,
        revived: row.entry.revived === 1,
        pairNo: row.entry.pairNo ?? null,
        pairSlot: row.entry.pairSlot ?? null,
        advancedFromRank: row.entry.advancedFromRank,
        song: row.entry.song ?? null,
        accompaniment: serializeAccompaniment(row.entry),
        accompanimentUpdatedAt: (row.entry as { accompanimentUpdatedAt?: number | null }).accompanimentUpdatedAt ?? null,
        average: row.average,
        scoreCount: row.scoreCount,
        rank: liveRank.get(row.entry.id) ?? null,
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
      singer: entrySingerPublic(row.entry, row.singer, round.key),
      sortOrder: row.entry.sortOrder,
      contestDay: row.entry.contestDay ?? null,
      checkedInAt: row.entry.checkedInAt ?? null,
      advanced: row.entry.advanced ?? null,
      revived: row.entry.revived === 1,
      pairNo: row.entry.pairNo ?? null,
      pairSlot: row.entry.pairSlot ?? null,
      advancedFromRank: row.entry.advancedFromRank,
      song: row.entry.song ?? null,
      accompaniment: serializeAccompaniment(row.entry),
      accompanimentUpdatedAt: (row.entry as { accompanimentUpdatedAt?: number | null }).accompanimentUpdatedAt ?? null,
      average: row.average,
      scoreCount: row.scoreCount,
      rank: lastRank,
      qualified: round.status === 'closed'
        && (duelMode ? duelWinners?.has(row.entry.id) === true : round.advanceCount !== null && index < round.advanceCount),
      forfeited: false
    })
  })
  for (const row of unscored) {
    result.push({
      id: row.entry.id,
      singer: entrySingerPublic(row.entry, row.singer, round.key),
      sortOrder: row.entry.sortOrder,
      contestDay: row.entry.contestDay ?? null,
      checkedInAt: row.entry.checkedInAt ?? null,
      advanced: row.entry.advanced ?? null,
      revived: row.entry.revived === 1,
      pairNo: row.entry.pairNo ?? null,
      pairSlot: row.entry.pairSlot ?? null,
      advancedFromRank: row.entry.advancedFromRank,
      song: row.entry.song ?? null,
      accompaniment: serializeAccompaniment(row.entry),
      accompanimentUpdatedAt: (row.entry as { accompanimentUpdatedAt?: number | null }).accompanimentUpdatedAt ?? null,
      average: null,
      scoreCount: 0,
      rank: null,
      qualified: false,
      forfeited: round.status === 'closed'
    })
  }
  return result
}

// -- 导出（后台名单） ----------------------------------------------------------

export type CompetitionExportKind = 'detail' | 'summary' | 'advancing' | 'confirmed' | 'confirmed-plain' | 'songs'

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvTable(rows: unknown[][]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}

function formatExportTime(value: number | null | undefined): string {
  if (!value) return ''
  const date = new Date(Number(value))
  if (Number.isNaN(date.getTime())) return ''
  const pad = (input: number): string => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 后台导出：成绩明细（一行 = 一位评委给一位选手的一次评分）、
 * 排名汇总（一行 = 一位选手）、晋级名单（按本轮晋级人数截取）。
 *
 * 导出复用页面上的同一套排名算法（含去极值开关），所以导出的名次与
 * 后台看到的完全一致，不存在「导出另算一套」的偏差。
 */
/** 多音姓氏按姓氏读音换成同音常用字，只为借用拼音排序规则定位。 */
function formatMegabytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '未知'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function buildCompetitionExport(
  client: DatabaseClient,
  round: RoundRow,
  kind: CompetitionExportKind
): { filename: string, csv: string } {
  const eventRow = getEvent(client, round.eventId)
  const dimensions = eventRow ? getCompetitionDimensions(eventRow) : []
  const singers = listSingers(client, round.eventId)
  const singersById = new Map(singers.map(singer => [singer.id, singer]))
  const entries = listRoundEntryRows(client, round.id)
  const scoreRows = listRoundScores(client, round.id)
  const judges = listRoundJudges(client, round.id)
  const scoreByKey = new Map(scoreRows.map(score => [`${score.singerId}:${score.judgeId}`, score]))
  const ranking = buildRoundRanking(round, entries, singersById, scoreRows, {
    trimExtremes: eventRow?.trimExtremes === 1
  })
  const entryBySinger = new Map(entries.map(entry => [entry.singerId, entry]))
  // 「出场顺序」按当天排、不跨天累计：第 2 天第 1 位就是 1，而不是第一天的 50 之后接着数。
  const daySequence = new Map<string, number>()
  const entriesByDay = new Map<number, EntryRow[]>()
  for (const entry of entries) {
    const day = entry.contestDay ?? 0
    const bucket = entriesByDay.get(day)
    if (bucket) bucket.push(entry)
    else entriesByDay.set(day, [entry])
  }
  for (const bucket of entriesByDay.values()) {
    ;[...bucket]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt)
      .forEach((entry, index) => { daySequence.set(entry.id, index + 1) })
  }
  const dayLabelOf = (day: number | null | undefined): string => (day ? `第 ${day} 天` : '')

  const rows: unknown[][] = []
  let label = '成绩明细'

  if (kind === 'detail') {
    rows.push(['选手', '班级', '歌曲', '参赛天', '出场顺序', '签到时间', '评委', ...dimensions.map(item => item.label), '总分', '备注', '更新时间'])
    for (const entry of entries) {
      const singer = singersById.get(entry.singerId)
      if (!singer) continue
      for (const judge of judges) {
        const score = scoreByKey.get(`${singer.id}:${judge.id}`)
        if (!score) continue
        const snapshot = parseJson<CompetitionScoreDimension[]>(score.dimensionsJson, [])
        const scoreByDimension = new Map(snapshot.map(item => [item.key, item.score]))
        rows.push([
          singer.name,
          singer.className ?? '',
          singer.song,
          dayLabelOf(entry.contestDay),
          daySequence.get(entry.id) ?? '',
          formatExportTime(entry.checkedInAt),
          judge.displayName,
          ...dimensions.map(item => scoreByDimension.get(item.key) ?? ''),
          roundCompetitionScore(Number(score.totalScore ?? 0)).toFixed(2),
          score.comment ?? '',
          formatExportTime(Number(score.updatedAt ?? score.createdAt ?? 0))
        ])
      }
    }
  } else if (kind === 'confirmed') {
    const contactRows = client.db.select().from(competitionSingers)
      .where(eq(competitionSingers.eventId, round.eventId))
      .all()
    const contactById = new Map(contactRows.map(row => [row.id, row]))
    // 确认后的晋级名单：以人工勾选的结果为准（advanced === 1），不再按名次截取。
    if (round.rosterConfirmedAt === null) {
      conflictError('ROSTER_NOT_CONFIRMED', '先确认晋级名单，再导出确认后的名单')
    }
    const confirmedRows = ranking
      .filter(row => entryBySinger.get(row.singer.id)?.advanced === 1)
      .sort((left, right) =>
        ((left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
        || (left.sortOrder - right.sortOrder)
      )
    label = '确认后的晋级名单'
    rows.push([
      '晋级序',
      '选手',
      '班级',
      '学号',
      'QQ',
      '邮箱',
      '电话',
      '歌曲',
      '参赛天',
      '出场顺序',
      '评分人数',
      '平均分',
      '名次'
    ])
    confirmedRows.forEach((row, index) => {
      const entry = entryBySinger.get(row.singer.id)
      rows.push([
        index + 1,
        row.singer.name,
        row.singer.className ?? '',
        contactById.get(row.singer.id)?.studentNo ?? '',
        contactById.get(row.singer.id)?.qq ?? '',
        contactById.get(row.singer.id)?.email ?? '',
        contactById.get(row.singer.id)?.phone ?? '',
        row.singer.song,
        dayLabelOf(entry?.contestDay ?? null),
        (entry && daySequence.get(entry.id)) || '',
        row.scoreCount,
        row.average === null ? '' : row.average.toFixed(2),
        row.rank ?? ''
      ])
    })
  } else if (kind === 'confirmed-plain') {
    const contactRows = client.db.select().from(competitionSingers)
      .where(eq(competitionSingers.eventId, round.eventId))
      .all()
    const contactById = new Map(contactRows.map(row => [row.id, row]))
    if (round.rosterConfirmedAt === null) {
      conflictError('ROSTER_NOT_CONFIRMED', '先确认晋级名单，再导出确认后的名单')
    }
    // 不带成绩的名单：按姓名首字拼音排（同首字再按整个姓名，最后按出场顺序），方便现场点名。
    // 多音姓氏用常用同音字替换后再交给排序器，否则「曾」会被读成 céng 排到最前面。
    const plainCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin')
    const plainRows = ranking
      .filter(row => entryBySinger.get(row.singer.id)?.advanced === 1)
      .sort((left, right) =>
        plainCollator.compare(plainSortName(left.singer.name).slice(0, 1), plainSortName(right.singer.name).slice(0, 1))
        || plainCollator.compare(plainSortName(left.singer.name), plainSortName(right.singer.name))
        || (left.sortOrder - right.sortOrder)
      )
    label = '晋级名单（不带成绩）'
    rows.push([
      '序号',
      '选手',
      '班级',
      '学号',
      'QQ',
      '邮箱',
      '电话',
      '歌曲',
      '参赛天',
      '出场顺序'
    ])
    plainRows.forEach((row, index) => {
      const entry = entryBySinger.get(row.singer.id)
      rows.push([
        index + 1,
        row.singer.name,
        row.singer.className ?? '',
        contactById.get(row.singer.id)?.studentNo ?? '',
        contactById.get(row.singer.id)?.qq ?? '',
        contactById.get(row.singer.id)?.email ?? '',
        contactById.get(row.singer.id)?.phone ?? '',
        row.singer.song,
        dayLabelOf(entry?.contestDay ?? null),
        (entry && daySequence.get(entry.id)) || ''
      ])
    })
  } else if (kind === 'songs') {
    // 曲目名单：按姓名拼音首字母排，现场照着点人；伴奏一栏只写有没有传，方便催交。
    const songCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin')
    const songRows = [...ranking].sort((left, right) =>
      songCollator.compare(plainSortName(left.singer.name).slice(0, 1), plainSortName(right.singer.name).slice(0, 1))
      || songCollator.compare(plainSortName(left.singer.name), plainSortName(right.singer.name))
      || (left.sortOrder - right.sortOrder)
    )
    label = '曲目名单'
    rows.push(['序号', '姓名', '班级', '曲目', '伴奏'])
    songRows.forEach((row, index) => {
      const entry = entryBySinger.get(row.singer.id)
      rows.push([
        index + 1,
        row.singer.name,
        row.singer.className ?? '',
        (entry?.song ?? '').trim() || row.singer.song || '',
        entry?.accompanimentUrl ? `已传（${formatMegabytes(entry.accompanimentSize ?? 0)}）` : '未传'
      ])
    })
  } else {
    const ordered = [...ranking].sort((left, right) =>
      ((left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
      || (left.sortOrder - right.sortOrder)
    )
    const limit = round.advanceCount
    const pending = round.status !== 'closed'
    const selected = kind === 'advancing' && limit !== null
      ? ordered.filter(row => row.average !== null).slice(0, limit)
      : ordered
    label = kind === 'advancing' ? '晋级名单' : '排名汇总'

    rows.push([
      kind === 'advancing' ? '晋级序' : '排名',
      '选手',
      '班级',
      '歌曲',
      '参赛天',
      '出场顺序',
      '评分人数',
      '平均分',
      ...(kind === 'advancing' ? ['备注'] : ['状态'])
    ])
    selected.forEach((row, index) => {
      const entry = entryBySinger.get(row.singer.id)
      const common = [
        kind === 'advancing' ? index + 1 : (row.rank ?? ''),
        row.singer.name,
        row.singer.className ?? '',
        row.singer.song,
        dayLabelOf(entry?.contestDay ?? null),
        (entry && daySequence.get(entry.id)) || '',
        row.scoreCount,
        row.average === null ? '' : row.average.toFixed(2)
      ]
      rows.push(kind === 'advancing'
        ? [...common, pending ? '本轮未结束，按当前排名预排' : `第 ${row.rank ?? index + 1} 名`]
        : [...common, row.forfeited ? '弃权' : (row.qualified ? '晋级' : '')])
    })
  }

  const prefix = eventRow?.title || '新声歌手大赛'
  const filename = `${prefix}-${round.title}-${label}-${shanghaiDateKey(Date.now())}.csv`
  return { filename, csv: csvTable(rows) }
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
    singer: entrySingerPublic(entry, singer, round.key),
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
  entryId: string | null,
  sequential?: boolean
): void {
  const patch: { currentEntryId: string | null, updatedAt: number, sequentialMode?: number } = {
    currentEntryId: entryId,
    updatedAt: Date.now()
  }
  if (sequential !== undefined) patch.sequentialMode = sequential ? 1 : 0
  client.db.update(competitionRounds)
    .set(patch)
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
    setCurrentEntryId(client, round.id, null, false)
    return null
  }

  if (action === 'set') {
    const target = entries.find(entry => entry.id === entryId)
    if (!target) validationError('出场条目不存在', 'entryId')
    setCurrentEntryId(client, round.id, target!.id, true)
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
    setCurrentEntryId(client, round.id, target.id, true)
    return getCurrentSinger(client, { ...round, currentEntryId: target.id })
  }

  // 「开始」永远从当天第一位起，避免第一张评分已经自动开了头之后，再点开始时停在半路。
  if (action === 'start') {
    const target = entries[0]
    if (!target) validationError('本轮还没有出场名单', 'entries')
    setCurrentEntryId(client, round.id, target.id, true)
    return getCurrentSinger(client, { ...round, currentEntryId: target.id })
  }

  if (currentIndex < 0) {
    const target = entries[0]
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
  setCurrentEntryId(client, round.id, target ? target.id : null, true)
  return target ? getCurrentSinger(client, { ...round, currentEntryId: target.id }) : null
}

function roundView(
  client: DatabaseClient,
  round: RoundRow,
  singers: SingerRow[],
  eventRow: EventRow | null
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
  const rankedEntries = buildRoundRanking(round, entries, singersById, scoreRows, { trimExtremes: trimExtremesFor(client, round) }).map((entry) => {
    const board = queueBoard.get(entry.id)
    return {
      ...entry,
      queueState: board?.state ?? 'idle',
      ahead: board?.ahead ?? null,
      queuePosition: board?.position ?? null
    }
  })
  const duelPairs = round.key === 'final' && round.advanceMode === 'duel'
    ? buildDuelPairs(rankedEntries, duelOutcomes(entries, scoreRows, trimExtremesFor(client, round)))
    : []

  return {
    ...serializeRound(round, eventRow),
    entries: rankedEntries,
    judges: judges.map(judge => serializeJudge(judge, scoreCountByJudge.get(judge.id) ?? 0)),
    scores: scoreRows.map(score => serializeScore(score, judgeNameById.get(score.judgeId) ?? '评委')),
    maxTotal: competitionMaxTotal(getRoundDimensions(round, eventRow), getRoundDimensionMax(round)),
    hasScores: scoreRows.length > 0,
    sequential: round.sequentialMode === 1,
    current: buildCurrentSinger(client, round, presentEntries, singersById, scoreRows),
    duelPairs,
    revival: revivalState(client, round, eventRow)
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
/** 公开排行页：名次 + 姓名 + 歌曲 + 出场顺序 + 照片。只给公开字段，不含联系方式与评分明细。 */
export function getRankBoard(client: DatabaseClient, contentId: string, roundKey?: string): CompetitionRankBoard {
  const eventRow = ensureCompetitionEvent(client, contentId)
  const requested = roundKey === 'prelim' || roundKey === 'semi' || roundKey === 'final' || roundKey === 'final2'
    ? roundKey
    : 'semi'
  if (requested === 'final') {
    const merged = buildMergedFinalRankBoard(client, eventRow)
    if (merged) return merged
  }
  const round = getRoundByKey(client, eventRow.id, requested)
  const entries = entriesForDay(round, listRoundEntryRows(client, round.id))
  const singersById = new Map(listSingers(client, round.eventId).map(singer => [singer.id, singer]))
  const ranking = buildRoundRanking(round, entries, singersById, listRoundScores(client, round.id), {
    trimExtremes: trimExtremesFor(client, round)
  })

  const rows: CompetitionRankRow[] = ranking
    .slice()
    .sort((left, right) => {
      const rankLeft = left.rank ?? Number.MAX_SAFE_INTEGER
      const rankRight = right.rank ?? Number.MAX_SAFE_INTEGER
      if (rankLeft !== rankRight) return rankLeft - rankRight
      return left.sortOrder - right.sortOrder
    })
    .map((row, index) => ({
      entryId: row.id,
      rank: row.rank,
      position: index + 1,
      name: row.singer.name,
      song: (row.song ?? '').trim() || row.singer.song || '',
      className: row.singer.className ?? '',
      average: row.average,
      scoreCount: row.scoreCount,
      photoUrl: row.singer.photoUrl ?? null
    }))

  return {
    round: { key: round.key, title: round.title, status: round.status },
    maxTotal: competitionMaxTotal(getRoundDimensions(round, eventRow), getRoundDimensionMax(round)),
    rows,
    updatedAt: Date.now()
  }
}

/**
 * 决赛总榜：第一轮结束后，前六进第二轮按第二轮成绩排 1..6；
 * 其余选手按第一轮成绩排 7..N。第二轮结束前前六名次留空，只展示两轮曲目与当前均分。
 * 没有可合并的数据（还没确认前六、第二轮也没成绩）时返回 null，走原来的单轮榜。
 */
function buildMergedFinalRankBoard(client: DatabaseClient, eventRow: EventRow): CompetitionRankBoard | null {
  const finalRound = getRoundByKeySafe(client, eventRow.id, 'final')
  const final2Round = getRoundByKeySafe(client, eventRow.id, 'final2')
  if (!finalRound || !final2Round) return null
  const final2Entries = listRoundEntryRows(client, final2Round.id)
  // 第二轮名单还没生成时保持原来的决赛单轮榜；否则旧赛事的决赛总榜会被改成「前六待定」。
  if (final2Entries.length === 0) return null

  // 还没生成第二轮名单时，第二首歌仍然以选手提交的两首歌为准。
  const submittedSecondSongs = new Map(
    client.db.select().from(competitionFinalSongs)
      .where(and(
        eq(competitionFinalSongs.eventId, eventRow.id),
        eq(competitionFinalSongs.slot, 2)
      ))
      .all()
      .map(row => [row.singerId, (row.song ?? '').trim()])
  )

  const singersById = new Map(listSingers(client, eventRow.id).map(singer => [singer.id, singer]))
  const finalEntryRows = listRoundEntryRows(client, finalRound.id)
  const finalRanking = buildRoundRanking(
    finalRound,
    finalEntryRows,
    singersById,
    listRoundScores(client, finalRound.id),
    { trimExtremes: trimExtremesFor(client, finalRound) }
  )
  const final2Ranking = buildRoundRanking(
    final2Round,
    final2Entries,
    singersById,
    listRoundScores(client, final2Round.id),
    { trimExtremes: trimExtremesFor(client, final2Round) }
  )

  const finalBySinger = new Map(finalRanking.map(row => [row.singer.id, row]))
  const final2BySinger = new Map(final2Ranking.map(row => [row.singer.id, row]))

  // 第二轮名单以勾选进 final2 的人为准；还没生成名单时先按第一轮前六/勾选占位。
  let secondRoundRows = final2Ranking.slice()
  if (secondRoundRows.length === 0) {
    const picked = finalRanking.filter(row => row.advanced === 1)
    secondRoundRows = (picked.length > 0 ? picked : finalRanking.slice(0, COMPETITION_FINAL_ADVANCE_COUNT))
      .slice(0, COMPETITION_FINAL_ADVANCE_COUNT)
  }
  // 有成绩时按名次排；还没唱完时按当前实时名次、再按出场顺序。
  secondRoundRows.sort((left, right) => {
    const rankLeft = left.rank ?? Number.MAX_SAFE_INTEGER
    const rankRight = right.rank ?? Number.MAX_SAFE_INTEGER
    if (rankLeft !== rankRight) return rankLeft - rankRight
    return left.sortOrder - right.sortOrder
  })

  const secondIds = new Set(secondRoundRows.map(row => row.singer.id))
  const remainingRows = finalRanking
    .filter(row => !secondIds.has(row.singer.id))
    .sort((left, right) => {
      const rankLeft = left.rank ?? Number.MAX_SAFE_INTEGER
      const rankRight = right.rank ?? Number.MAX_SAFE_INTEGER
      if (rankLeft !== rankRight) return rankLeft - rankRight
      return left.sortOrder - right.sortOrder
    })

  const rows: CompetitionRankRow[] = []
  const settledSecond = final2Round.status === 'closed'
  secondRoundRows.forEach((row, index) => {
    const first = finalBySinger.get(row.singer.id)
    const second = final2BySinger.get(row.singer.id) ?? row
    const firstSong = (first?.song ?? '').trim()
    const secondSong = (second.song ?? '').trim() || (submittedSecondSongs.get(row.singer.id) ?? '')
    rows.push({
      entryId: second.id,
      rank: settledSecond ? index + 1 : null,
      position: index + 1,
      name: row.singer.name,
      song: secondSong || firstSong || row.singer.song || '',
      className: row.singer.className ?? '',
      average: second.average,
      scoreCount: second.scoreCount,
      photoUrl: row.singer.photoUrl ?? null,
      stage: 'final2',
      firstSong,
      secondSong: secondSong || null,
      averageFirst: first?.average ?? null,
      averageSecond: second.average
    })
  })
  remainingRows.forEach((row, index) => {
    const firstSong = (row.song ?? '').trim() || row.singer.song || ''
    rows.push({
      entryId: row.id,
      rank: secondRoundRows.length + index + 1,
      position: secondRoundRows.length + index + 1,
      name: row.singer.name,
      song: firstSong,
      className: row.singer.className ?? '',
      average: row.average,
      scoreCount: row.scoreCount,
      photoUrl: row.singer.photoUrl ?? null,
      stage: 'final1',
      firstSong,
      secondSong: null,
      averageFirst: row.average,
      averageSecond: null
    })
  })

  return {
    round: { key: 'final', title: '决赛', status: final2Round.status },
    maxTotal: competitionMaxTotal(getRoundDimensions(final2Round, eventRow), getRoundDimensionMax(final2Round)),
    rows,
    updatedAt: Date.now()
  }
}

/**
 * 叫号台/排队页该看哪一轮：优先「正在评分」的那一轮，取最靠后的；
 * 都结束了就取最近一个已有名单的轮次（初赛结束后复赛还没开始时也能用）。
 */
function currentCallRound(
  client: DatabaseClient,
  eventId: string,
  preferred?: CompetitionRoundKey | null
): RoundRow {
  const rounds: RoundRow[] = (['prelim', 'semi', 'final', 'final2'] as CompetitionRoundKey[])
    .map(key => getRoundByKey(client, eventId, key))
  if (preferred) return rounds.find(round => round.key === preferred) ?? rounds[0]!
  const open = rounds.filter(round => round.status === 'open')
  if (open.length > 0) return open[open.length - 1]!
  const withEntries = rounds.filter(round => countEntries(client, round.id) > 0)
  return withEntries[withEntries.length - 1] ?? rounds[0]!
}

export function getCallBoard(
  client: DatabaseClient,
  contentId: string,
  roundKey?: CompetitionRoundKey | null
): CompetitionCallBoard {
  const eventRow = ensureCompetitionEvent(client, contentId)
  const round = currentCallRound(client, eventRow.id, roundKey ?? null)
  const entries = presentEntriesForDay(round, listRoundEntryRows(client, round.id))
  const singersById = new Map(listSingers(client, round.eventId).map(singer => [singer.id, singer]))
  const board = buildQueueBoard(round, entries, listRoundScores(client, round.id), true)

  const rows: CompetitionCallBoardRow[] = []
  entries.forEach((entry, index) => {
    const singer = singersById.get(entry.singerId)
    if (!singer) return
    const seat = board.get(entry.id)
    rows.push({
      position: seat?.position ?? index + 1,
      name: singer.name,
      song: (entry.song ?? '').trim() || singer.song || '',
      className: singer.className ?? '',
      state: seat?.state ?? 'idle',
      ahead: seat?.ahead ?? null
    })
  })

  return {
    round: {
      key: round.key,
      title: round.title,
      status: round.status,
      activeDay: round.activeDay === 1 || round.activeDay === 2 ? round.activeDay : null
    },
    total: rows.length,
    current: rows.find(row => row.state === 'singing') ?? null,
    // 没开顺序评分时，「下一位」就是名单里第一个还没唱的人，叫号的人照样能用。
    next: rows.find(row => row.state === 'waiting' && row.ahead === 0)
      ?? rows.find(row => row.state === 'idle')
      ?? null,
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
  // 先看当前正在用的那一轮（初赛结束后就是复赛），找不到这位再回头找别的轮次。
  let round = currentCallRound(client, eventRow.id)
  let entries = listRoundEntryRows(client, round.id)
  let mine = entries.find(item => item.singerId === singerId)
  if (!mine) {
    for (const key of ['final2', 'final', 'semi', 'prelim'] as CompetitionRoundKey[]) {
      const candidate = getRoundByKey(client, eventRow.id, key)
      const hit = listRoundEntryRows(client, candidate.id).find(item => item.singerId === singerId)
      if (hit) {
        round = candidate
        entries = listRoundEntryRows(client, candidate.id)
        mine = hit
        break
      }
    }
  }
  const activeDay = round.activeDay === 1 || round.activeDay === 2 ? round.activeDay : null
  // 管理员已明确切到另一天时，前一天的旧浏览器缓存作废并按今天队列统计人数（避免继续显示昨天 44 人）。
  if (mine && activeDay !== null && mine.contestDay !== activeDay) {
    const todayEntries = entries.filter(item => item.contestDay === activeDay && item.checkedInAt != null)
    return { state: 'unknown', ahead: null, position: null, total: todayEntries.length }
  }
  // 同一天的排同一天的队：按这位选手自己登记的场次算，不按管理员此刻停在哪天。
  const day = mine?.contestDay ?? activeDay
  const dayEntries = (day ? entries.filter(item => item.contestDay === day) : entries)
    .filter(item => item.checkedInAt != null)
  if (!mine) {
    return { state: 'unknown', ahead: null, position: null, total: dayEntries.length }
  }
  if (mine.checkedInAt == null) {
    return { state: 'idle', ahead: null, position: null, total: dayEntries.length }
  }
  const board = buildQueueBoard(round, dayEntries, listRoundScores(client, round.id), true)
  const seat = board.get(mine.id)
  return {
    state: seat?.state ?? 'idle',
    ahead: seat?.ahead ?? null,
    position: seat?.position ?? null,
    total: dayEntries.length
  }
}

// -- 人气奖投票 ----------------------------------------------------------------

export interface CompetitionPopularitySettingsInput {
  enabled: boolean
  title: string
  subtitle: string
  opensAt: number | null
  closesAt: number | null
  allowChange: boolean
  maxChanges: number
  qrRotateSeconds: number
  showResults: boolean
  authMode?: CompetitionPopularityAuthMode
  wechatAccountName?: string
  wechatQrUrl?: string
  autoQuarantine?: boolean
  aiAutoModerate?: boolean
}

export type CompetitionPopularityAction = 'open' | 'close' | 'disable' | 'reset-votes' | 'rotate-display-key'

function popularityStatusOf(
  settings: PopularitySettingsRow,
  now = Date.now()
): CompetitionPopularityStatus {
  if (!settings.enabled) return 'disabled'
  if (settings.opensAt != null && now < Number(settings.opensAt)) return 'scheduled'
  if (settings.closesAt != null && now >= Number(settings.closesAt)) return 'closed'
  return 'open'
}

function popularitySettingsView(row: PopularitySettingsRow): CompetitionPopularitySettings {
  return {
    enabled: row.enabled,
    title: row.title,
    subtitle: row.subtitle,
    opensAt: row.opensAt == null ? null : Number(row.opensAt),
    closesAt: row.closesAt == null ? null : Number(row.closesAt),
    allowChange: row.allowChange,
    maxChanges: Number(row.maxChanges),
    qrRotateSeconds: Number(row.qrRotateSeconds),
    showResults: row.showResults,
    displayKey: row.displayKey,
    authMode: row.authMode === 'device_strict' ? 'device_strict' : 'wechat_mp',
    wechatAccountName: row.wechatAccountName || '仰恩大学指南',
    wechatQrUrl: row.wechatQrUrl || '',
    autoQuarantine: Boolean(row.autoQuarantine ?? true),
    aiAutoModerate: Boolean(row.aiAutoModerate ?? true),
    updatedAt: Number(row.updatedAt ?? 0)
  }
}

/** 一届赛事一份设置；第一次访问时补默认行，后台无需先点“创建”。 */
export function ensurePopularitySettings(
  client: DatabaseClient,
  eventId: string
): PopularitySettingsRow {
  const existing = client.db.select().from(competitionPopularitySettings)
    .where(eq(competitionPopularitySettings.eventId, eventId))
    .get()
  if (existing) return existing

  const now = Date.now()
  client.db.insert(competitionPopularitySettings).values({
    id: randomUUID(),
    eventId,
    enabled: false,
    title: '人气奖投票',
    subtitle: '现场扫码投票，一人一票',
    opensAt: null,
    closesAt: null,
    allowChange: false,
    maxChanges: 1,
    qrRotateSeconds: 30,
    showResults: false,
    displayKey: randomBytes(18).toString('base64url'),
    authMode: 'wechat_mp',
    wechatAccountName: '仰恩大学指南',
    wechatQrUrl: '',
    autoQuarantine: true,
    aiAutoModerate: true,
    displaySessionHash: null,
    createdAt: now,
    updatedAt: now
  }).run()

  return client.db.select().from(competitionPopularitySettings)
    .where(eq(competitionPopularitySettings.eventId, eventId))
    .get()!
}

/** 人气奖候选只取决赛第一轮名单；初赛/复赛选手不参与。 */
export function listPopularityCandidates(
  client: DatabaseClient,
  eventId: string
): CompetitionPopularityCandidate[] {
  const finalRound = getRoundByKeySafe(client, eventId, 'final')
  if (!finalRound) return []
  return client.db.select({
    singerId: competitionSingers.id,
    name: competitionSingers.name,
    className: competitionSingers.className,
    photoKey: competitionSingers.photoKey,
    entrySong: competitionRoundEntries.song,
    singerSong: competitionSingers.song,
    sortOrder: competitionRoundEntries.sortOrder
  }).from(competitionRoundEntries)
    .innerJoin(competitionSingers, eq(competitionRoundEntries.singerId, competitionSingers.id))
    .where(eq(competitionRoundEntries.roundId, finalRound.id))
    .orderBy(asc(competitionRoundEntries.sortOrder), asc(competitionSingers.name))
    .all()
    .map((row, index) => ({
      singerId: row.singerId,
      number: Number(row.sortOrder) > 0 ? Number(row.sortOrder) : index + 1,
      name: row.name,
      className: row.className,
      photoUrl: singerPhotoUrl({ photoKey: row.photoKey }),
      song: (row.entrySong ?? '').trim() || row.singerSong,
      sortOrder: Number(row.sortOrder)
    }))
}

function popularityBallotView(row: PopularityBallotRow): CompetitionPopularityBallot {
  return {
    singerId: row.singerId,
    changeCount: Number(row.changeCount),
    version: Number(row.version),
    updatedAt: Number(row.updatedAt ?? row.createdAt ?? 0)
  }
}

function popularityResultRows(
  candidates: CompetitionPopularityCandidate[],
  ballots: PopularityBallotRow[],
  totalVotes: number
): CompetitionPopularityResultRow[] {
  const countBySinger = new Map<string, number>()
  for (const ballot of ballots) {
    countBySinger.set(ballot.singerId, (countBySinger.get(ballot.singerId) ?? 0) + 1)
  }
  return candidates
    .map((candidate) => {
      const count = countBySinger.get(candidate.singerId) ?? 0
      return {
        singerId: candidate.singerId,
        name: candidate.name,
        count,
        percent: totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0
      }
    })
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'))
}

export function getPopularityAdminState(
  client: DatabaseClient,
  eventId: string
): CompetitionPopularityAdminState {
  const settings = ensurePopularitySettings(client, eventId)
  const candidates = listPopularityCandidates(client, eventId)
  const allBallots = client.db.select().from(competitionPopularityBallots)
    .where(eq(competitionPopularityBallots.eventId, eventId))
    .all()
  const nonVoidedBallots = allBallots.filter(ballot => Number(ballot.voided) === 0)
  const activeBallots = nonVoidedBallots.filter(ballot => Number(ballot.quarantined) === 0)
  const quarantinedVotes = nonVoidedBallots.length - activeBallots.length
  const voidedVotes = allBallots.length - nonVoidedBallots.length
  const totalVotes = activeBallots.length
  return {
    settings: popularitySettingsView(settings),
    candidates,
    totalVotes,
    results: popularityResultRows(candidates, activeBallots, totalVotes),
    riskVotes: nonVoidedBallots.filter(ballot => Number(ballot.risk) === 1 || Number(ballot.suspicionScore) >= 60).length,
    voidedVotes,
    quarantinedVotes,
    status: popularityStatusOf(settings),
    updatedAt: Number(settings.updatedAt ?? 0)
  }
}

export function getPopularityPublicState(
  client: DatabaseClient,
  eventId: string,
  deviceHash: string,
  options: { wechatVerified?: boolean, requiresWechatTicket?: boolean } = {}
): CompetitionPopularityPublicState {
  const settings = ensurePopularitySettings(client, eventId)
  const candidates = listPopularityCandidates(client, eventId)
  const allBallots = client.db.select().from(competitionPopularityBallots)
    .where(eq(competitionPopularityBallots.eventId, eventId))
    .all()
  const activeBallots = allBallots.filter(ballot => Number(ballot.voided) === 0 && Number(ballot.quarantined) === 0)
  const mine = deviceHash
    ? (allBallots.find(ballot => ballot.deviceHash === deviceHash || ballot.voterOpenidHash === deviceHash) ?? null)
    : null
  const mineActive = mine && Number(mine.voided) === 0 ? mine : null
  const status = popularityStatusOf(settings)
  const results = popularityResultRows(candidates, activeBallots, activeBallots.length)
  const countBySinger = new Map<string, number>()
  for (const ballot of activeBallots) {
    countBySinger.set(ballot.singerId, (countBySinger.get(ballot.singerId) ?? 0) + 1)
  }
  // 投票页按当前人气从高到低排；同票按出场号，保证顺序稳定。
  const rankedCandidates = [...candidates].sort((left, right) => (
    (countBySinger.get(right.singerId) ?? 0) - (countBySinger.get(left.singerId) ?? 0)
    || left.number - right.number
  ))
  const authMode = settings.authMode === 'device_strict' ? 'device_strict' : 'wechat_mp'
  const requiresWechatTicket = options.requiresWechatTicket ?? (authMode === 'wechat_mp' && !options.wechatVerified)
  const canChange = !requiresWechatTicket
    && status === 'open'
    && candidates.length > 0
    && (!mine || (Number(mine.voided) === 0 && settings.allowChange && Number(mine.changeCount) < Number(settings.maxChanges)))

  return {
    title: settings.title,
    subtitle: settings.subtitle,
    status,
    opensAt: settings.opensAt == null ? null : Number(settings.opensAt),
    closesAt: settings.closesAt == null ? null : Number(settings.closesAt),
    allowChange: settings.allowChange,
    maxChanges: Number(settings.maxChanges),
    qrRotateSeconds: Number(settings.qrRotateSeconds),
    showResults: settings.showResults,
    candidates: rankedCandidates,
    totalVotes: activeBallots.length,
    myBallot: mineActive ? popularityBallotView(mineActive) : null,
    canChange,
    authMode,
    wechatVerified: Boolean(options.wechatVerified),
    requiresWechatTicket,
    wechatAccountName: settings.wechatAccountName || '仰恩大学指南',
    wechatQrUrl: settings.wechatQrUrl || '',
    results: settings.showResults ? results : null,
    now: Date.now()
  }
}

export interface PopularityVoteTelemetry {
  uaSummary?: string | null
  envHash?: string | null
  dwellMs?: number | null
  cookiePresent?: boolean
  qrNonce?: string | null
  qrAgeMs?: number | null
  qrRotateSeconds?: number | null
  missingFetchMeta?: boolean
  voterOpenidHash?: string | null
  autoQuarantineOverride?: boolean
  now?: number
}

/**
 * 同 IP 多设备只做轻量标记，并在此基础上叠加多维实时可疑度评分（0–100）：
 * 涵盖同 IP 多设备、同硬件环境反复开无痕换身份、机器等距节拍规律提交、
 * 极短页面停留、无 Cookie 回传、缺少 Fetch 元数据、1 分钟同候选聚集爆发以及旧二维码滞后复投。
 */
const POPULARITY_IP_WINDOW_MS = 30 * 60 * 1000
const POPULARITY_IP_DEVICE_THRESHOLD = 5

function nextPopularityLogSeq(client: DatabaseClient, eventId: string): number {
  const row = client.sqlite.prepare(
    'SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM competition_popularity_vote_logs WHERE event_id = ?'
  ).get(eventId) as { maxSeq: number } | undefined
  return Number(row?.maxSeq ?? 0) + 1
}

function evaluateRealtimeBallotSuspicion(
  client: DatabaseClient,
  eventId: string,
  input: {
    singerId: string
    deviceHash: string
    ipHash: string | null
    action: 'cast' | 'change'
    telemetry?: PopularityVoteTelemetry
  }
): { risk: number, suspicionScore: number, suspicionReasons: string[] } {
  const now = input.telemetry?.now ?? Date.now()
  const since = now - POPULARITY_IP_WINDOW_MS
  const reasons: string[] = []
  let score = 0
  let risk = 0

  if (input.ipHash) {
    const ipRows = client.db.select({
      deviceHash: competitionPopularityBallots.deviceHash,
      singerId: competitionPopularityBallots.singerId
    })
      .from(competitionPopularityBallots)
      .where(and(
        eq(competitionPopularityBallots.eventId, eventId),
        eq(competitionPopularityBallots.ipHash, input.ipHash),
        gt(competitionPopularityBallots.createdAt, since)
      ))
      .all()
    const devices = new Set(ipRows.map(row => row.deviceHash))
    devices.add(input.deviceHash)
    if (devices.size >= POPULARITY_IP_DEVICE_THRESHOLD) {
      risk = 1
      score += 40
      reasons.push(`同IP30分钟第${devices.size}台设备`)
    } else if (devices.size >= 3) {
      score += 20
      reasons.push(`同IP30分钟${devices.size}台设备`)
    }

    const sameSingerDevices = new Set(
      ipRows.filter(row => row.singerId === input.singerId).map(row => row.deviceHash)
    )
    sameSingerDevices.add(input.deviceHash)
    if (sameSingerDevices.size >= 4) {
      score += 25
      reasons.push(`同IP集中投该选手(${sameSingerDevices.size}票)`)
    } else if (sameSingerDevices.size === 3) {
      score += 20
      reasons.push('同IP连投该选手(3票)')
    }

    // 机器等距节拍检测：同 IP 最近多票呈现低方差固定间隔（如脚本 per-ip-gap 10s 稳态）
    if (input.action === 'cast') {
      const recentCastRows = client.sqlite.prepare(
        `SELECT created_at AS createdAt FROM competition_popularity_vote_logs
         WHERE event_id = ? AND ip_hash = ? AND action = 'cast' AND created_at > ?
         ORDER BY created_at DESC LIMIT 5`
      ).all(eventId, input.ipHash, since) as Array<{ createdAt: number }>
      const times = [...recentCastRows.map(r => Number(r.createdAt)).reverse(), now]
      if (times.length >= 4) {
        const gaps: number[] = []
        for (let i = 1; i < times.length; i += 1) {
          const gap = times[i]! - times[i - 1]!
          if (gap > 0 && gap <= 120_000) gaps.push(gap)
        }
        if (gaps.length >= 3) {
          const mean = gaps.reduce((sum, v) => sum + v, 0) / gaps.length
          if (mean >= 1500 && mean <= 30_000) {
            const variance = gaps.reduce((sum, v) => sum + (v - mean) ** 2, 0) / gaps.length
            const cv = Math.sqrt(variance) / mean
            if (cv < 0.18) {
              score += 40
              reasons.push(`等距节拍规律提交(${Math.round(mean / 1000)}s间隔)`)
            }
          }
        }
      }
    }
  }

  const envHash = input.telemetry?.envHash ?? null
  if (envHash) {
    const envRows = client.db.select({ deviceHash: competitionPopularityBallots.deviceHash })
      .from(competitionPopularityBallots)
      .where(and(
        eq(competitionPopularityBallots.eventId, eventId),
        eq(competitionPopularityBallots.envHash, envHash)
      ))
      .all()
    const envDevices = new Set(envRows.map(row => row.deviceHash))
    envDevices.add(input.deviceHash)
    if (envDevices.size >= 3) {
      score += 40
      reasons.push(`同设备环境第${envDevices.size}次切换身份`)
    } else if (envDevices.size === 2) {
      score += 20
      reasons.push('同设备环境重复投票')
    }
  }

  const dwellMs = input.telemetry?.dwellMs
  if (typeof dwellMs === 'number' && Number.isFinite(dwellMs)) {
    if (dwellMs < 1200) {
      score += 25
      reasons.push(`极快投票(${Math.round(dwellMs)}ms)`)
    } else if (dwellMs < 2500) {
      score += 12
      reasons.push(`快速投票(${Math.round(dwellMs)}ms)`)
    }
  }

  if (input.telemetry?.cookiePresent === false) {
    score += 15
    reasons.push('无历史Cookie回传')
  }

  if (input.telemetry?.missingFetchMeta) {
    score += 20
    reasons.push('请求头缺少浏览器Fetch元数据')
  }

  const qrAgeMs = input.telemetry?.qrAgeMs
  const rotateSeconds = input.telemetry?.qrRotateSeconds
  if (typeof qrAgeMs === 'number' && typeof rotateSeconds === 'number' && rotateSeconds > 0) {
    if (qrAgeMs > rotateSeconds * 1000 * 1.8) {
      score += 15
      reasons.push('旧二维码窗口尾端滞后提交')
    }
  }

  const burstSince = now - 60_000
  const burstRow = client.sqlite.prepare(
    `SELECT count(*) AS cnt FROM competition_popularity_vote_logs
     WHERE event_id = ? AND singer_id = ? AND action IN ('cast', 'change') AND created_at > ?`
  ).get(eventId, input.singerId, burstSince) as { cnt: number } | undefined
  if (Number(burstRow?.cnt ?? 0) >= 8) {
    score += 20
    reasons.push(`1分钟同选手爆发(${Number(burstRow?.cnt ?? 0) + 1}票)`)
  }

  if (input.action === 'change') {
    score += 5
    reasons.push('改票操作')
  }

  if (input.telemetry?.voterOpenidHash) {
    score = Math.max(0, score - 20)
  }

  return {
    risk,
    suspicionScore: Math.min(100, score),
    suspicionReasons: reasons
  }
}

/** 投票/改票：窗口、候选、改票次数与 revision 全部在服务端判定。 */
export function recordPopularityBallot(
  client: DatabaseClient,
  eventId: string,
  deviceHash: string,
  singerId: string,
  revision?: number,
  ipHash?: string | null,
  telemetry?: PopularityVoteTelemetry
): CompetitionPopularityPublicState {
  const settings = ensurePopularitySettings(client, eventId)
  const status = popularityStatusOf(settings)
  if (status === 'closed') conflictError('POPULARITY_CLOSED', '投票已经截止')
  if (status !== 'open') conflictError('POPULARITY_NOT_OPEN', '投票还没开始')

  const candidate = listPopularityCandidates(client, eventId).find(item => item.singerId === singerId)
  if (!candidate) conflictError('POPULARITY_CANDIDATE_INVALID', '这位选手不在人气奖候选名单里')

  const normalizedOpenIdHash = telemetry?.voterOpenidHash?.trim() || null
  const existing = normalizedOpenIdHash
    ? client.db.select().from(competitionPopularityBallots)
        .where(and(
          eq(competitionPopularityBallots.eventId, eventId),
          or(
            eq(competitionPopularityBallots.voterOpenidHash, normalizedOpenIdHash),
            eq(competitionPopularityBallots.deviceHash, deviceHash)
          )
        ))
        .get()
    : client.db.select().from(competitionPopularityBallots)
        .where(and(
          eq(competitionPopularityBallots.eventId, eventId),
          eq(competitionPopularityBallots.deviceHash, deviceHash)
        ))
        .get()

  const wechatVerified = Boolean(normalizedOpenIdHash || existing?.voterOpenidHash)
  const authMode = settings.authMode === 'device_strict' ? 'device_strict' : 'wechat_mp'
  const stateOptions = {
    wechatVerified,
    requiresWechatTicket: authMode === 'wechat_mp' && !wechatVerified
  }

  if (existing && Number(existing.voided) === 1) {
    conflictError('POPULARITY_BALLOT_VOIDED', '当前选票已被风控作废，无法更改')
  }

  if (existing && existing.singerId === singerId) {
    return getPopularityPublicState(client, eventId, existing.deviceHash, stateOptions)
  }

  const normalizedIpHash = ipHash ?? null
  const uaSummary = (telemetry?.uaSummary || 'unknown').slice(0, 64)
  const envHash = telemetry?.envHash ?? null
  const dwellMs = typeof telemetry?.dwellMs === 'number' && Number.isFinite(telemetry.dwellMs)
    ? Math.max(0, Math.round(telemetry.dwellMs))
    : null
  const cookiePresent = telemetry?.cookiePresent ? 1 : 0
  const qrNonce = telemetry?.qrNonce ? telemetry.qrNonce.slice(0, 24) : null
  const autoQuarantine = telemetry?.autoQuarantineOverride ?? Boolean(settings.autoQuarantine ?? true)
  const quarantineThreshold = normalizedOpenIdHash ? 80 : 60

  if (!existing) {
    if (revision != null && revision !== 0) {
      conflictError('POPULARITY_CONFLICT', '投票状态已经变化，请刷新页面后重试')
    }
    const evalResult = evaluateRealtimeBallotSuspicion(client, eventId, {
      singerId,
      deviceHash,
      ipHash: normalizedIpHash,
      action: 'cast',
      telemetry
    })
    const quarantined = autoQuarantine && evalResult.suspicionScore >= quarantineThreshold ? 1 : 0
    const quarantinedReason = quarantined
      ? `高危特征自动冻结(${evalResult.suspicionScore}分)`
      : null
    const reasonsJson = JSON.stringify(evalResult.suspicionReasons)
    const now = telemetry?.now ?? Date.now()
    const ballotId = randomUUID()
    const inserted = client.sqlite.transaction(() => {
      const result = client.db.insert(competitionPopularityBallots).values({
        id: ballotId,
        eventId,
        singerId,
        deviceHash,
        voterOpenidHash: normalizedOpenIdHash,
        ipHash: normalizedIpHash,
        risk: evalResult.risk,
        quarantined,
        quarantinedReason,
        voided: 0,
        suspicionScore: evalResult.suspicionScore,
        suspicionReasonsJson: reasonsJson,
        uaSummary,
        envHash,
        dwellMs,
        changeCount: 0,
        version: 1,
        createdAt: now,
        updatedAt: now
      }).onConflictDoNothing().run()
      if (result.changes === 0) return false
      const seq = nextPopularityLogSeq(client, eventId)
      client.db.insert(competitionPopularityVoteLogs).values({
        id: randomUUID(),
        eventId,
        seq,
        ballotId,
        singerId,
        prevSingerId: null,
        action: 'cast',
        blockCode: null,
        deviceHash,
        ipHash: normalizedIpHash,
        envHash,
        qrNonce,
        uaSummary,
        cookiePresent,
        dwellMs,
        suspicionScore: evalResult.suspicionScore,
        suspicionReasonsJson: reasonsJson,
        createdAt: now
      }).run()
      if (quarantined === 1 && normalizedIpHash && !normalizedOpenIdHash) {
        client.sqlite.prepare(
          `UPDATE competition_popularity_ballots
           SET quarantined = 1,
               quarantined_reason = COALESCE(quarantined_reason, '同IP聚集簇回溯连坐冻结'),
               updated_at = ?
           WHERE event_id = ? AND ip_hash = ? AND singer_id = ?
             AND voter_openid_hash IS NULL
             AND voided = 0 AND quarantined = 0
             AND COALESCE(voided_by, '') != 'admin-restored'
             AND created_at > ?`
        ).run(now, eventId, normalizedIpHash, singerId, now - POPULARITY_IP_WINDOW_MS)
      }
      return true
    })()

    if (!inserted) {
      const raced = normalizedOpenIdHash
        ? client.db.select().from(competitionPopularityBallots)
            .where(and(
              eq(competitionPopularityBallots.eventId, eventId),
              or(
                eq(competitionPopularityBallots.voterOpenidHash, normalizedOpenIdHash),
                eq(competitionPopularityBallots.deviceHash, deviceHash)
              )
            ))
            .get()
        : client.db.select().from(competitionPopularityBallots)
            .where(and(
              eq(competitionPopularityBallots.eventId, eventId),
              eq(competitionPopularityBallots.deviceHash, deviceHash)
            ))
            .get()
      if (raced?.singerId === singerId) return getPopularityPublicState(client, eventId, raced.deviceHash, stateOptions)
      conflictError('POPULARITY_CONFLICT', '投票状态已经变化，请刷新页面后重试')
    }
    return getPopularityPublicState(client, eventId, deviceHash, stateOptions)
  }

  if (!settings.allowChange || Number(existing.changeCount) >= Number(settings.maxChanges)) {
    conflictError('POPULARITY_CHANGE_LIMIT', '这台设备已经投过票，不能继续改票')
  }
  if (revision != null && revision !== Number(existing.version)) {
    conflictError('POPULARITY_CONFLICT', '投票状态已经变化，请刷新页面后重试')
  }

  const evalResult = evaluateRealtimeBallotSuspicion(client, eventId, {
    singerId,
    deviceHash: existing.deviceHash,
    ipHash: normalizedIpHash ?? existing.ipHash,
    action: 'change',
    telemetry
  })
  const mergedScore = Math.max(Number(existing.suspicionScore ?? 0), evalResult.suspicionScore)
  const mergedReasons = (() => {
    try {
      const prev = JSON.parse(existing.suspicionReasonsJson || '[]') as string[]
      return Array.from(new Set([...(Array.isArray(prev) ? prev : []), ...evalResult.suspicionReasons])).slice(0, 8)
    } catch {
      return evalResult.suspicionReasons
    }
  })()
  const reasonsJson = JSON.stringify(mergedReasons)
  const now = telemetry?.now ?? Date.now()
  const shouldQuarantine = Number(existing.quarantined) === 1
    || (
      autoQuarantine
      && existing.voidedBy !== 'admin-restored'
      && evalResult.suspicionScore >= quarantineThreshold
    )
  const nextQuarantined = shouldQuarantine ? 1 : 0
  const nextQuarantinedReason = nextQuarantined
    ? (existing.quarantinedReason || `高危特征自动冻结(${evalResult.suspicionScore}分)`)
    : null

  const updated = client.sqlite.transaction(() => {
    const result = client.db.update(competitionPopularityBallots).set({
      singerId,
      voterOpenidHash: existing.voterOpenidHash ?? normalizedOpenIdHash,
      ipHash: normalizedIpHash ?? existing.ipHash,
      risk: Math.max(Number(existing.risk), evalResult.risk),
      quarantined: nextQuarantined,
      quarantinedReason: nextQuarantinedReason,
      suspicionScore: mergedScore,
      suspicionReasonsJson: reasonsJson,
      uaSummary,
      envHash: envHash ?? existing.envHash,
      dwellMs: dwellMs ?? existing.dwellMs,
      changeCount: Number(existing.changeCount) + 1,
      version: Number(existing.version) + 1,
      updatedAt: now
    }).where(and(
      eq(competitionPopularityBallots.id, existing.id),
      eq(competitionPopularityBallots.version, existing.version)
    )).run()
    if (result.changes === 0) return false

    const seq = nextPopularityLogSeq(client, eventId)
    client.db.insert(competitionPopularityVoteLogs).values({
      id: randomUUID(),
      eventId,
      seq,
      ballotId: existing.id,
      singerId,
      prevSingerId: existing.singerId,
      action: 'change',
      blockCode: null,
      deviceHash: existing.deviceHash,
      ipHash: normalizedIpHash ?? existing.ipHash,
      envHash: envHash ?? existing.envHash,
      qrNonce,
      uaSummary,
      cookiePresent,
      dwellMs,
      suspicionScore: evalResult.suspicionScore,
      suspicionReasonsJson: JSON.stringify(evalResult.suspicionReasons),
      createdAt: now
    }).run()
    return true
  })()

  if (!updated) {
    conflictError('POPULARITY_CONFLICT', '投票状态已经变化，请刷新页面后重试')
  }

  return getPopularityPublicState(client, eventId, existing.deviceHash, stateOptions)
}

export function updatePopularitySettings(
  client: DatabaseClient,
  eventId: string,
  input: CompetitionPopularitySettingsInput
): CompetitionPopularityAdminState {
  if (input.opensAt != null && input.closesAt != null && input.opensAt >= input.closesAt) {
    validationError('开始时间必须早于截止时间', 'opensAt')
  }
  const existing = ensurePopularitySettings(client, eventId)
  client.db.update(competitionPopularitySettings).set({
    enabled: input.enabled,
    title: input.title.trim(),
    subtitle: input.subtitle.trim(),
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    allowChange: input.allowChange,
    maxChanges: input.maxChanges,
    qrRotateSeconds: input.qrRotateSeconds,
    showResults: input.showResults,
    authMode: input.authMode ?? existing.authMode,
    wechatAccountName: input.wechatAccountName !== undefined
      ? (input.wechatAccountName.trim() || '仰恩大学指南')
      : existing.wechatAccountName,
    wechatQrUrl: input.wechatQrUrl !== undefined
      ? input.wechatQrUrl.trim()
      : existing.wechatQrUrl,
    autoQuarantine: input.autoQuarantine ?? existing.autoQuarantine,
    aiAutoModerate: input.aiAutoModerate ?? existing.aiAutoModerate,
    updatedAt: Date.now()
  }).where(eq(competitionPopularitySettings.eventId, eventId)).run()
  return getPopularityAdminState(client, eventId)
}

export function applyPopularityAction(
  client: DatabaseClient,
  eventId: string,
  action: CompetitionPopularityAction
): CompetitionPopularityAdminState {
  const settings = ensurePopularitySettings(client, eventId)
  const now = Date.now()
  if (action === 'open') {
    client.db.update(competitionPopularitySettings).set({
      enabled: true,
      opensAt: now,
      closesAt: null,
      updatedAt: now
    }).where(eq(competitionPopularitySettings.id, settings.id)).run()
  } else if (action === 'close') {
    client.db.update(competitionPopularitySettings).set({
      enabled: true,
      closesAt: now,
      updatedAt: now
    }).where(eq(competitionPopularitySettings.id, settings.id)).run()
  } else if (action === 'disable') {
    client.db.update(competitionPopularitySettings).set({
      enabled: false,
      updatedAt: now
    }).where(eq(competitionPopularitySettings.id, settings.id)).run()
  } else if (action === 'reset-votes') {
    client.sqlite.transaction(() => {
      client.db.delete(competitionPopularityInspections)
        .where(eq(competitionPopularityInspections.eventId, eventId))
        .run()
      client.db.delete(competitionPopularityVoteLogs)
        .where(eq(competitionPopularityVoteLogs.eventId, eventId))
        .run()
      client.db.delete(competitionPopularityBallots)
        .where(eq(competitionPopularityBallots.eventId, eventId))
        .run()
    })()
  } else {
    client.db.update(competitionPopularitySettings).set({
      displayKey: randomBytes(18).toString('base64url'),
      displaySessionHash: null,
      updatedAt: now
    }).where(eq(competitionPopularitySettings.id, settings.id)).run()
  }
  return getPopularityAdminState(client, eventId)
}

export function updatePopularityDisplaySessionHash(
  client: DatabaseClient,
  eventId: string,
  sessionHash: string
): void {
  const settings = ensurePopularitySettings(client, eventId)
  client.db.update(competitionPopularitySettings).set({
    displaySessionHash: sessionHash,
    updatedAt: Date.now()
  }).where(eq(competitionPopularitySettings.id, settings.id)).run()
}

export function getPopularityDisplayKey(
  client: DatabaseClient,
  eventId: string
): string {
  return ensurePopularitySettings(client, eventId).displayKey
}

export function getPopularitySettings(
  client: DatabaseClient,
  eventId: string
): CompetitionPopularitySettings {
  return popularitySettingsView(ensurePopularitySettings(client, eventId))
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
  const singers = listSingers(client, eventRow.id)
  const rounds = listRounds(client, eventRow.id)
  const finalSongs = readFinalSongsForEvent(client, eventRow.id)

  const advance: Record<string, CompetitionAdvanceRow[]> = {}
  const receipts: Record<string, CompetitionReceiptRow[]> = {}
  for (const round of rounds) {
    advance[round.key] = round.status === 'closed' ? listAdvanceRows(client, round) : []
    if (round.key !== 'final2') receipts[round.key] = listReceipts(client, eventRow.id, round.key)
  }

  return {
    event: serializeCompetitionEvent(eventRow, club),
    singers: singers.map(serializeSinger),
    rounds: rounds.map((round) => {
      const view = roundView(client, round, singers, eventRow)
      if (round.key === 'final') {
        view.entries = view.entries.map(entry => ({
          ...entry,
          finalSongs: finalSongs.get(entry.singer.id) ?? null
        }))
      }
      return view
    }),
    email: listEmailState(client, eventRow.id),
    preRegistrations: listPreRegistrations(client, eventRow.id),
    advance,
    receipts,
    editions: listEditions(client, contentId),
    popularity: getPopularityAdminState(client, eventRow.id)
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

/** 决赛抽签：随机决定每组两人与整轮出场顺序；每两人一组。 */
export function drawFinalPairs(client: DatabaseClient, round: RoundRow): void {
  if (round.key !== 'final') validationError('只有决赛可以抽签 1v1', 'round')
  if (round.advanceMode !== 'duel') validationError('当前不是抽签 1v1 赛制，请先切换晋级方式', 'advanceMode')
  if (round.status === 'closed') conflictError('ROUND_CLOSED', '本轮已结束，不能重新抽签')
  if (countRoundScores(client, round.id) > 0) {
    conflictError('ROUND_HAS_SCORES', '本轮已有评分，不能再抽签')
  }
  if (round.rosterConfirmedAt !== null) {
    conflictError('ROUND_ROSTER_CONFIRMED', '晋级名单已确认，不能重新抽签')
  }
  const entries = listRoundEntryRows(client, round.id)
  if (entries.length < 2) validationError('本轮名单不足 2 人，不能抽签', 'round')
  const shuffled = shuffle(entries)
  client.db.transaction((transaction) => {
    transaction.update(competitionRoundEntries)
      .set({ pairNo: null, pairSlot: null, advanced: null })
      .where(eq(competitionRoundEntries.roundId, round.id)).run()
    shuffled.forEach((entry, index) => {
      transaction.update(competitionRoundEntries)
        .set({
          pairNo: Math.floor(index / 2) + 1,
          pairSlot: (index % 2) + 1,
          sortOrder: index + 1
        })
        .where(eq(competitionRoundEntries.id, entry.id)).run()
    })
    transaction.update(competitionRounds)
      .set({ currentEntryId: null, updatedAt: Date.now() })
      .where(eq(competitionRounds.id, round.id)).run()
  })
}

export function clearFinalPairs(client: DatabaseClient, round: RoundRow): void {
  if (round.key !== 'final') validationError('只有决赛可以清除对阵', 'round')
  if (round.advanceMode !== 'duel') validationError('当前不是抽签 1v1 赛制', 'advanceMode')
  if (round.status === 'closed') conflictError('ROUND_CLOSED', '本轮已结束，不能清除对阵')
  if (countRoundScores(client, round.id) > 0) {
    conflictError('ROUND_HAS_SCORES', '本轮已有评分，不能清除对阵')
  }
  if (round.rosterConfirmedAt !== null) {
    conflictError('ROUND_ROSTER_CONFIRMED', '晋级名单已确认，不能清除对阵')
  }
  client.db.transaction((transaction) => {
    transaction.update(competitionRoundEntries)
      .set({ pairNo: null, pairSlot: null, advanced: null })
      .where(eq(competitionRoundEntries.roundId, round.id)).run()
    transaction.update(competitionRounds)
      .set({ currentEntryId: null, updatedAt: Date.now() })
      .where(eq(competitionRounds.id, round.id)).run()
  })
}

export function redrawRound(client: DatabaseClient, round: RoundRow): void {
  if (round.key === 'prelim') validationError('初赛按导入顺序出场，不能重新抽签', 'round')
  if (round.key === 'final' && round.advanceMode === 'duel') {
    drawFinalPairs(client, round)
    return
  }
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
/** 后台给某一轮的某位选手改曲目：只动这一轮的条目，其它轮不受影响。 */
/** 歌名比对用：去掉书名号、括号、空白与大小写差异，「《晴天》」与「晴天(伴奏)」视为同一首。 */
export function songCompareKey(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[《》〈〉"'"'「」]/g, '')
    .replace(/[（([【][^）)】\]]{0,12}[）)】\]]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/**
 * 同一个选手三场比赛不能唱同一首：查这个人其它轮次里已经记下的曲目。
 * 复赛/决赛还算上选手库里的当前曲目（报名时填的那首通常只在 singers 里）。
 */
export function assertSongNotRepeated(
  client: DatabaseClient,
  eventId: string,
  singerId: string,
  song: string,
  exceptRoundId?: string
): void {
  const key = songCompareKey(song)
  if (!key) return
  const rows = client.db.select({
    key: competitionRounds.key,
    roundId: competitionRounds.id,
    entrySong: competitionRoundEntries.song
  })
    .from(competitionRoundEntries)
    .innerJoin(competitionRounds, eq(competitionRounds.id, competitionRoundEntries.roundId))
    .where(and(
      eq(competitionRoundEntries.singerId, singerId),
      eq(competitionRounds.eventId, eventId)
    ))
    .all()
  for (const row of rows) {
    if (row.roundId === exceptRoundId) continue
    if (row.entrySong && songCompareKey(row.entrySong) === key) {
      const label = row.key === 'prelim' ? '初赛' : row.key === 'semi' ? '复赛' : '决赛'
      conflictError('SONG_REPEATED', `这首歌你在${label}已经唱过了，换一首`)
    }
  }
  // 初赛曲目由 confirmAdvanceRoster 落进 prelim 条目，所以这里只比对条目就够；
  // 不再读 singers.song（那是「最近一次填的歌」，会和当前轮自己撞上）。
}

export function setEntrySong(
  client: DatabaseClient,
  round: RoundRow,
  entryId: string,
  song: string
): void {
  if (round.status === 'closed') {
    conflictError('ROUND_CLOSED', '本轮已经结束，曲目不能再改')
  }
  const entry = client.db.select().from(competitionRoundEntries)
    .where(and(eq(competitionRoundEntries.id, entryId), eq(competitionRoundEntries.roundId, round.id)))
    .get()
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'Entry not found', data: { code: 'ENTRY_NOT_FOUND', message: '这条出场记录不存在' } })
  }
  const entrySinger = client.db.select().from(competitionSingers)
    .where(eq(competitionSingers.id, entry.singerId)).get()
  const value = cleanSongTitle(song, entrySinger?.name ?? '')
  if (!value) validationError('曲目必填', 'song')
  if (COMPETITION_SONG_PLACEHOLDERS.has(value.replace(/\s+/g, '').toLowerCase())) {
    validationError('曲目要填具体歌名，不能填「待定」', 'song')
  }
  assertSongNotRepeated(client, round.eventId, entry.singerId, value, round.id)
  if (value.length > 100) validationError('歌名太长，控制在 100 字以内', 'song')
  client.db.update(competitionRoundEntries).set({ song: value })
    .where(eq(competitionRoundEntries.id, entryId)).run()
}

/**
 * 清空本轮所有评委评分，并把「正在唱」的指针收回（签到状态不动）。
 * 已经确认过晋级名单、或下一轮名单已生成时不允许清——否则名次全变，下游名单还是旧的。
 */
export function clearRoundScores(client: DatabaseClient, round: RoundRow): { cleared: number } {
  if (round.rosterConfirmedAt !== null) {
    conflictError('ROSTER_CONFIRMED', '本轮已经确认过晋级名单，先点「重新打开」再清分')
  }
  const nextRound = nextRoundOf(client, round)
  if (nextRound && listRoundEntryRows(client, nextRound.id).length > 0) {
    conflictError('NEXT_ROUND_ROSTER_EXISTS', '下一轮名单已经生成了，先清空下一轮名单再清分')
  }
  const rows = client.db.select().from(competitionScores)
    .where(eq(competitionScores.roundId, round.id))
    .all()
  client.db.transaction((transaction) => {
    transaction.delete(competitionScores).where(eq(competitionScores.roundId, round.id)).run()
    transaction.update(competitionRoundEntries).set({ advanced: null })
      .where(eq(competitionRoundEntries.roundId, round.id)).run()
  })
  setCurrentEntryId(client, round.id, null, false)
  return { cleared: rows.length }
}

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

/**
 * 批量写出场顺序。现场是手写号再一次性排：号必须两两不同，
 * 没给号的按原顺序接在最大号后面，避免留空档。
 */
export function applyEntrySortOrders(
  client: DatabaseClient,
  round: RoundRow,
  orders: { entryId: string, sortOrder: number }[]
): void {
  if (round.status === 'closed') conflictError('ROUND_CLOSED', '本轮已结束，出场顺序已锁定')
  const entries = listRoundEntryRows(client, round.id)
  // 分天（初赛）时每一天自己从 1 开始编号，不能拿两天合起来的 79 人去卡 1-79。
  const sameDay = (entry: { contestDay: number | null }) => !round.activeDay || entry.contestDay === round.activeDay
  const scoped = entries.filter(sameDay)
  const limit = Math.max(1, scoped.length)
  const byId = new Map(scoped.map(entry => [entry.id, entry]))
  const assigned = new Map<string, number>()
  const used = new Set<number>()
  for (const item of orders) {
    if (!byId.has(item.entryId)) validationError('出场条目不存在', 'entryId')
    const value = Number(item.sortOrder)
    if (!Number.isInteger(value) || value < 1 || value > limit) {
      validationError(`出场顺序只能填 1-${limit}（本轮共 ${limit} 人）`, 'sortOrder')
    }
    if (used.has(value)) conflictError('SORT_ORDER_DUPLICATED', `出场顺序 ${value} 重复了，改一下再排`)
    used.add(value)
    assigned.set(item.entryId, value)
  }

  let next = assigned.size ? Math.max(...assigned.values()) + 1 : 1
  for (const entry of [...scoped].sort((left, right) => left.sortOrder - right.sortOrder)) {
    if (assigned.has(entry.id)) continue
    while (used.has(next)) next += 1
    assigned.set(entry.id, next)
    used.add(next)
    next += 1
  }

  // 现场规则：只有「人手动填了号」的那几个算到场签到；自动续号的不算签到。
  const checkedInAt = Date.now()
  const explicitIds = orders.map(item => item.entryId)
  for (const entryId of explicitIds) {
    client.db.update(competitionRoundEntries).set({ checkedInAt })
      .where(eq(competitionRoundEntries.id, entryId)).run()
  }

  // 先整体挪到负数区间，避免中途撞上已有号码
  client.db.transaction(() => {
    for (const entry of entries) {
      client.db.update(competitionRoundEntries).set({ sortOrder: -Number(entry.sortOrder || 1) - 1000 })
        .where(eq(competitionRoundEntries.id, entry.id)).run()
    }
    for (const [entryId, sortOrder] of assigned) {
      client.db.update(competitionRoundEntries).set({ sortOrder })
        .where(eq(competitionRoundEntries.id, entryId)).run()
    }
  })
}

/**
 * 选手自己抽签后扫码登记号数：按三要素定位到本轮的条目，写入出场顺序。
 * 号已经被别人占了就让他重新抽，不覆盖别人。
 */
export function registerDrawNumber(
  client: DatabaseClient,
  contentId: string,
  input: { name: string, studentNo: string, contact: string },
  sortOrder: number
): { position: number, singerName: string, roundTitle: string, checkedInAt: number } {
  const { singer, eventRow } = singerByThreeFactors(client, contentId, input)
  const rounds = [getRoundByKey(client, eventRow.id, 'prelim'), getRoundByKey(client, eventRow.id, 'semi'), getRoundByKey(client, eventRow.id, 'final'), getRoundByKey(client, eventRow.id, 'final2')]
  let target: RoundRow | null = null
  let entry: EntryRow | null = null
  for (const round of [...rounds].reverse()) {
    const hit = listRoundEntryRows(client, round.id).find(row => row.singerId === singer.id)
    if (hit) {
      target = round
      entry = hit
      break
    }
  }
  if (!target || !entry) conflictError('COMPETITION_LOOKUP_NOT_FOUND', '还没给你排出场名单，先找现场工作人员')
  if (target.status === 'closed') conflictError('ROUND_CLOSED', '这一轮已经结束了，改不了号')

  const allEntries = listRoundEntryRows(client, target.id)
  const roundEntries = target.activeDay
    ? allEntries.filter(row => row.contestDay === target.activeDay)
    : allEntries
  const limit = Math.max(1, roundEntries.length)
  const value = Number(sortOrder)
  if (!Number.isInteger(value) || value < 1 || value > limit) {
    validationError(`号只能填 1-${limit}（这一轮共 ${limit} 人）`, 'sortOrder')
  }
  const taken = roundEntries.find(row => row.id !== entry.id && row.sortOrder === value)
  if (taken) {
    const owner = listSingers(client, eventRow.id).find(item => item.id === taken.singerId)
    conflictError('SORT_ORDER_TAKEN', `这个号被 ${owner?.name ?? '别人'} 先登记了，换一个再填`)
  }
  // 现场规则：填出场顺序就算签到——评委名单只认已签到的人。
  client.db.update(competitionRoundEntries)
    .set({ sortOrder: value, checkedInAt: entry.checkedInAt ?? Date.now() })
    .where(eq(competitionRoundEntries.id, entry.id)).run()
  return {
    position: value,
    singerName: singer.name,
    roundTitle: target.title,
    checkedInAt: entry.checkedInAt ?? Date.now()
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
  qq?: unknown
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
  qq: string | null
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
  const qqRaw = String(input.qq ?? '').trim() || qqFromEmail(emailRaw)
  if (qqRaw.length > 20) validationError('QQ 不超过 20 字', 'qq')
  if (qqRaw && !/^[0-9]{5,12}$/.test(qqRaw)) validationError('QQ 填数字，5-12 位', 'qq')

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
    qq: qqRaw || null,
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
  checkedInAt?: number | null,
  song?: string | null
): void {
  const prelim = getRoundByKey(client, eventId, 'prelim')
  client.db.insert(competitionRoundEntries).values({
    id: randomUUID(),
    roundId: prelim.id,
    singerId,
    // 三轮曲目各自独立：初赛这条只写初赛报名时填的歌
    song: (song ?? '').trim() || null,
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
      qq: normalized.qq,
      source: 'admin',
      sortOrder,
      createdAt: now,
      updatedAt: now
    }).run()
  })
  addPrelimEntry(client, eventId, id, sortOrder, null, null, normalized.song)

  const row = client.db.select().from(competitionSingers)
    .where(eq(competitionSingers.id, id)).get()!
  return serializeSinger(row)
}

/** QQ 邮箱就是「QQ 号@qq.com」：邮箱去掉后缀就是 QQ 号。 */
export function qqFromEmail(email: string | null | undefined): string {
  const match = /^\s*([0-9]{5,12})@qq\.com\s*$/i.exec(String(email ?? ''))
  return match ? match[1]! : ''
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
  // 没传的字段保持原值：编辑页只改名字时不能把学号、QQ、邮箱一起清掉。
  const normalized = normalizeSingerInput({
    name: input.name ?? current.name,
    song: input.song ?? current.song,
    className: input.className ?? current.className,
    remark: input.remark ?? current.remark,
    studentNo: input.studentNo ?? current.studentNo,
    phone: input.phone ?? current.phone,
    email: input.email ?? current.email,
    qq: input.qq ?? current.qq,
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
      qq: normalized.qq,
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
  const scopedByDay = round.activeDay === 1 || round.activeDay === 2
  const singers = dayEntries
    .map((entry) => {
      const singer = singersById.get(entry.singerId)
      return singer ? { entry, singer } : null
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .map(({ entry, singer }, index) => ({
      ...entrySingerPublic(entry, singer, round.key),
      // 分天评比时给评委展示当天顺位（1 起），避免第二天从昨日总数之后接续显示。
      sortOrder: scopedByDay ? index + 1 : entry.sortOrder,
      advancedFromRank: entry.advancedFromRank,
      score: ownScores.get(singer.id) ?? null
    }))
  const daySingerIds = new Set(dayEntries.map(entry => entry.singerId))
  const dayScored = [...ownScores.keys()].filter(singerId => daySingerIds.has(singerId)).length

  const roundResults = round.status === 'closed'
    ? buildRoundRanking(round, entryRows, singersById, scoreRows, { trimExtremes: trimExtremesFor(client, round) })
    : null

  const finalRound = getRoundByKeySafe(client, eventRow.id, 'final')
  const finalResults = finalRound?.status === 'closed'
    ? buildRoundRanking(
        finalRound,
        listRoundEntryRows(client, finalRound.id),
        singersById,
        listRoundScores(client, finalRound.id),
        { trimExtremes: trimExtremesFor(client, finalRound) }
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
      advanceCount: round.advanceCount,
      sequential: round.sequentialMode === 1,
      scorePrecision: round.scorePrecision === 'decimal' ? 'decimal' : 'integer',
      dimensions: getRoundDimensions(round, eventRow),
      dimensionMax: getRoundDimensionMax(round),
      maxTotal: competitionMaxTotal(getRoundDimensions(round, eventRow), getRoundDimensionMax(round))
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

  // 自由评分时（后台没开顺序评分），把「刚刚被打分的那位」记成正在唱，只给叫号台显示用：
  // 绝不改 sequentialMode，也绝不因此锁住评委——评委可以随时倒回去改上一位的分。
  if (round.sequentialMode !== 1) {
    if (round.currentEntryId !== entry.id) {
      setCurrentEntryId(client, round.id, entry.id)
      round.currentEntryId = entry.id
    }
  } else if (!round.currentEntryId) {
    setCurrentEntryId(client, round.id, entry.id)
    round.currentEntryId = entry.id
  }

  // 只有后台显式开了顺序评分才锁人。自动记下的「正在唱」只给叫号台用，
  // 评委端仍然可以自由选人打分。
  if (round.sequentialMode === 1 && round.currentEntryId && entry.id !== round.currentEntryId) {
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

  const dimensions = getRoundDimensions(round, eventRow)
  const dimensionMax = getRoundDimensionMax(round)
  const rawScores = input.scores
  if (!rawScores || typeof rawScores !== 'object' || Array.isArray(rawScores)) {
    validationError('评分数据格式不正确', 'scores')
  }

  const scoreMap = rawScores as Record<string, unknown>
  const snapshot: CompetitionScoreDimension[] = dimensions.map((dimension) => {
    const value = Number(scoreMap[dimension.key])
    const max = dimensionMaxOf(dimension, dimensionMax)
    if (!Number.isFinite(value) || value < 0 || value > max) {
      validationError(`「${dimension.label}」需为 0-${max} 的分数`, `scores.${dimension.key}`)
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
    Object.fromEntries(snapshot.map(item => [item.key, item.score])),
    dimensionMax
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
  qq: string
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
    qq: input.qq,
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
      qq: normalized.qq,
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
  addPrelimEntry(client, eventRow.id, id, sortOrder, resolved.day, now, normalized.song)
  const prelimEntries = listRoundEntryRows(client, prelim.id)
  const dayEntries = (resolved.day
    ? prelimEntries.filter(entry => entry.contestDay === resolved.day)
    : prelimEntries
  ).filter(entry => entry.checkedInAt != null)
  const dayIndex = dayEntries.findIndex(entry => entry.singerId === id)
  return { id, sortOrder: dayIndex >= 0 ? dayIndex + 1 : sortOrder }
}

// -- 结果邮件通知 ---------------------------------------------------------------

function isEmailRoundKey(key: CompetitionRoundKey): key is CompetitionEmailRoundKey {
  return key === 'prelim' || key === 'semi' || key === 'final'
}

export const COMPETITION_EMAIL_TEMPLATE_DEFAULTS: Record<CompetitionEmailRoundKey, { subject: string, body: string }> = {
  prelim: {
    subject: '【音乐协会】新声歌手大赛初赛通知',
    body: [
      '{{姓名}} 同学：',
      '',
      '你在仰恩大学音乐协会{{届次}}的{{轮次}}里演唱的歌曲是《{{歌曲}}》。',
      '',
      '请点下面的按钮确认你已经收到这条通知：',
      '',
      '{{收到按钮}}',
      '',
      '群里会同步通知，点下面按钮加入 QQ 群：',
      '',
      '{{加群按钮}}',
      '',
      '仰恩大学音乐协会'
    ].join('\n')
  },
  semi: {
    subject: '【音乐协会】新声歌手大赛复赛通知',
    body: [
      '{{姓名}} 同学：',
      '',
      '你在仰恩大学音乐协会{{届次}}的{{轮次}}里演唱的歌曲是《{{歌曲}}》。',
      '',
      '请点下面的按钮确认你已经收到这条通知：',
      '',
      '{{收到按钮}}',
      '',
      '群里会同步通知，点下面按钮加入 QQ 群：',
      '',
      '{{加群按钮}}',
      '',
      '仰恩大学音乐协会'
    ].join('\n')
  },
  final: {
    subject: '【音乐协会】新声歌手大赛决赛通知',
    body: [
      '{{姓名}} 同学：',
      '',
      '你在仰恩大学音乐协会{{届次}}的{{轮次}}里演唱的歌曲是《{{歌曲}}》。',
      '',
      '请点下面的按钮确认你已经收到这条通知：',
      '',
      '{{收到按钮}}',
      '',
      '群里会同步通知，点下面按钮加入 QQ 群：',
      '',
      '{{加群按钮}}',
      '',
      '仰恩大学音乐协会'
    ].join('\n')
  }
}

function getEmailTemplateRow(client: DatabaseClient, eventId: string, roundKey: CompetitionEmailRoundKey) {
  return client.db.select().from(competitionEmailTemplates)
    .where(and(
      eq(competitionEmailTemplates.eventId, eventId),
      eq(competitionEmailTemplates.roundKey, roundKey)
    ))
    .get() ?? null
}

export function getEmailTemplate(client: DatabaseClient, eventId: string, roundKey: CompetitionEmailRoundKey): CompetitionEmailTemplate {
  const row = getEmailTemplateRow(client, eventId, roundKey)
  if (row) return { roundKey, subject: row.subject, body: row.body }
  return { roundKey, ...COMPETITION_EMAIL_TEMPLATE_DEFAULTS[roundKey] }
}

export function updateEmailTemplate(
  client: DatabaseClient,
  eventId: string,
  roundKey: CompetitionEmailRoundKey,
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
  roundKey: CompetitionEmailRoundKey,
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
/** 把「收到」链接渲染成按钮；邮件客户端只认绝对地址，所以这里必须给完整 URL。 */
function groupButtonHtml(url: string): string {
  const href = url.replace(/"/g, '&quot;')
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto;"><tr><td align="center" bgcolor="#0f766e" style="border-radius:999px;"><a href="${href}" style="display:inline-block;padding:10px 22px;border-radius:999px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">点我加入 QQ 群</a></td></tr></table>`
}

function songButtonHtml(url: string): string {
  return [
    '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto;"><tr>',
    '<td align="center" bgcolor="#0f766e" style="border-radius:999px;">',
    `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:11px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">填写下一轮曲目</a>`,
    '</td></tr></table>'
  ].join('')
}

function receiptButtonHtml(url: string): string {
  // 用 table 做按钮：QQ 邮箱、Gmail 会剥掉 <a> 上的背景与内边距，只有 table + bgcolor 能保住样式。
  // 只给按钮、不把链接文字露在外面；点不动时学生还能在「查询结果」页用姓名+学号+QQ 自助确认。
  return [
    '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto;"><tr>',
    '<td align="center" bgcolor="#0f766e" style="border-radius:999px;">',
    `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:11px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">我已收到</a>`,
    '</td></tr></table>'
  ].join('')
}

export function competitionEmailBodyToHtml(
  body: string,
  images: CompetitionEmailImageBinary[] = [],
  receiptUrl = '',
  qqGroupUrl = '',
  songUrl = ''
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

  let html = `<p style="margin:0 0 4px;line-height:1.8;">${parts.join('').split('\n').join('<br>')}</p>`
  if (receiptUrl) html = html.replace(receiptUrl, receiptButtonHtml(receiptUrl))
  if (qqGroupUrl) {
    html = html.split('{{加群按钮}}').join(groupButtonHtml(qqGroupUrl))
    html = html.replace(qqGroupUrl, groupButtonHtml(qqGroupUrl))
  } else {
    html = html.split('{{加群按钮}}').join('')
  }
  html = songUrl ? html.split('{{填歌按钮}}').join(songButtonHtml(songUrl)) : html.split('{{填歌按钮}}').join('')
  return html
}

export function buildEmailVariables(
  round: RoundRow,
  entry: CompetitionRoundEntry,
  singer: CompetitionSinger,
  context: { edition?: string, receiptUrl?: string, qqGroupUrl?: string, songUrl?: string } = {}
): Record<string, string> {
  return {
    姓名: singer.name,
    班级: singer.className || '—',
    学号: singer.studentNo || '—',
    歌曲: (entry.song ?? '').trim() || (round.key === 'prelim' ? singer.song : '') || '—',
    轮次: round.title,
    届次: context.edition || '新声歌手大赛',
    收到按钮: context.receiptUrl || '',
    加群按钮: context.qqGroupUrl || '',
    填歌按钮: context.songUrl || ''
  }
}

export function listEmailState(client: DatabaseClient, eventId: string): CompetitionEmailState {
  const roundKeys: CompetitionEmailRoundKey[] = ['prelim', 'semi', 'final']
  const templates = Object.fromEntries(
    roundKeys.map(key => [key, getEmailTemplate(client, eventId, key)])
  ) as Record<CompetitionEmailRoundKey, CompetitionEmailTemplate>
  const stats = Object.fromEntries(
    roundKeys.map(key => [key, { sent: 0, failed: 0, lastSentAt: null as number | null }])
  ) as Record<CompetitionEmailRoundKey, CompetitionEmailRoundStats>

  const rows = client.db.select().from(competitionEmailSends)
    .where(eq(competitionEmailSends.eventId, eventId))
    .orderBy(desc(competitionEmailSends.createdAt))
    .all()

  const latest: CompetitionEmailSendRecord[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const roundKey = row.roundKey as CompetitionEmailRoundKey
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
  if (round.key === 'final2') {
    validationError('决赛第二轮不发通知邮件，请选择初赛、复赛或决赛', 'roundKey')
  }
  if (round.status !== 'closed') {
    conflictError('ROUND_NOT_CLOSED', '请先结束本轮评分并确认成绩，再发送通知邮件')
  }
  if (round.rosterConfirmedAt === null) {
    conflictError('ROSTER_NOT_CONFIRMED', '请先在「晋级名单」里确认要通知的人，再发送邮件')
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
    listRoundScores(client, round.id),
    { trimExtremes: trimExtremesFor(client, round) }
  )

  let pool = ranking
  if (singerIds && singerIds.length > 0) {
    const requested = new Set(singerIds)
    pool = ranking.filter(entry => requested.has(entry.singer.id))
  } else if (scope === 'qualified') {
    pool = ranking.filter(entry => entry.advanced === 1)
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
  qq?: string
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
    qq: row.qq,
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
    qq: input.qq,
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
    qq: normalized.qq,
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
    qq: normalized.qq,
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
    qq: row.qq ?? null,
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
    qq: row.qq,
    song: row.song,
    preferredDay: row.preferredDay === 1 || row.preferredDay === 2 ? row.preferredDay : null,
    registeredAt: row.registeredAt ? Number(row.registeredAt) : null,
    createdAt: Number(row.createdAt ?? 0),
    registeredSingerName: row.registeredAt ? singerNameByPreId.get(row.id) ?? null : null
  }))
}

// -- 届 / 晋级名单 / 结果查询与回执 / 预报名提醒 ---------------------------------

export const COMPETITION_REMINDER_DEFAULTS = {
  subject: '【音乐协会】新声歌手大赛报名提醒',
  body: [
    '{{姓名}} 同学：',
    '',
    '你在仰恩大学音乐协会{{届次}}的报名还留在系统里，但比赛当天没有签到记录。',
    '',
    '如果还想上台，请直接到现场找工作人员补登记；已经确定不参加的可以忽略这封邮件。',
    '',
    '点下面按钮加入 QQ 群，后续通知都会发在群里：',
    '',
    '{{加群按钮}}',
    '',
    '仰恩大学音乐协会'
  ].join('\n')
}

export function getReminderTemplate(client: DatabaseClient, eventId: string): { subject: string, body: string } {
  const row = getEvent(client, eventId)
  if (!row?.reminderSubject || !row?.reminderBody) return { ...COMPETITION_REMINDER_DEFAULTS }
  return { subject: row.reminderSubject, body: row.reminderBody }
}

export function updateReminderTemplate(
  client: DatabaseClient,
  eventId: string,
  input: { subject: string, body: string }
): { subject: string, body: string } {
  client.db.update(competitionEvents).set({
    reminderSubject: input.subject,
    reminderBody: input.body,
    updatedAt: Date.now()
  }).where(eq(competitionEvents.id, eventId)).run()
  return getReminderTemplate(client, eventId)
}

/** 换届：旧届标记为非当前（数据原样留在库里），新建一届空数据。 */
export function createNextEdition(client: DatabaseClient, contentId: string, label: string): EventRow {
  const current = getCompetitionEventRow(client, contentId)
  const now = Date.now()
  const eventId = randomUUID()
  client.db.transaction((transaction) => {
    if (current) {
      transaction.update(competitionEvents).set({ isCurrent: 0, updatedAt: now })
        .where(eq(competitionEvents.id, current.id)).run()
    }
    transaction.insert(competitionEvents).values({
      id: eventId,
      contentId,
      title: current?.title ?? '新声歌手大赛',
      edition: label,
      isCurrent: 1,
      scheduleJson: current?.scheduleJson ?? JSON.stringify(DEFAULT_COMPETITION_SCHEDULE),
      formFieldsJson: current?.formFieldsJson ?? JSON.stringify(DEFAULT_COMPETITION_FORM_FIELDS),
      dimensionsJson: current?.dimensionsJson ?? JSON.stringify(DEFAULT_COMPETITION_DIMENSIONS),
      reminderSubject: current?.reminderSubject ?? COMPETITION_REMINDER_DEFAULTS.subject,
      reminderBody: current?.reminderBody ?? COMPETITION_REMINDER_DEFAULTS.body,
      createdAt: now,
      updatedAt: now
    }).run()
  })
  ensureRounds(client, eventId)
  return getEvent(client, eventId)!
}

export interface CompetitionEditionRow {
  id: string
  label: string
  isCurrent: boolean
  singerCount: number
  createdAt: number
}

export function listEditions(client: DatabaseClient, contentId: string): CompetitionEditionRow[] {
  const rows = client.db.select().from(competitionEvents)
    .where(eq(competitionEvents.contentId, contentId))
    .orderBy(desc(competitionEvents.createdAt))
    .all()
  return rows.map(row => ({
    id: row.id,
    label: row.edition || '未命名',
    isCurrent: row.isCurrent === 1,
    singerCount: client.db.select().from(competitionSingers)
      .where(eq(competitionSingers.eventId, row.id)).all().length,
    createdAt: Number(row.createdAt ?? 0)
  }))
}

/** 晋级候选：有成绩的人按平均分排序；没确认过时默认勾前 N 名。 */
export function listAdvanceRows(client: DatabaseClient, round: RoundRow): CompetitionAdvanceRow[] {
  const singers = listSingers(client, round.eventId)
  const singersById = new Map(singers.map(singer => [singer.id, singer]))
  const ranking = buildRoundRanking(
    round,
    listRoundEntryRows(client, round.id),
    singersById,
    listRoundScores(client, round.id),
    { trimExtremes: trimExtremesFor(client, round) }
  ).filter(row => row.scoreCount > 0)

  const limit = round.advanceCount ?? ranking.length
  const duelMode = round.key === 'final' && round.advanceMode === 'duel'
  const duelWinners = duelMode
    ? new Set(
        [...duelOutcomes(
          listRoundEntryRows(client, round.id),
          listRoundScores(client, round.id),
          trimExtremesFor(client, round)
        ).values()]
          .map(outcome => outcome.winnerEntryId)
          .filter((entryId): entryId is string => Boolean(entryId))
      )
    : null
  // advanced 为空 = 还没人动过这一轮的勾选，默认按名次勾前 N 名；
  // 一旦有人勾/取消，就以其存下来的值为准，未被碰过的仍按默认名次。
  // 隐藏赛制复活：败者里的前 N 名跟着胜者一起进第二轮，默认勾选也要算上他们。
  const revival = duelMode ? revivalState(client, round, getEvent(client, round.eventId) ?? null) : null
  const revivedIds = new Set(
    (revival?.candidates ?? [])
      .filter(candidate => candidate.revived)
      .map(candidate => candidate.entryId)
  )
  return ranking.map((row, index) => {
    const defaultChecked = duelMode
      ? (duelWinners?.has(row.id) === true || revivedIds.has(row.id))
      : index < limit
    return {
      entryId: row.id,
      singer: row.singer,
      average: row.average,
      scoreCount: row.scoreCount,
      rank: row.rank,
      // 抽签赛制不允许手动勾选，晋级集合恒等于「胜者 + 复活者」；
      // 历史落库的 advanced=0 不能把「确认胜者」按钮显示成 0 人。
      advanced: duelMode ? defaultChecked : (row.advanced === null ? defaultChecked : row.advanced === 1),
      revived: revivedIds.has(row.id)
    }
  })
}

/**
 * 把「还没人动过」的默认勾选（按名次前 N）落成显式 0/1。
 * 否则排名一变（改分、去极值开关），没碰过的人会跟着名次重新算，
 * 用户眼前勾好的人会在确认时被换掉。
 */
export function materializeAdvanceDefaults(client: DatabaseClient, round: RoundRow): void {
  if (round.rosterConfirmedAt !== null) return
  const rows = listAdvanceRows(client, round)
  const pending = rows.filter((row) => {
    const raw = client.db.select({ advanced: competitionRoundEntries.advanced })
      .from(competitionRoundEntries)
      .where(eq(competitionRoundEntries.id, row.entryId))
      .get()
    return (raw?.advanced ?? null) === null
  })
  if (pending.length === 0) return
  client.db.transaction((transaction) => {
    for (const row of pending) {
      transaction.update(competitionRoundEntries).set({ advanced: row.advanced ? 1 : 0 })
        .where(eq(competitionRoundEntries.id, row.entryId)).run()
    }
  })
}

export function setEntryAdvanced(client: DatabaseClient, round: RoundRow, entryId: string, advanced: boolean): void {
  if (round.status === 'closed' && round.rosterConfirmedAt !== null) {
    conflictError('ROUND_ROSTER_CONFIRMED', '晋级名单已确认，不能再改；如需调整请先取消确认')
  }
  if (round.key === 'final' && round.advanceMode === 'duel') {
    conflictError('DUEL_AUTO_ADVANCE', '抽签 1v1 由每组胜者自动晋级，不能手动勾选')
  }
  // 先把默认勾选钉住，再改这一条：之后排名怎么变，都按现在看到的结果走。
  materializeAdvanceDefaults(client, round)
  const entry = client.db.select().from(competitionRoundEntries)
    .where(and(eq(competitionRoundEntries.id, entryId), eq(competitionRoundEntries.roundId, round.id)))
    .get()
  if (!entry) validationError('名单里没有这条记录', 'entryId')
  client.db.update(competitionRoundEntries).set({ advanced: advanced ? 1 : 0 })
    .where(eq(competitionRoundEntries.id, entryId)).run()
}

/**
 * 确认晋级名单：落库勾选结果、记确认时间，并把这些人放进下一轮名单
 * （下一轮已有人时不重复插入）。确认之后才能发结果邮件。
 */
export function confirmAdvanceRoster(client: DatabaseClient, round: RoundRow): { advanced: number, nextRound: RoundRow | null } {
  if (round.status !== 'closed') {
    conflictError('ROUND_NOT_CLOSED', '请先结束本轮评分，再确认晋级名单')
  }
  const duelMode = round.key === 'final' && round.advanceMode === 'duel'
  let duelWinnerIds: Set<string> | null = null
  let duelAllowedIds: Set<string> | null = null
  let revivedEntryIds = new Set<string>()
  if (duelMode) {
    const entries = listRoundEntryRows(client, round.id)
    if (entries.length === 0) validationError('本轮还没有参赛名单', 'advanced')
    if (entries.some(entry => entry.pairNo === null || entry.pairSlot === null)) {
      validationError('还有选手没有抽签分组，请先完成 1v1 抽签', 'pairs')
    }
    const outcomes = duelOutcomes(
      entries,
      listRoundScores(client, round.id),
      trimExtremesFor(client, round)
    )
    const unresolved = [...outcomes.entries()].filter(([, outcome]) => !outcome.winnerEntryId)
    if (unresolved.length > 0) {
      validationError(`第 ${unresolved.map(([pairNo]) => pairNo).join('、')} 组还没分出胜负，先补齐评分或安排加赛`, 'pairs')
    }
    duelWinnerIds = new Set(
      [...outcomes.values()]
        .map(outcome => outcome.winnerEntryId)
        .filter((entryId): entryId is string => Boolean(entryId))
    )
    // 隐藏赛制复活：败者里的前 N 名跟胜者一起进第二轮。
    const revival = revivalState(client, round, getEvent(client, round.eventId) ?? null)
    revivedEntryIds = new Set(
      (revival?.candidates ?? [])
        .filter(candidate => candidate.revived)
        .map(candidate => candidate.entryId)
    )
    duelAllowedIds = new Set([...duelWinnerIds, ...revivedEntryIds])
  }
  // 确认时也把默认勾选落库，保证「看到的」和「进去的」是同一批人。
  materializeAdvanceDefaults(client, round)
  const rows = listAdvanceRows(client, round)
  // 抽签赛制不接受手动勾选：晋级集合恒等于「各组胜者 + 复活名额」。这里按当前设置
  // 重算一遍，免得复活开关改过之后残留的旧勾选把名单带偏。
  const picked = duelAllowedIds
    ? rows.filter(row => duelAllowedIds!.has(row.entryId))
    : rows.filter(row => row.advanced)
  if (picked.length === 0) {
    validationError('至少要勾选一位晋级选手', 'advanced')
  }
  if (duelAllowedIds && picked.length !== duelAllowedIds.size) {
    const reviveNote = revivedEntryIds.size > 0 ? ` + ${revivedEntryIds.size} 位复活` : ''
    validationError(`抽签赛制应晋级 ${duelWinnerIds!.size} 位小组胜者${reviveNote}，当前名单只有 ${picked.length} 位`, 'advanced')
  }

  const nextRound = nextRoundOf(client, round)
  if (nextRound && countRoundScores(client, nextRound.id) > 0) {
    conflictError('NEXT_ROUND_HAS_SCORES', '下一轮已经开始评分了，名单不能再改')
  }
  const now = Date.now()
  // 决赛第二轮的曲目来自「决赛两首歌」提交里的第二首；确认前六时一并写进名单。
  const secondSongBySinger = new Map<string, {
    song: string
    videoUrl: string | null
    videoName: string | null
    videoSize: number | null
  }>()
  if (nextRound?.key === 'final2') {
    const songRows = client.db.select().from(competitionFinalSongs)
      .where(and(
        eq(competitionFinalSongs.eventId, round.eventId),
        eq(competitionFinalSongs.slot, 2)
      ))
      .all()
    for (const songRow of songRows) {
      const value = (songRow.song ?? '').trim()
      if (value) {
        secondSongBySinger.set(songRow.singerId, {
          song: value,
          videoUrl: songRow.videoUrl,
          videoName: songRow.videoName,
          videoSize: songRow.videoSize
        })
      }
    }
  }
  client.db.transaction((transaction) => {
    // 晋级标记以 picked 为准：抽签赛制下 picked 是重算的「胜者 + 复活者」，
    // 不能沿用 rows 里可能过期的勾选值。
    const advancedEntryIds = new Set(picked.map(row => row.entryId))
    for (const row of rows) {
      transaction.update(competitionRoundEntries)
        .set({ advanced: advancedEntryIds.has(row.entryId) ? 1 : 0 })
        .where(eq(competitionRoundEntries.id, row.entryId)).run()
    }
    transaction.update(competitionRounds).set({ rosterConfirmedAt: now, updatedAt: now })
      .where(eq(competitionRounds.id, round.id)).run()

    if (nextRound) {
      // 下一轮名单必须与这次勾选完全一致：多的删掉、缺的补上、顺序按勾选名次重排。
      const keepSingerIds = new Set(picked.map(row => row.singer.id))
      const existing = transaction.select().from(competitionRoundEntries)
        .where(eq(competitionRoundEntries.roundId, nextRound.id))
        .all()
      for (const entry of existing) {
        if (!keepSingerIds.has(entry.singerId)) {
          transaction.delete(competitionRoundEntries)
            .where(eq(competitionRoundEntries.id, entry.id)).run()
        }
      }
      const existingBySinger = new Map(existing.map(entry => [entry.singerId, entry]))
      picked.forEach((row, index) => {
        const found = existingBySinger.get(row.singer.id)
        const secondFinal = secondSongBySinger.get(row.singer.id)
        const secondSong = secondFinal?.song ?? null
        const secondVideo = secondFinal?.videoUrl
          ? {
              accompanimentUrl: secondFinal.videoUrl,
              accompanimentName: secondFinal.videoName,
              accompanimentSize: secondFinal.videoSize,
              accompanimentUpdatedAt: now,
              originalUrl: null,
              originalName: null,
              originalSize: null
            }
          : {}
        if (found) {
          transaction.update(competitionRoundEntries)
            .set({
              sortOrder: index + 1,
              advancedFromRank: row.rank ?? null,
              revived: revivedEntryIds.has(row.entryId) ? 1 : 0,
              ...(secondSong ? { song: secondSong } : {}),
              ...secondVideo
            })
            .where(eq(competitionRoundEntries.id, found.id)).run()
          return
        }
        transaction.insert(competitionRoundEntries).values({
          id: randomUUID(),
          roundId: nextRound.id,
          singerId: row.singer.id,
          sortOrder: index + 1,
          advancedFromRank: row.rank ?? null,
          revived: revivedEntryIds.has(row.entryId) ? 1 : 0,
          // 下一轮的曲目：进决赛第二轮时取第二首歌，其他轮留空等选手自己填
          song: secondSong,
          ...secondVideo,
          createdAt: now
        }).run()
      })
    }
  })
  return { advanced: picked.length, nextRound }
}

export function reopenAdvanceRoster(client: DatabaseClient, round: RoundRow): void {
  client.db.update(competitionRounds).set({ rosterConfirmedAt: null, resultQueryOpen: 0, updatedAt: Date.now() })
    .where(eq(competitionRounds.id, round.id)).run()
}

// -- 结果查询与回执 -------------------------------------------------------------

export function ensureReceiptToken(client: DatabaseClient, eventId: string, roundKey: CompetitionEmailRoundKey, singerId: string): string {
  const existing = client.db.select().from(competitionEmailReceipts)
    .where(and(
      eq(competitionEmailReceipts.eventId, eventId),
      eq(competitionEmailReceipts.roundKey, roundKey),
      eq(competitionEmailReceipts.singerId, singerId)
    ))
    .get()
  if (existing) return existing.token
  const token = randomBytes(16).toString('hex')
  client.db.insert(competitionEmailReceipts).values({
    id: randomUUID(),
    eventId,
    roundKey,
    singerId,
    token,
    confirmedAt: null,
    createdAt: Date.now()
  }).run()
  return token
}

export function receiptPath(token: string): string {
  return `/singer/result?token=${token}`
}

export function openResultQuery(client: DatabaseClient, round: RoundRow): void {
  client.db.update(competitionRounds).set({ resultQueryOpen: 1, updatedAt: Date.now() })
    .where(eq(competitionRounds.id, round.id)).run()
}

export interface CompetitionReceiptRow {
  singerId: string
  name: string
  email: string | null
  confirmedAt: number | null
}

export function listReceipts(client: DatabaseClient, eventId: string, roundKey: CompetitionEmailRoundKey): CompetitionReceiptRow[] {
  const receipts = client.db.select().from(competitionEmailReceipts)
    .where(and(eq(competitionEmailReceipts.eventId, eventId), eq(competitionEmailReceipts.roundKey, roundKey)))
    .all()
  // 只统计真正发过邮件的选手：测试邮件也会建 token，不排除就会让「回执 5 / 31」这种分母虚高
  const sentSingerIds = new Set(
    client.db.select({ singerId: competitionEmailSends.singerId })
      .from(competitionEmailSends)
      .where(and(
        eq(competitionEmailSends.eventId, eventId),
        eq(competitionEmailSends.roundKey, roundKey),
        eq(competitionEmailSends.status, 'sent')
      ))
      .all()
      .map(row => row.singerId)
  )
  const singers = new Map(listSingers(client, eventId).map(singer => [singer.id, singer]))
  return receipts.filter(row => sentSingerIds.has(row.singerId)).map(row => ({
    singerId: row.singerId,
    name: singers.get(row.singerId)?.name ?? '已删除选手',
    email: singers.get(row.singerId)?.email ?? null,
    confirmedAt: row.confirmedAt ? Number(row.confirmedAt) : null
  })).sort((a, b) => Number(a.confirmedAt ?? 0) - Number(b.confirmedAt ?? 0))
}

function normalizeLookup(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toLowerCase()
}

/** 三要素查询：姓名 + 学号 + QQ 全部对上才返回，缺一不可。 */
export function lookupCompetitionResult(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string }
): CompetitionResultLookup {
  const name = normalizeLookup(input.name)
  const studentNo = normalizeLookup(input.studentNo)
  const contact = normalizeLookup(input.contact)
  if (!name || !studentNo || !contact) {
    validationError('姓名、学号、QQ 或邮箱三项都要填', !name ? 'name' : !studentNo ? 'studentNo' : 'contact')
  }
  // 第三要素既可以是 QQ 号，也可以是邮箱：带 @ 就按邮箱比，纯数字按 QQ 比。
  const byEmail = contact.includes('@')
  const eventRow = ensureCompetitionEvent(client, contentId)
  // 老选手可能没在选手库填 QQ：允许用他预报名时留下的 QQ 对上。
  const preRows = client.db.select().from(competitionPreRegistrations)
    .where(eq(competitionPreRegistrations.eventId, eventRow.id))
    .all()
  const preKey = (row: { name?: string | null, studentNo?: string | null }) =>
    `${normalizeLookup(row.name ?? undefined)}|${normalizeLookup(row.studentNo ?? undefined)}`
  const preQqByNameAndNo = new Map(
    preRows.filter(row => row.qq).map(row => [preKey(row), normalizeLookup(row.qq ?? undefined)])
  )
  const preEmailByNameAndNo = new Map(
    preRows.filter(row => row.email).map(row => [preKey(row), normalizeLookup(row.email ?? undefined)])
  )
  const singer = listSingers(client, eventRow.id).find((item) => {
    const itemName = normalizeLookup(item.name ?? undefined)
    const itemNo = normalizeLookup(item.studentNo ?? undefined)
    if (itemName !== name || itemNo !== studentNo) return false
    if (byEmail) {
      const itemEmail = normalizeLookup(item.email ?? undefined)
        || preEmailByNameAndNo.get(`${itemName}|${itemNo}`)
        || ''
      return itemEmail === contact
    }
    const itemQq = normalizeLookup(item.qq ?? undefined)
      || normalizeLookup(qqFromEmail(item.email))
      || preQqByNameAndNo.get(`${itemName}|${itemNo}`)
      || ''
    return itemQq === contact
  })
  if (!singer) {
    conflictError('COMPETITION_LOOKUP_NOT_FOUND', '姓名、学号、QQ 或邮箱对不上，请核对后重试')
  }

  const rounds = client.db.select().from(competitionRounds)
    .where(eq(competitionRounds.eventId, eventRow.id))
    .orderBy(asc(competitionRounds.position))
    .all()
  const openRounds = rounds.filter(round => round.resultQueryOpen === 1 && isEmailRoundKey(round.key))
  if (openRounds.length === 0) {
    conflictError('COMPETITION_LOOKUP_CLOSED', '结果还没开放查询，等通知邮件发出后再来查')
  }
  const round = openRounds[openRounds.length - 1]!
  if (!isEmailRoundKey(round.key)) {
    conflictError('COMPETITION_LOOKUP_CLOSED', '结果还没开放查询，等通知邮件发出后再来查')
  }
  const template = getEmailTemplate(client, eventRow.id, round.key)
  const token = ensureReceiptToken(client, eventRow.id, round.key, singer.id)
  const variables: Record<string, string> = {
    姓名: singer.name,
    歌曲: singer.song || '—',
    轮次: round.title,
    届次: eventRow.edition || '新声歌手大赛',
    收到按钮: receiptPath(token)
  }
  const receipt = client.db.select().from(competitionEmailReceipts)
    .where(and(
      eq(competitionEmailReceipts.eventId, eventRow.id),
      eq(competitionEmailReceipts.roundKey, round.key),
      eq(competitionEmailReceipts.singerId, singer.id)
    ))
    .get()
  return {
    singerName: singer.name,
    singerSong: singer.song,
    roundKey: round.key,
    roundTitle: round.title,
    subject: renderCompetitionEmailTemplate(template.subject, variables),
    body: renderCompetitionEmailTemplate(template.body, variables),
    receiptToken: token,
    receipt: {
      singerName: singer.name,
      roundKey: round.key,
      roundTitle: round.title,
      confirmedAt: receipt?.confirmedAt ? Number(receipt.confirmedAt) : null
    }
  }
}

export function confirmReceiptByToken(client: DatabaseClient, token: string): CompetitionReceiptState {
  const row = client.db.select().from(competitionEmailReceipts)
    .where(eq(competitionEmailReceipts.token, token))
    .get()
  if (!row) validationError('这个确认链接无效', 'token')
  const round = client.db.select().from(competitionRounds)
    .where(and(eq(competitionRounds.eventId, row.eventId), eq(competitionRounds.key, row.roundKey)))
    .get()
  const singer = client.db.select().from(competitionSingers)
    .where(eq(competitionSingers.id, row.singerId))
    .get()
  if (!round) validationError('这个确认链接无效', 'token')
  if (!round.resultQueryOpen) {
    conflictError('COMPETITION_LOOKUP_CLOSED', '结果还没开放查询，等通知邮件发出后再来')
  }
  if (!row.confirmedAt) {
    client.db.update(competitionEmailReceipts).set({ confirmedAt: Date.now() })
      .where(eq(competitionEmailReceipts.id, row.id)).run()
  }
  return {
    singerName: singer?.name ?? '',
    roundKey: row.roundKey,
    roundTitle: round.title,
    confirmedAt: Date.now()
  }
}

export interface CompetitionSongFormState {
  singerName: string
  song: string
  accompaniment: CompetitionEntryAccompaniment | null
  stageTitle: string
  editable: boolean
  reason: string
}

/** 晋级选手填复赛/决赛曲目：姓名 + 学号 + QQ 或邮箱三要素定位，和邮箱完全分开。 */
function singerByThreeFactors(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string }
) {
  const name = normalizeLookup(input.name)
  const studentNo = normalizeLookup(input.studentNo)
  const contact = normalizeLookup(input.contact)
  if (!name || !studentNo || !contact) {
    validationError('姓名、学号、QQ 或邮箱三项都要填', !name ? 'name' : !studentNo ? 'studentNo' : 'contact')
  }
  const eventRow = ensureCompetitionEvent(client, contentId)
  const byEmail = contact.includes('@')
  const preRows = client.db.select().from(competitionPreRegistrations)
    .where(eq(competitionPreRegistrations.eventId, eventRow.id))
    .all()
  const preKey = (row: { name?: string | null, studentNo?: string | null }) =>
    `${normalizeLookup(row.name ?? undefined)}|${normalizeLookup(row.studentNo ?? undefined)}`
  const preQq = new Map(preRows.filter(row => row.qq).map(row => [preKey(row), normalizeLookup(row.qq ?? undefined)]))
  const preEmail = new Map(preRows.filter(row => row.email).map(row => [preKey(row), normalizeLookup(row.email ?? undefined)]))

  const singer = listSingers(client, eventRow.id).find((item) => {
    const itemName = normalizeLookup(item.name ?? undefined)
    const itemNo = normalizeLookup(item.studentNo ?? undefined)
    if (itemName !== name || itemNo !== studentNo) return false
    if (byEmail) {
      const itemEmail = normalizeLookup(item.email ?? undefined)
        || preEmail.get(`${itemName}|${itemNo}`)
        || ''
      return itemEmail === contact
    }
    const itemQq = normalizeLookup(item.qq ?? undefined)
      || normalizeLookup(qqFromEmail(item.email))
      || preQq.get(`${itemName}|${itemNo}`)
      || ''
    return itemQq === contact
  })
  if (!singer) {
    conflictError('COMPETITION_LOOKUP_NOT_FOUND', '姓名、学号、QQ 或邮箱对不上，请核对后重试')
  }
  return { singer, eventRow }
}

/** 只有「上一轮已确认、本人被勾进下一轮」的选手才能改曲目。 */
function songStage(client: DatabaseClient, eventId: string, singerId: string) {
  const rounds = client.db.select().from(competitionRounds)
    .where(eq(competitionRounds.eventId, eventId))
    .orderBy(asc(competitionRounds.position))
    .all()
  const entries = client.db.select().from(competitionRoundEntries)
    .where(eq(competitionRoundEntries.singerId, singerId))
    .all()
  const entryByRound = new Map(entries.map(entry => [entry.roundId, entry]))
  let firstIndex = -1
  let latestConfirmedIndex = -1
  rounds.forEach((round, index) => {
    if (!entryByRound.has(round.id)) return
    if (firstIndex < 0) firstIndex = index
    if (round.rosterConfirmedAt !== null) latestConfirmedIndex = index
  })
  const index = latestConfirmedIndex >= 0 ? latestConfirmedIndex : firstIndex
  if (index < 0) {
    return { editable: false, stageTitle: '', reason: '没找到你的出场记录，先确认已经登台唱过' }
  }
  const current = rounds[index]!
  const entry = entryByRound.get(current.id)!
  const confirmed = current.rosterConfirmedAt !== null && entry.advanced === 1
  const next = rounds[index + 1] ?? null
  // 填的新歌属于「下一轮」那场；晋级后下一轮已经有条目（确认晋级时建好的）
  const targetEntry = next ? entryByRound.get(next.id) ?? null : entry
  return {
    editable: confirmed,
    stageTitle: next ? next.title : current.title,
    targetRoundKey: next?.key ?? current.key,
    targetEntryId: targetEntry?.id ?? null,
    targetSong: (targetEntry?.song ?? '').trim(),
    targetAccompaniment: targetEntry ? serializeAccompaniment(targetEntry) : null,
    reason: confirmed
      ? ''
      : current.rosterConfirmedAt === null
        ? '晋级名单还没确认，等组委会确认完再来填'
        : '你这一轮没有晋级，不用填新曲目'
  }
}

export function getSongEditor(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string }
): CompetitionSongFormState {
  const { singer, eventRow } = singerByThreeFactors(client, contentId, input)
  const stage = songStage(client, eventRow.id, singer.id)
  return {
    singerName: singer.name,
    song: stage.targetSong || singer.song || '',
    accompaniment: stage.targetAccompaniment ?? null,
    stageTitle: stage.stageTitle,
    editable: stage.editable,
    reason: stage.reason
  }
}

export function submitSongByThreeFactors(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string },
  song: string
): CompetitionSongFormState {
  const { singer, eventRow } = singerByThreeFactors(client, contentId, input)
  const stage = songStage(client, eventRow.id, singer.id)
  if (!stage.editable) {
    conflictError('COMPETITION_SONG_LOCKED', stage.reason || '现在还不能改曲目')
  }
  if (stage.targetRoundKey === 'final' || stage.targetRoundKey === 'final2') {
    conflictError('COMPETITION_FINAL_SONG_DEDICATED', '决赛两首歌请到「决赛两首歌」页面一次提交，这里不再单独改决赛曲目')
  }
  const value = cleanSongTitle(song, singer.name)
  if (!value) validationError('曲目必填，请填具体歌名', 'song')
  if (COMPETITION_SONG_PLACEHOLDERS.has(value.replace(/\s+/g, '').toLowerCase())) {
    validationError('曲目要填具体歌名，不能填「待定」', 'song')
  }
  if (value.length > 100) validationError('歌名太长，控制在 100 字以内', 'song')
  assertSongNotRepeated(client, eventRow.id, singer.id, value)
  client.db.update(competitionSingers)
    .set({ song: value, updatedAt: Date.now() })
    .where(eq(competitionSingers.id, singer.id)).run()
  // 同时写进这一轮的条目：初赛那场的曲目记录不会被复赛改歌冲掉
  if (stage.targetEntryId) {
    client.db.update(competitionRoundEntries)
      .set({ song: value })
      .where(eq(competitionRoundEntries.id, stage.targetEntryId)).run()
  }
  return {
    singerName: singer.name,
    song: value,
    accompaniment: stage.targetAccompaniment ?? null,
    stageTitle: stage.stageTitle,
    editable: true,
    reason: ''
  }
}

interface FinalSongRow {
  song: string
  version: number
  video: CompetitionEntryAccompaniment | null
}

interface FinalSongRows {
  first: FinalSongRow | null
  second: FinalSongRow | null
  revision: number
}

/** 决赛两首歌的视频和轮次伴奏同构：存 cos:<key>，读时换成临时签名地址。 */
function finalSongVideoOf(row: {
  videoUrl: string | null
  videoName: string | null
  videoSize: number | null
}): CompetitionEntryAccompaniment | null {
  return serializeAccompaniment({
    accompanimentUrl: row.videoUrl,
    accompanimentName: row.videoName,
    accompanimentSize: row.videoSize
  })
}

function readFinalSongsForEvent(
  client: DatabaseClient,
  eventId: string
): Map<string, CompetitionFinalSongsPair> {
  const rows = client.db.select().from(competitionFinalSongs)
    .where(eq(competitionFinalSongs.eventId, eventId))
    .all()
  const result = new Map<string, CompetitionFinalSongsPair>()
  for (const row of rows) {
    const pair = result.get(row.singerId) ?? { firstSong: '', secondSong: '', revision: 0 }
    if (row.slot === 1) pair.firstSong = row.song
    else if (row.slot === 2) pair.secondSong = row.song
    pair.revision = Math.max(pair.revision, Number(row.version ?? 0))
    result.set(row.singerId, pair)
  }
  return result
}

function readFinalSongs(client: DatabaseClient, eventId: string, singerId: string): FinalSongRows {
  const rows = client.db.select().from(competitionFinalSongs)
    .where(and(
      eq(competitionFinalSongs.eventId, eventId),
      eq(competitionFinalSongs.singerId, singerId)
    ))
    .all()
  const first = rows.find(row => row.slot === 1) ?? null
  const second = rows.find(row => row.slot === 2) ?? null
  return {
    first: first ? { song: first.song, version: first.version, video: finalSongVideoOf(first) } : null,
    second: second ? { song: second.song, version: second.version, video: finalSongVideoOf(second) } : null,
    revision: Math.max(0, ...rows.map(row => Number(row.version ?? 0)))
  }
}

/** 决赛两首歌的锁定原因；空字符串表示还能改。 */
function finalSongLockReason(
  client: DatabaseClient,
  finalRound: RoundRow,
  final2Round: RoundRow | null,
  entry: EntryRow | null
): string {
  if (!entry) return '你不在决赛名单里，先找组委会确认'
  if (finalRound.status === 'closed') return '决赛第一轮已经结束，两首歌已锁定'
  if (final2Round && countRoundScores(client, final2Round.id) > 0) {
    return '决赛第二轮已经开始评分，两首歌已锁定'
  }
  return ''
}

function finalSongContext(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string }
) {
  const { singer, eventRow } = singerByThreeFactors(client, contentId, input)
  const finalRound = getRoundByKeySafe(client, eventRow.id, 'final')
  if (!finalRound) conflictError('COMPETITION_LOOKUP_NOT_FOUND', '决赛还没建好，等组委会通知')
  const final2Round = getRoundByKeySafe(client, eventRow.id, 'final2')
  const entry = client.db.select().from(competitionRoundEntries)
    .where(and(
      eq(competitionRoundEntries.roundId, finalRound.id),
      eq(competitionRoundEntries.singerId, singer.id)
    ))
    .get() ?? null
  return { singer, eventRow, finalRound, final2Round, entry }
}

function assertFinalSongAvailable(
  client: DatabaseClient,
  eventId: string,
  singerId: string,
  song: string
): void {
  const key = songCompareKey(song)
  if (!key) return
  // 决赛这一对曲目本身允许修改，查重只比对初赛/复赛唱过的歌；
  // 两首之间是否重复由调用方单独判断。
  const rows = client.db.select({
    key: competitionRounds.key,
    entrySong: competitionRoundEntries.song
  })
    .from(competitionRoundEntries)
    .innerJoin(competitionRounds, eq(competitionRounds.id, competitionRoundEntries.roundId))
    .where(and(
      eq(competitionRoundEntries.singerId, singerId),
      eq(competitionRounds.eventId, eventId)
    ))
    .all()
  for (const row of rows) {
    if (row.key !== 'prelim' && row.key !== 'semi') continue
    if (row.entrySong && songCompareKey(row.entrySong) === key) {
      conflictError('SONG_REPEATED', `这首歌你在${row.key === 'prelim' ? '初赛' : '复赛'}已经唱过了，换一首`)
    }
  }
}

/** 决赛两首歌的提交页状态。revision 是两行里最大的版本号，提交时必须回传。 */
export function getFinalSongEditor(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string }
): CompetitionFinalSongsState {
  const { singer, eventRow, finalRound, final2Round, entry } = finalSongContext(client, contentId, input)
  const songs = readFinalSongs(client, eventRow.id, singer.id)
  const reason = finalSongLockReason(client, finalRound, final2Round, entry)
  return {
    singerName: singer.name,
    stageTitle: `决赛 · 两首歌（${finalRound.title} + 第二轮）`,
    firstSong: songs.first?.song ?? (entry?.song ?? '').trim(),
    secondSong: songs.second?.song ?? '',
    firstVideo: songs.first?.video ?? null,
    secondVideo: songs.second?.video ?? null,
    revision: songs.revision,
    editable: reason === '',
    reason
  }
}

function cleanFinalSongPair(
  singerName: string,
  input: { firstSong: string, secondSong: string }
): { firstSong: string, secondSong: string } {
  const firstSong = cleanSongTitle(input.firstSong, singerName)
  const secondSong = cleanSongTitle(input.secondSong, singerName)
  for (const [field, value] of [['firstSong', firstSong], ['secondSong', secondSong]] as const) {
    if (!value) validationError('两首歌都要填具体歌名', field)
    if (value.length > 100) validationError('歌名太长，控制在 100 字以内', field)
    if (COMPETITION_SONG_PLACEHOLDERS.has(value.replace(/\s+/g, '').toLowerCase())) {
      validationError('曲目要填具体歌名，不能填「待定」', field)
    }
  }
  if (songCompareKey(firstSong) === songCompareKey(secondSong)) {
    validationError('两首决赛曲目不能是同一首', 'secondSong')
  }
  return { firstSong, secondSong }
}

/**
 * 一次提交决赛两首歌：slot1 第一轮唱，slot2 前六进第二轮唱。
 * revision 与库里不一致时返回 409，不覆盖别人刚提交的版本。
 */
export function submitFinalSongsByThreeFactors(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string, revision: number },
  songsInput: { firstSong: string, secondSong: string }
): CompetitionFinalSongsState {
  const { singer, eventRow, finalRound, final2Round, entry } = finalSongContext(client, contentId, input)
  const reason = finalSongLockReason(client, finalRound, final2Round, entry)
  if (reason) conflictError('COMPETITION_FINAL_SONGS_LOCKED', reason)

  const { firstSong, secondSong } = cleanFinalSongPair(singer.name, songsInput)
  // 第一首归决赛第一轮，第二首归决赛第二轮；两首都只和初赛/复赛比。
  assertFinalSongAvailable(client, eventRow.id, singer.id, firstSong)
  assertFinalSongAvailable(client, eventRow.id, singer.id, secondSong)

  const expectedRevision = Number(input.revision ?? 0)
  client.db.transaction((transaction): number => {
    const rows = transaction.select().from(competitionFinalSongs)
      .where(and(
        eq(competitionFinalSongs.eventId, eventRow.id),
        eq(competitionFinalSongs.singerId, singer.id)
      ))
      .all()
    const currentRevision = Math.max(0, ...rows.map(row => Number(row.version ?? 0)))
    if (currentRevision !== expectedRevision) {
      conflictError('COMPETITION_FINAL_SONGS_CONFLICT', '刚才有人更新过这两首歌，请刷新页面确认最新版本后再提交')
    }
    const now = Date.now()
    const revision = currentRevision + 1
    for (const [slot, song] of [[1, firstSong], [2, secondSong]] as const) {
      const existing = rows.find(row => row.slot === slot)
      if (existing) {
        transaction.update(competitionFinalSongs)
          .set({ song, version: revision, updatedAt: now })
          .where(eq(competitionFinalSongs.id, existing.id)).run()
      } else {
        transaction.insert(competitionFinalSongs).values({
          id: randomUUID(),
          eventId: eventRow.id,
          singerId: singer.id,
          slot,
          song,
          version: revision,
          createdAt: now,
          updatedAt: now
        }).run()
      }
    }
    // 第一轮实际要唱的歌同步进决赛名单，叫号台/评委端立刻能看到。
    if (entry) {
      transaction.update(competitionRoundEntries).set({ song: firstSong })
        .where(eq(competitionRoundEntries.id, entry.id)).run()
    }
    // 如果决赛第一轮被重新打开、第二轮名单已经存在，第二首也同步过去。
    if (final2Round) {
      transaction.update(competitionRoundEntries).set({ song: secondSong })
        .where(and(
          eq(competitionRoundEntries.roundId, final2Round.id),
          eq(competitionRoundEntries.singerId, singer.id)
        )).run()
    }
    return revision
  })

  return getFinalSongEditor(client, contentId, input)
}

/** 决赛两首歌的视频直传地址：歌曲还没提交时不允许先传视频，避免出现无主对象。 */
export function getFinalSongVideoUploadTarget(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string },
  slot: 1 | 2,
  filename: string
): { key: string, uploadUrl: string, expiresIn: number } {
  const { singer, eventRow, finalRound, final2Round, entry } = finalSongContext(client, contentId, input)
  const reason = finalSongLockReason(client, finalRound, final2Round, entry)
  if (reason) conflictError('COMPETITION_FINAL_SONGS_LOCKED', reason)
  const songs = readFinalSongs(client, eventRow.id, singer.id)
  const row = slot === 1 ? songs.first : songs.second
  if (!row) conflictError('SONG_REQUIRED', '先提交两首歌，再给每首歌上传背景视频')
  if (!filename.trim().toLowerCase().endsWith('.mp4')) {
    validationError('决赛背景视频只收 MP4', 'filename')
  }
  const config = cosConfig()
  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Storage not configured',
      data: { code: 'STORAGE_NOT_CONFIGURED', message: '还没配对象存储，决赛视频暂时传不了' }
    })
  }
  const key = newAccompanimentKey(config, 'mp4')
  return {
    key,
    uploadUrl: presignCosPut(config, key, 'video/mp4', 900),
    expiresIn: 900
  }
}

/** 直传完成后把视频 key 写回这首歌，并同步到第一轮/第二轮实际使用的出场记录。 */
export async function saveFinalSongVideoByThreeFactors(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string },
  slot: 1 | 2,
  key: string,
  reportedSize: number
): Promise<CompetitionFinalSongsState> {
  const { singer, eventRow, finalRound, final2Round, entry } = finalSongContext(client, contentId, input)
  const reason = finalSongLockReason(client, finalRound, final2Round, entry)
  if (reason) conflictError('COMPETITION_FINAL_SONGS_LOCKED', reason)
  const songs = readFinalSongs(client, eventRow.id, singer.id)
  const row = slot === 1 ? songs.first : songs.second
  if (!row) conflictError('SONG_REQUIRED', '先提交两首歌，再给每首歌上传背景视频')
  if (accompanimentExtension(key) !== 'mp4') {
    validationError('决赛背景视频只收 MP4', 'key')
  }
  const config = cosConfig()
  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Storage not configured',
      data: { code: 'STORAGE_NOT_CONFIGURED', message: '还没配对象存储，决赛视频暂时传不了' }
    })
  }
  const head = await headCosObject(config, key)
  if (!head) validationError('没有找到刚上传的视频，请重新传一次', 'key')
  if (head.size <= 0 || head.size > 500 * 1024 * 1024) {
    validationError('视频大小需要在 500MB 以内', 'key')
  }
  const contentType = (head.contentType || '').split(';')[0]!.trim().toLowerCase()
  if (contentType && contentType !== 'video/mp4' && contentType !== 'application/octet-stream' && contentType !== 'binary/octet-stream') {
    validationError('上传的文件不是 MP4 视频', 'key')
  }
  if (Math.abs(head.size - reportedSize) > 1024 * 1024) {
    validationError('视频大小对不上，请重新上传', 'size')
  }
  const name = accompanimentDisplayName(singer.name, row.song, 'mp4')
  const now = Date.now()
  client.db.transaction((transaction) => {
    transaction.update(competitionFinalSongs)
      .set({
        videoUrl: `cos:${key}`,
        videoName: name,
        videoSize: head.size,
        videoUpdatedAt: now,
        updatedAt: now
      })
      .where(and(
        eq(competitionFinalSongs.eventId, eventRow.id),
        eq(competitionFinalSongs.singerId, singer.id),
        eq(competitionFinalSongs.slot, slot)
      )).run()
    const targetRoundId = slot === 1 ? finalRound.id : final2Round?.id
    if (targetRoundId) {
      transaction.update(competitionRoundEntries)
        .set({
          accompanimentUrl: `cos:${key}`,
          accompanimentName: name,
          accompanimentSize: head.size,
          accompanimentUpdatedAt: now,
          originalUrl: null,
          originalName: null,
          originalSize: null
        })
        .where(and(
          eq(competitionRoundEntries.roundId, targetRoundId),
          eq(competitionRoundEntries.singerId, singer.id)
        )).run()
    }
  })
  return getFinalSongEditor(client, contentId, input)
}

/**
 * 后台代替选手定决赛两首歌：管理员可以改任何一位决赛选手的曲目与顺序，
 * 但仍然走同一套查重/锁定/版本校验，避免把选手刚提交的内容静默覆盖。
 */
export function setFinalSongsByAdmin(
  client: DatabaseClient,
  contentId: string,
  input: { singerId: string, firstSong: string, secondSong: string, revision?: number }
): { revision: number } {
  const eventRow = ensureCompetitionEvent(client, contentId)
  const finalRound = getRoundByKeySafe(client, eventRow.id, 'final')
  if (!finalRound) conflictError('COMPETITION_LOOKUP_NOT_FOUND', '决赛还没建好，等组委会通知')
  if (finalRound.status === 'closed') conflictError('ROUND_CLOSED', '决赛第一轮已经结束，两首歌已锁定')
  const final2Round = getRoundByKeySafe(client, eventRow.id, 'final2')
  if (final2Round && countRoundScores(client, final2Round.id) > 0) {
    conflictError('COMPETITION_FINAL_SONGS_LOCKED', '决赛第二轮已经开始评分，两首歌已锁定')
  }

  const singer = client.db.select().from(competitionSingers)
    .where(and(
      eq(competitionSingers.id, input.singerId),
      eq(competitionSingers.eventId, eventRow.id)
    ))
    .get()
  if (!singer) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Singer not found',
      data: { code: 'SINGER_NOT_FOUND', message: '没找到这位选手' }
    })
  }
  const entry = client.db.select().from(competitionRoundEntries)
    .where(and(
      eq(competitionRoundEntries.roundId, finalRound.id),
      eq(competitionRoundEntries.singerId, singer.id)
    ))
    .get()
  if (!entry) validationError('该选手不在决赛名单里', 'singerId')

  const { firstSong, secondSong } = cleanFinalSongPair(singer.name, input)
  assertFinalSongAvailable(client, eventRow.id, singer.id, firstSong)
  assertFinalSongAvailable(client, eventRow.id, singer.id, secondSong)

  const expectedRevision = input.revision
  const revision = client.db.transaction((transaction): number => {
    const rows = transaction.select().from(competitionFinalSongs)
      .where(and(
        eq(competitionFinalSongs.eventId, eventRow.id),
        eq(competitionFinalSongs.singerId, singer.id)
      ))
      .all()
    const currentRevision = Math.max(0, ...rows.map(row => Number(row.version ?? 0)))
    if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
      conflictError('COMPETITION_FINAL_SONGS_CONFLICT', '这两首歌刚被更新过，请刷新后台确认后再改')
    }
    const now = Date.now()
    const nextRevision = currentRevision + 1
    for (const [slot, song] of [[1, firstSong], [2, secondSong]] as const) {
      const existing = rows.find(row => row.slot === slot)
      if (existing) {
        transaction.update(competitionFinalSongs)
          .set({ song, version: nextRevision, updatedAt: now })
          .where(eq(competitionFinalSongs.id, existing.id)).run()
      } else {
        transaction.insert(competitionFinalSongs).values({
          id: randomUUID(),
          eventId: eventRow.id,
          singerId: singer.id,
          slot,
          song,
          version: nextRevision,
          createdAt: now,
          updatedAt: now
        }).run()
      }
    }
    transaction.update(competitionRoundEntries).set({ song: firstSong })
      .where(eq(competitionRoundEntries.id, entry.id)).run()
    if (final2Round) {
      transaction.update(competitionRoundEntries).set({ song: secondSong })
        .where(and(
          eq(competitionRoundEntries.roundId, final2Round.id),
          eq(competitionRoundEntries.singerId, singer.id)
        )).run()
    }
    return nextRevision
  })

  return { revision }
}

function serializeAccompaniment(row: unknown): CompetitionEntryAccompaniment | null {
  const source = (row ?? {}) as {
    accompanimentUrl?: string | null
    accompanimentName?: string | null
    accompanimentSize?: number | null
    originalUrl?: string | null
    originalName?: string | null
    originalSize?: number | null
  }
  const url = String(source.accompanimentUrl ?? '').trim()
  if (!url) return null
  // 存的是 cos:<objectKey>，读的时候换成 6 小时有效的临时地址（桶是私有读）
  const config = cosConfig()
  const key = url.startsWith('cos:') ? url.slice(4) : ''
  const displayName = String(source.accompanimentName ?? '').trim()
  const isVideo = displayName.toLowerCase().endsWith('.mp4')
  const playable = key && config
    ? presignCosGet(config, key, 6 * 60 * 60, isVideo ? 'video/mp4' : contentTypeForName(displayName, key))
    : url
  const originalUrl = String(source.originalUrl ?? '').trim()
  const originalName = String(source.originalName ?? '').trim()
  let original: CompetitionEntryAccompaniment['original'] = null
  if (originalUrl && originalName) {
    const originalKey = originalUrl.startsWith('cos:') ? originalUrl.slice(4) : ''
    original = {
      name: originalName,
      url: originalKey && config ? presignCosGet(config, originalKey, 6 * 60 * 60, contentTypeForName(originalName, originalKey)) : originalUrl,
      size: source.originalSize ?? null
    }
  }
  return {
    name: displayName || url.split('/').at(-1) || '伴奏',
    url: playable,
    size: source.accompanimentSize ?? null,
    original
  }
}

/** 存伴奏：原样落盘到共享上传目录，走 /uploads/ 的 CDN 缓存；重传就换新文件名。 */
export async function setEntryAccompaniment(
  client: DatabaseClient,
  round: RoundRow,
  entryId: string,
  file: { filename: string, data: Uint8Array }
): Promise<CompetitionEntryAccompaniment> {
  if (round.status === 'closed') conflictError('ROUND_CLOSED', '本轮已结束，不能再改伴奏')
  if (round.key === 'final' || round.key === 'final2') {
    conflictError('COMPETITION_FINAL_VIDEO_DEDICATED', '决赛两首歌的背景视频，请到「决赛两首歌」页面分别上传')
  }
  const entry = listRoundEntryRows(client, round.id).find(item => item.id === entryId)
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'Entry not found', data: { code: 'ENTRY_NOT_FOUND', message: '没找到这条出场记录' } })
  }
  const singer = client.db.select().from(competitionSingers)
    .where(eq(competitionSingers.id, entry.singerId)).get()
  let data = file.data
  let sniffed = detectUploadedAudioType(data)
  const originalData = data
  const originalExtension = sniffed || 'bin'
  // 微信里 m4a / wav / flac 常放不出来，后台代传也统一转 mp3；原件另存一份给导调用。
  let keptOriginal = false
  if (sniffed && sniffed !== 'mp3') {
    const mp3 = await transcodeToMp3(data, sniffed)
    if (mp3) {
      data = mp3
      keptOriginal = true
      sniffed = 'mp3'
    }
  }
  const stored = await storeUploadedAudio(data)
  const fromFilename = cleanSongTitle(songTitleFromFilename(file.filename), singer?.name ?? '')
  const currentSong = cleanSongTitle(entry.song ?? '', singer?.name ?? '')
  const songValue = currentSong || fromFilename || cleanSongTitle(singer?.song ?? '', singer?.name ?? '')
  const name = accompanimentDisplayName(
    singer?.name ?? '',
    songValue,
    sniffed || accompanimentExtension(stored.url)
  )
  if (currentSong || fromFilename) {
    const pending = currentSong || fromFilename
    if (pending !== (entry.song ?? '').trim()) {
      assertSongNotRepeated(client, round.eventId, entry.singerId, pending, round.id)
    }
  }
  let originalUrl: string | null = null
  let originalName: string | null = null
  let originalSize: number | null = null
  if (keptOriginal) {
    const config = cosConfig()
    if (config) {
      const key = newAccompanimentKey(config, originalExtension)
      await putCosObject(config, key, originalData, contentTypeForKey(key))
      originalUrl = `cos:${key}`
    } else {
      const fallback = await storeUploadedAudio(originalData)
      originalUrl = fallback.url
    }
    originalName = accompanimentDisplayName(singer?.name ?? '', songValue, originalExtension)
    originalSize = originalData.byteLength
  }
  client.db.update(competitionRoundEntries)
    .set({
      // 后台代传时如果这一轮还没曲目，就用文件名里的歌名补上，避免「有伴奏没歌」。
      song: currentSong || fromFilename || null,
      accompanimentUrl: stored.url,
      accompanimentName: name,
      accompanimentSize: stored.size,
      accompanimentUpdatedAt: Date.now(),
      originalUrl,
      originalName,
      originalSize
    })
    .where(eq(competitionRoundEntries.id, entryId))
    .run()
  return {
    name,
    url: stored.url,
    size: stored.size,
    original: originalUrl && originalName ? { name: originalName, url: originalUrl, size: originalSize } : null
  }
}

/**
 * 曲目名统一成干净歌名：去掉书名号、去掉文件名里常见的尾巴
 * （`- 徐佳莹`、`(伴奏)`、`【纯音乐】`），去掉选手自己加在前后缀上的名字。
 * 选手自己填/上传的文件名五花八门，落库前一律走这里。
 */
export function cleanSongTitle(value: string, singerName = ''): string {
  let title = String(value ?? '')
  title = title.replace(/\.[a-z0-9]{2,5}$/i, ' ')
  title = title.replace(/[《》]/g, '')
  title = title.replace(/[（(【[]\s*(伴奏|纯音乐|消音|和声|karaoke|instrumental)[^）)】\]]*[）)】\]]/gi, ' ')
  title = title.replace(/(伴奏版?|纯音乐|消音版|和声版|karaoke|instrumental)/gi, ' ')
  // 「歌名 - 歌手」「歌名—歌手」「歌名－歌手」：真人选手不会在曲目里写自己的名字，所以尾巴一律当歌手名去掉
  title = title.replace(/\s*[-–—－~〜]\s*[^-–—－~〜]{1,20}$/u, ' ')
  const name = String(singerName || '').trim()
  if (name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    title = title.replace(new RegExp(`^${escaped}[\\s、,，.。:：]*`, 'u'), ' ')
    title = title.replace(new RegExp(`[\\s、,，.。:：]*${escaped}$`, 'u'), ' ')
  }
  return title.replace(/\s+/g, ' ').trim()
}

/**
 * 伴奏在后台的展示名统一成「姓名《曲目》.扩展名」：现场按名单找人时一眼对上，
 * 不管选手传上来的原始文件名有多乱。
 */
export function accompanimentDisplayName(singerName: string, song: string, extension: string): string {
  const cleanName = String(singerName || '').trim()
  const cleanSong = cleanSongTitle(song, cleanName)
  const cleanExt = String(extension || '').replace(/^\./, '').toLowerCase()
  const base = cleanSong ? `${cleanName}《${cleanSong}》` : cleanName
  return cleanExt ? `${base}.${cleanExt}` : base
}

/**
 * 从上传文件名里猜曲目名：`世界赠予(伴奏).mp3` → `世界赠予`。
 * 用于「换了歌只换了文件、曲目输入框没改」的场景，猜不出来就回空串。
 */
export function songTitleFromFilename(filename: string): string {
  const base = String(filename || '').split('/').at(-1) || ''
  let title = base.replace(/\.[a-z0-9]{2,5}$/i, '')
  title = title.replace(/[（(【[]\s*(伴奏|纯音乐|消音|和声|karaoke|instrumental)[^）)】\]]*[）)】\]]/gi, '')
  title = title.replace(/(伴奏|纯音乐|消音版|和声版|karaoke|instrumental)/gi, '')
  title = title.replace(/[_]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  title = title.replace(/^[\s\-–—.、]+|[\s\-–—.、]+$/g, '').trim()
  const generic = /^(伴奏|音乐|未知|无名|未命名|audio|track|录音|新录音|demo)$/i
  if (!title || title.length < 2 || title.length > 40 || generic.test(title)) return ''
  return title
}

function accompanimentExtension(source: string): string {
  const value = String(source || '').split('?')[0] ?? ''
  const match = value.match(/\.([a-z0-9]{2,5})$/i)
  return match ? match[1]!.toLowerCase() : 'mp3'
}

/** 三要素定位到「这一轮要传伴奏的那条出场记录」，直传与普通上传共用。 */
export function resolveAccompanimentTarget(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string }
): { round: RoundRow, entryId: string, singerName: string } {
  const { singer, eventRow } = singerByThreeFactors(client, contentId, input)
  const stage = songStage(client, eventRow.id, singer.id)
  if (!stage.editable || !stage.targetEntryId) {
    conflictError('COMPETITION_SONG_LOCKED', stage.reason || '现在还不能传伴奏')
  }
  const rounds = client.db.select().from(competitionRounds)
    .where(eq(competitionRounds.eventId, eventRow.id)).all()
  const round = rounds.find(item => item.id === client.db.select({ roundId: competitionRoundEntries.roundId })
    .from(competitionRoundEntries)
    .where(eq(competitionRoundEntries.id, stage.targetEntryId!))
    .get()?.roundId)
  if (!round) {
    throw createError({ statusCode: 404, statusMessage: 'Entry not found', data: { code: 'ENTRY_NOT_FOUND', message: '没找到这一轮的出场记录' } })
  }
  return { round, entryId: stage.targetEntryId, singerName: singer.name }
}

/** 直传完成后把 object key 记到出场记录上（url 存 cos:<key>，读时换成临时地址）。 */
/** 从 COS 取回 → 转 mp3 → 传回同一个桶，返回新的 key 与大小；失败回 null。 */
async function transcodeCosObjectToMp3(config: CosConfig, key: string): Promise<{ key: string, size: number } | null> {
  try {
    const response = await fetch(presignCosGet(config, key, 600))
    if (!response.ok) return null
    const source = new Uint8Array(await response.arrayBuffer())
    const extension = (key.split('.').at(-1) || 'bin').toLowerCase()
    const mp3 = await transcodeToMp3(source, extension)
    if (!mp3 || mp3.byteLength === 0) return null
    const nextKey = newAccompanimentKey(config, 'mp3')
    await putCosObject(config, nextKey, mp3, 'audio/mpeg')
    return { key: nextKey, size: mp3.byteLength }
  } catch {
    return null
  }
}

/** 读 COS 对象前 16 字节判断真实容器（客户端给的扩展名不可信）。 */
async function sniffCosAudioExtension(key: string): Promise<string | null> {
  const config = cosConfig()
  if (!config) return null
  try {
    const response = await fetch(presignCosGet(config, key, 120), { headers: { Range: 'bytes=0-15' } })
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    return detectUploadedAudioType(bytes)
  } catch {
    return null
  }
}

export async function commitAccompanimentKey(
  client: DatabaseClient,
  round: RoundRow,
  entryId: string,
  file: { key: string, name: string, size: number },
  song?: string
): Promise<CompetitionEntryAccompaniment> {
  if (round.status === 'closed') conflictError('ROUND_CLOSED', '本轮已结束，不能再改伴奏')
  if (round.key === 'final' || round.key === 'final2') {
    conflictError('COMPETITION_FINAL_VIDEO_DEDICATED', '决赛两首歌的背景视频，请到「决赛两首歌」页面分别上传')
  }
  const entry = listRoundEntryRows(client, round.id).find(item => item.id === entryId)
  const singer = entry
    ? client.db.select().from(competitionSingers).where(eq(competitionSingers.id, entry.singerId)).get()
    : null
  const entrySong = cleanSongTitle(entry?.song ?? '', singer?.name ?? '')
  const incoming = cleanSongTitle((song ?? '').trim() || songTitleFromFilename(file.name), singer?.name ?? '')
  // 曲目必填：这一轮没有曲目、这次也没一起提交，就不许存伴奏（否则名单里会出现「有伴奏没歌」）。
  if (!entrySong && !incoming) {
    conflictError('SONG_REQUIRED', '先把这一轮的曲目填上，再传伴奏')
  }
  const songValue = incoming || entrySong
  let sourceKey = file.key
  let sourceSize = file.size
  const originalKey = file.key
  const originalSize = file.size
  const originalExtension = accompanimentExtension(file.key)
  let sniffed = await sniffCosAudioExtension(file.key)
  // 微信内置浏览器放不出 m4a / wav / flac，统一转成 mp3 再存（ffmpeg 不在就保留原文件）。
  if (sniffed && sniffed !== 'mp3') {
    const config = cosConfig()
    if (config) {
      const normalized = await transcodeCosObjectToMp3(config, file.key)
      if (normalized) {
        sourceKey = normalized.key
        sourceSize = normalized.size
        sniffed = 'mp3'
      }
    }
  }
  const name = accompanimentDisplayName(
    singer?.name ?? '',
    songValue || singer?.song || '',
    sniffed || accompanimentExtension(file.key)
  )
  if (songValue && songValue !== entrySong) {
    assertSongNotRepeated(client, round.eventId, entry?.singerId ?? '', songValue, round.id)
  }
  // 转码前的原始文件单独留档：导出伴奏包时按「原来上传的」给现场用。
  const keptOriginal = sourceKey !== originalKey
  client.db.update(competitionRoundEntries)
    .set({
      song: songValue,
      accompanimentUrl: `cos:${sourceKey}`,
      accompanimentName: name,
      accompanimentSize: sourceSize,
      accompanimentUpdatedAt: Date.now(),
      originalUrl: keptOriginal ? `cos:${originalKey}` : null,
      originalName: keptOriginal
        ? accompanimentDisplayName(singer?.name ?? '', songValue || singer?.song || '', originalExtension)
        : null,
      originalSize: keptOriginal ? originalSize : null
    })
    .where(eq(competitionRoundEntries.id, entryId))
    .run()
  if (incoming && entry) {
    client.db.update(competitionSingers).set({ song: incoming }).where(eq(competitionSingers.id, entry.singerId)).run()
  }
  const config = cosConfig()
  return { name, url: config ? presignCosGet(config, sourceKey) : `cos:${sourceKey}`, size: sourceSize }
}

/** 某一轮出场记录上已经填的曲目（去掉首尾空格，空串表示还没填）。 */
export function entrySongOf(client: DatabaseClient, entryId: string): string {
  const row = client.db.select({ song: competitionRoundEntries.song })
    .from(competitionRoundEntries)
    .where(eq(competitionRoundEntries.id, entryId))
    .get()
  return (row?.song ?? '').trim()
}

/** 选手自己传伴奏：三要素定位，只有确认晋级的这一轮能传；不传也能交曲目。 */
export async function submitAccompanimentByThreeFactors(
  client: DatabaseClient,
  contentId: string,
  input: { name?: string, studentNo?: string, contact?: string },
  file: { filename: string, data: Uint8Array },
  song?: string
): Promise<CompetitionSongFormState> {
  const { singer, eventRow } = singerByThreeFactors(client, contentId, input)
  const stage = songStage(client, eventRow.id, singer.id)
  if (!stage.editable || !stage.targetEntryId) {
    conflictError('COMPETITION_SONG_LOCKED', stage.reason || '现在还不能传伴奏')
  }
  const rounds = client.db.select().from(competitionRounds)
    .where(eq(competitionRounds.eventId, eventRow.id)).all()
  const round = rounds.find(item => item.id === client.db.select({ roundId: competitionRoundEntries.roundId })
    .from(competitionRoundEntries)
    .where(eq(competitionRoundEntries.id, stage.targetEntryId!))
    .get()?.roundId)
  if (!round) {
    throw createError({ statusCode: 404, statusMessage: 'Entry not found', data: { code: 'ENTRY_NOT_FOUND', message: '没找到这一轮的出场记录' } })
  }
  if (round.key === 'final' || round.key === 'final2') {
    conflictError('COMPETITION_FINAL_VIDEO_DEDICATED', '决赛两首歌的背景视频，请到「决赛两首歌」页面分别上传')
  }
  const incoming = (song ?? '').trim()
  if (incoming) {
    client.db.update(competitionRoundEntries).set({ song: incoming })
      .where(eq(competitionRoundEntries.id, stage.targetEntryId)).run()
    client.db.update(competitionSingers).set({ song: incoming })
      .where(eq(competitionSingers.id, singer.id)).run()
  }
  if (!entrySongOf(client, stage.targetEntryId)) {
    conflictError('SONG_REQUIRED', '先把这一轮的曲目填上，再传伴奏')
  }
  await setEntryAccompaniment(client, round, stage.targetEntryId, file)
  return getSongEditor(client, contentId, input)
}

/** 后台导出伴奏：按出场顺序，一人一个文件夹（含曲目.txt）。 */
/**
 * 流式版本：一次只把一个伴奏读进内存写进 zip 文件，原件包（~500MB）不会把进程撑爆。
 * 返回 zip 的落盘路径与大小，由调用方上传到对象存储后删掉。
 */
export async function buildAccompanimentArchiveToFile(
  client: DatabaseClient,
  round: RoundRow,
  options: { useOriginal?: boolean, targetPath: string, onProgress?: (done: number, total: number) => void }
): Promise<{ filename: string, size: number }> {
  const useOriginal = options.useOriginal === true
  const entries = [...listRoundEntryRows(client, round.id)].sort((left, right) => left.sortOrder - right.sortOrder)
  const singers = listSingers(client, round.eventId)
  const singerById = new Map(singers.map(singer => [singer.id, singer]))
  const directory = uploadDirectory()
  const config = cosConfig()
  const zip = new StreamingZip(options.targetPath)
  let index = 0
  options.onProgress?.(0, entries.length)
  for (const entry of entries) {
    index += 1
    const singer = singerById.get(entry.singerId)
    if (!singer) continue
    const position = entry.sortOrder > 0 ? entry.sortOrder : index
    const folder = `${String(position).padStart(2, '0')}-${sanitizePathPart(singer.name)}`
    const song = ((entry.song ?? '').trim() || (singer.song ?? '').trim() || '未选曲')
    await zip.add(
      `${folder}/曲目.txt`,
      new TextEncoder().encode(`出场序：${position}\n姓名：${singer.name}\n曲目：${song}\n班级：${singer.className ?? ''}\n`)
    )
    const originalRow = entry as { originalUrl?: string | null, originalName?: string | null }
    const originalUrl = (originalRow.originalUrl ?? '').trim()
    const usingOriginal = useOriginal && Boolean(originalUrl)
    const url = (usingOriginal ? originalUrl : (entry.accompanimentUrl ?? '')).trim()
    if (!url) continue
    const extension = url.split('.').at(-1)?.toLowerCase() || 'mp3'
    const cosKey = url.startsWith('cos:') ? url.slice(4) : ''
    const storedName = (usingOriginal ? (originalRow.originalName ?? '').trim() : (entry.accompanimentName ?? '').trim())
    const displayName = storedName && !storedName.toLowerCase().endsWith(`.${extension}`)
      ? storedName.replace(/\.[a-z0-9]{2,5}$/i, '') + `.${extension}`
      : storedName
    const fileName = displayName || accompanimentDisplayName(singer.name, song, extension)
    try {
      const data = cosKey && config
        ? new Uint8Array(await (await fetch(presignCosGet(config, cosKey, 900))).arrayBuffer())
        : await readFile(join(directory, url.split('/').at(-1) ?? ''))
      await zip.add(`${folder}/${sanitizeFileName(fileName)}`, data)
    } catch {
      await zip.add(`${folder}/伴奏缺失.txt`, new TextEncoder().encode('文件读取失败，让选手重新上传一次。\n'))
    }
    options.onProgress?.(index, entries.length)
  }
  const size = await zip.finish()
  return {
    filename: `competition-${round.key}-accompaniment${useOriginal ? '-original' : ''}-${Math.floor(Date.now() / 1000)}.zip`,
    size
  }
}

export async function buildAccompanimentArchive(
  client: DatabaseClient,
  round: RoundRow,
  options: { useOriginal?: boolean } = {}
): Promise<{ filename: string, data: Buffer }> {
  const useOriginal = options.useOriginal === true
  const entries = [...listRoundEntryRows(client, round.id)].sort((left, right) => left.sortOrder - right.sortOrder)
  const singers = listSingers(client, round.eventId)
  const singerById = new Map(singers.map(singer => [singer.id, singer]))
  const directory = uploadDirectory()
  const files: { name: string, data: Uint8Array }[] = []
  let index = 0
  for (const entry of entries) {
    index += 1
    const singer = singerById.get(entry.singerId)
    if (!singer) continue
    // 编号用后台抽签后的出场序号，抽签完重新导出就是新顺序
    const position = entry.sortOrder > 0 ? entry.sortOrder : index
    const folder = `${String(position).padStart(2, '0')}-${sanitizePathPart(singer.name)}`
    const song = ((entry.song ?? '').trim() || (singer.song ?? '').trim() || '未选曲')
    files.push({
      name: `${folder}/曲目.txt`,
      data: new TextEncoder().encode(`出场序：${position}\n姓名：${singer.name}\n曲目：${song}\n班级：${singer.className ?? ''}\n`)
    })
    const originalRow = entry as {
      originalUrl?: string | null
      originalName?: string | null
    }
    const originalUrl = (originalRow.originalUrl ?? '').trim()
    const usingOriginal = useOriginal && Boolean(originalUrl)
    const url = (usingOriginal ? originalUrl : (entry.accompanimentUrl ?? '')).trim()
    if (!url) continue
    const extension = url.split('.').at(-1)?.toLowerCase() || 'mp3'
    const cosKey = url.startsWith('cos:') ? url.slice(4) : ''
    const config = cosConfig()
    // 文件统一按 `姓名《曲目》.扩展名` 命名，原件与 mp3 都一样，拷到设备上无需再改。
    const storedName = (usingOriginal
      ? (originalRow.originalName ?? '').trim()
      : (entry.accompanimentName ?? '').trim())
    const displayName = storedName && !storedName.toLowerCase().endsWith(`.${extension}`)
      ? storedName.replace(/\.[a-z0-9]{2,5}$/i, '') + `.${extension}`
      : storedName
    const fileName = displayName || accompanimentDisplayName(singer.name, song, extension)
    try {
      const data = cosKey && config
        ? new Uint8Array(await (await fetch(presignCosGet(config, cosKey, 900))).arrayBuffer())
        : await readFile(join(directory, url.split('/').at(-1) ?? ''))
      files.push({ name: `${folder}/${sanitizeFileName(fileName)}`, data })
    } catch {
      files.push({
        name: `${folder}/伴奏缺失.txt`,
        data: new TextEncoder().encode('文件读取失败，让选手重新上传一次。\n')
      })
    }
  }
  return {
    filename: `competition-${round.key}-accompaniment${useOriginal ? '-original' : ''}-${Math.floor(Date.now() / 1000)}.zip`,
    data: createZip(files)
  }
}

function sanitizePathPart(value: string): string {
  const cleaned = (value || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '').slice(0, 40)
  return cleaned || '未命名'
}

/** 只去掉文件系统不认的字符，保留空格与书名号，文件名不动歌名原样。 */
function sanitizeFileName(value: string): string {
  const cleaned = (value || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return cleaned || '伴奏.mp3'
}

export interface CompetitionReminderRecipient {
  name: string
  email: string
  song: string | null
  studentNo: string | null
}

/** 预报名了但初赛没签到的人：按预报名记录反查正式选手与其签到状态。 */
export function buildReminderPlan(
  client: DatabaseClient,
  eventId: string
): { recipients: CompetitionReminderRecipient[], skippedNoEmail: number, skippedCheckedIn: number } {
  const registrations = client.db.select().from(competitionPreRegistrations)
    .where(eq(competitionPreRegistrations.eventId, eventId))
    .all()
  const singers = listSingers(client, eventId)
  const singerByPreId = new Map(
    singers.filter(singer => singer.preRegistrationId).map(singer => [singer.preRegistrationId!, singer])
  )
  const prelim = client.db.select().from(competitionRounds)
    .where(and(eq(competitionRounds.eventId, eventId), eq(competitionRounds.key, 'prelim')))
    .get()
  const entries = prelim ? listRoundEntryRows(client, prelim.id) : []
  const entryBySinger = new Map(entries.map(entry => [entry.singerId, entry]))

  const singerByKey = new Map<string, SingerRow>()
  for (const singer of singers) {
    if (!singer.name) continue
    singerByKey.set(`${singer.name}|${String(singer.studentNo ?? '').slice(-6)}`, singer)
  }

  const recipients: CompetitionReminderRecipient[] = []
  let skippedNoEmail = 0
  let skippedCheckedIn = 0
  for (const registration of registrations) {
    // 已经现场登记过的（无论有没有关联到正式选手）都不再提醒。
    if (registration.registeredAt) {
      skippedCheckedIn += 1
      continue
    }
    const singer = singerByPreId.get(registration.id)
      ?? singerByKey.get(`${registration.name}|${String(registration.studentNo ?? '').slice(-6)}`)
    const entry = singer ? entryBySinger.get(singer.id) : undefined
    if (entry?.checkedInAt) {
      skippedCheckedIn += 1
      continue
    }
    const email = (singer?.email || registration.email || '').trim()
    if (!email) {
      skippedNoEmail += 1
      continue
    }
    recipients.push({
      name: singer?.name ?? registration.name,
      email,
      song: singer?.song ?? registration.song,
      studentNo: singer?.studentNo ?? registration.studentNo
    })
  }
  return { recipients, skippedNoEmail, skippedCheckedIn }
}
