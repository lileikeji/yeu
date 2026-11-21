import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import type {
  YeucaTreasureAdminOverview,
  YeucaTreasureClaimResult,
  YeucaTreasureConfigItem,
  YeucaTreasureLeaderboardItem,
  YeucaTreasurePointAdminItem,
  YeucaTreasurePointKind,
  YeucaTreasurePointPublicItem,
  YeucaTreasurePublicActor,
  YeucaTreasurePublicStatePayload,
  YeucaTreasureRegion,
  YeucaTreasureStampRecord
} from '../../../shared/types/yeuca'
import { haversineMeters } from '../../../shared/utils/bus-route-progress'
import { gcj02ToWgs84 } from '../../../shared/utils/coordinate-convert'
import type { DatabaseClient } from '../../database/client'
import {
  yeucaTreasureConfig,
  yeucaTreasurePoints,
  yeucaTreasureStamps
} from '../../database/schema'
import { writeAudit } from '../../utils/audit'
import { assertRateLimit } from '../../utils/rate-limit'
import { assertTrustedOrigin } from '../../utils/security'
import { getOptionalUserSession, requireUserSession } from '../../utils/user-auth'
import {
  assertYeucaDepartmentAccess,
  resolveYeucaScopedDepartment,
  type YeucaAdminScope
} from '../../utils/yeuca-admin'
import { applyYeucaCors, assertYeucaPostOrigin } from '../../utils/yeuca-cors'
import { awardTreasureStamp, readTreasurePilotConfig, readTreasureStamp } from '../treasure-pilot/service'
import { readOptionalYeucaMemberSession } from './member-service'
import {
  CAMPUS_LANDMARK_COORDS,
  DEFAULT_TREASURE_CONFIG,
  DEFAULT_TREASURE_POINTS,
  TREASURE_CHARACTER_OPTIONS
} from './treasure-defaults'

const PILOT_POINT_ID = 'zodiac-bridge'
const LEGACY_PILOT_POINT_ID = 'rainbow-bridge'
const MAX_GPS_ACCURACY_METERS = 35
const MAX_POSITION_AGE_MS = 30_000
const MAX_CLOCK_SKEW_MS = 5_000
const NEW_OLD_SPLIT_LNG = 118.608

export interface TreasureRuntimeHint {
  treasurePilotLongitude?: unknown
  treasurePilotLatitude?: unknown
  treasurePilotAnswer?: unknown
}

const treasurePositionSchema = z.strictObject({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  accuracy: z.number().nonnegative(),
  timestamp: z.number().nonnegative()
})

export const treasureClaimRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('check'),
    pointId: z.string().trim().min(1).max(64),
    position: treasurePositionSchema.optional(),
    trialDistanceMeters: z.number().min(0).max(500).optional()
  }),
  z.strictObject({
    action: z.literal('claim'),
    pointId: z.string().trim().min(1).max(64),
    position: treasurePositionSchema.optional(),
    trialDistanceMeters: z.number().min(0).max(500).optional(),
    answer: z.string().trim().max(64).default('')
  })
])

export type TreasureClaimRequestInput = z.infer<typeof treasureClaimRequestSchema>

function normalizeAnswerText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function answerMatches(submitted: string, expected: string): boolean {
  const actual = normalizeAnswerText(submitted)
  const target = normalizeAnswerText(expected)
  if (!target) return true
  if (actual === target) return true
  if (target === '四' && ['4', '四片', '4片'].includes(actual)) return true
  return false
}

export function computeTreasureRegion(lng: number): YeucaTreasureRegion {
  return lng < NEW_OLD_SPLIT_LNG ? 'new' : 'old'
}

function makePointId(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return `pt-${ascii || 'spot'}-${Date.now().toString(36)}`
}

function normalizeCoordinates(lng: number, lat: number, coordType: 'wgs84' | 'gcj02'): { lng: number, lat: number } {
  if (coordType === 'gcj02') {
    const wgs = gcj02ToWgs84(lng, lat)
    return {
      lng: Number(wgs.longitude.toFixed(7)),
      lat: Number(wgs.latitude.toFixed(7))
    }
  }
  return {
    lng: Number(lng.toFixed(7)),
    lat: Number(lat.toFixed(7))
  }
}

export function ensureYeucaTreasureSeeded(
  client: DatabaseClient,
  runtimeConfig?: TreasureRuntimeHint
): void {
  const now = Date.now()
  const configRow = client.db
    .select()
    .from(yeucaTreasureConfig)
    .where(eq(yeucaTreasureConfig.id, DEFAULT_TREASURE_CONFIG.id))
    .get()

  if (!configRow) {
    client.db.insert(yeucaTreasureConfig).values({
      id: DEFAULT_TREASURE_CONFIG.id,
      enabled: DEFAULT_TREASURE_CONFIG.enabled,
      title: DEFAULT_TREASURE_CONFIG.title,
      subtitle: DEFAULT_TREASURE_CONFIG.subtitle,
      goalCount: DEFAULT_TREASURE_CONFIG.goalCount,
      requireMember: DEFAULT_TREASURE_CONFIG.requireMember,
      updatedByAdminId: null,
      createdAt: now,
      updatedAt: now
    }).onConflictDoNothing().run()
  }

  const existingPointCount = client.sqlite
    .prepare('SELECT count(*) AS c FROM yeuca_treasure_points')
    .get() as { c: number }

  if ((existingPointCount?.c ?? 0) === 0) {
    const pilotOverride = runtimeConfig
      ? readTreasurePilotConfig({
          treasurePilotLongitude: runtimeConfig.treasurePilotLongitude ?? '',
          treasurePilotLatitude: runtimeConfig.treasurePilotLatitude ?? '',
          treasurePilotAnswer: runtimeConfig.treasurePilotAnswer ?? ''
        })
      : null

    client.db.transaction((tx) => {
      for (const seed of DEFAULT_TREASURE_POINTS) {
        const useOverride = seed.id === PILOT_POINT_ID && pilotOverride
        const lng = useOverride ? pilotOverride.point.lng : seed.lng
        const lat = useOverride ? pilotOverride.point.lat : seed.lat
        const answer = useOverride ? pilotOverride.answer : seed.answer
        tx.insert(yeucaTreasurePoints).values({
          id: seed.id,
          name: seed.name,
          alias: seed.alias,
          kind: seed.kind,
          deptName: seed.deptName,
          landmark: seed.landmark,
          room: seed.room,
          region: computeTreasureRegion(lng),
          lng,
          lat,
          radiusMeters: seed.radiusMeters,
          verifyMode: seed.verifyMode,
          clue: seed.clue,
          question: seed.question,
          answer,
          characterKey: seed.characterKey,
          glyph: seed.glyph,
          sortOrder: seed.sortOrder,
          isPublished: true,
          createdByAdminId: null,
          createdAt: now,
          updatedAt: now
        }).onConflictDoNothing().run()
      }
    })
  }
}

function serializeConfig(row: typeof yeucaTreasureConfig.$inferSelect): YeucaTreasureConfigItem {
  return {
    id: row.id,
    enabled: Boolean(row.enabled),
    title: row.title,
    subtitle: row.subtitle,
    goalCount: row.goalCount,
    requireMember: Boolean(row.requireMember),
    updatedAt: new Date(row.updatedAt).toISOString()
  }
}

function serializePointAdmin(
  row: typeof yeucaTreasurePoints.$inferSelect,
  scope: YeucaAdminScope,
  stampCount: number
): YeucaTreasurePointAdminItem {
  const canEdit = scope.isChief || (Boolean(scope.departmentName) && row.deptName === scope.departmentName)
  return {
    id: row.id,
    name: row.name,
    alias: row.alias,
    kind: row.kind,
    deptName: row.deptName,
    landmark: row.landmark,
    room: row.room,
    region: row.region,
    lng: row.lng,
    lat: row.lat,
    radiusMeters: row.radiusMeters,
    verifyMode: row.verifyMode,
    clue: row.clue,
    question: row.question,
    // 防越权泄密：非本部门点位绝不向其他部门部长返回明文暗号
    answer: canEdit ? row.answer : '',
    characterKey: row.characterKey,
    glyph: row.glyph,
    sortOrder: row.sortOrder,
    isPublished: Boolean(row.isPublished),
    canEdit,
    stampCount,
    updatedAt: new Date(row.updatedAt).toISOString()
  }
}

function serializePointPublic(row: typeof yeucaTreasurePoints.$inferSelect): YeucaTreasurePointPublicItem {
  const modeNote = row.verifyMode === 'gps_answer'
    ? `需在 ${row.radiusMeters} 米内手机定位并核对现场暗号`
    : row.verifyMode === 'gps_only'
      ? `需在 ${row.radiusMeters} 米内完成定位打卡`
      : `支持 ${row.radiusMeters} 米定位或站内试玩验证`

  return {
    id: row.id,
    name: row.name,
    alias: row.alias,
    kind: row.kind,
    deptName: row.deptName,
    landmark: row.landmark,
    room: row.room,
    region: row.region,
    point: [row.lng, row.lat],
    radiusMeters: row.radiusMeters,
    verifyMode: row.verifyMode,
    clue: row.clue,
    question: row.question,
    ...(row.characterKey ? { character: row.characterKey } : {}),
    ...(row.glyph ? { glyph: row.glyph } : {}),
    review: {
      evidence: row.deptName === '协会全体' ? '计协寻宝点' : `${row.deptName} · 寻宝点`,
      detail: modeNote
    }
  }
}

export function getAdminYeucaTreasureOverview(
  client: DatabaseClient,
  scope: YeucaAdminScope,
  runtimeConfig?: TreasureRuntimeHint
): YeucaTreasureAdminOverview {
  ensureYeucaTreasureSeeded(client, runtimeConfig)

  const configRow = client.db
    .select()
    .from(yeucaTreasureConfig)
    .where(eq(yeucaTreasureConfig.id, DEFAULT_TREASURE_CONFIG.id))
    .get()!

  const pointRows = client.db
    .select()
    .from(yeucaTreasurePoints)
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)

  const stampRows = client.db
    .select()
    .from(yeucaTreasureStamps)
    .orderBy(desc(yeucaTreasureStamps.collectedAt))
    .all()

  const pointMap = new Map(pointRows.map(p => [p.id, p]))
  const countByPoint = new Map<string, number>()
  const playerAgg = new Map<string, {
    actorType: 'yeuca_member' | 'user'
    actorId: string
    actorLabel: string
    departmentName: string
    stampIds: Set<string>
    finishCollected: boolean
    lastCollectedAt: number
  }>()

  const recentStamps: YeucaTreasureStampRecord[] = []

  for (const row of stampRows) {
    const pt = pointMap.get(row.pointId)
    countByPoint.set(row.pointId, (countByPoint.get(row.pointId) ?? 0) + 1)

    const pointAllowed = scope.isChief || (Boolean(scope.departmentName) && pt?.deptName === scope.departmentName)
    if (pointAllowed && recentStamps.length < 80) {
      recentStamps.push({
        id: row.id,
        pointId: row.pointId,
        pointName: pt?.name || row.pointId,
        deptName: pt?.deptName || '协会全体',
        actorType: row.actorType,
        actorId: row.actorId,
        actorLabel: row.actorLabel || row.actorId,
        verifyMode: row.verifyMode,
        distanceMeters: row.distanceMeters ?? null,
        collectedAt: new Date(row.collectedAt).toISOString()
      })
    }

    if (scope.isChief || pointAllowed) {
      const key = `${row.actorType}:${row.actorId}`
      const cur = playerAgg.get(key) ?? {
        actorType: row.actorType,
        actorId: row.actorId,
        actorLabel: row.actorLabel || row.actorId,
        departmentName: pt?.deptName || '',
        stampIds: new Set<string>(),
        finishCollected: false,
        lastCollectedAt: row.collectedAt
      }
      cur.stampIds.add(row.pointId)
      if (pt?.kind === 'finish') cur.finishCollected = true
      if (row.collectedAt > cur.lastCollectedAt) cur.lastCollectedAt = row.collectedAt
      playerAgg.set(key, cur)
    }
  }

  const points = pointRows.map(row => serializePointAdmin(row, scope, countByPoint.get(row.id) ?? 0))
  const leaderboard: YeucaTreasureLeaderboardItem[] = Array.from(playerAgg.values())
    .map(item => ({
      actorType: item.actorType,
      actorId: item.actorId,
      actorLabel: item.actorLabel,
      departmentName: item.departmentName,
      stampCount: item.stampIds.size,
      finishCollected: item.finishCollected,
      lastCollectedAt: new Date(item.lastCollectedAt).toISOString()
    }))
    .sort((a, b) => b.stampCount - a.stampCount || b.lastCollectedAt.localeCompare(a.lastCollectedAt))
    .slice(0, 50)

  const accessiblePoints = scope.isChief ? pointRows : pointRows.filter(p => p.deptName === scope.departmentName)
  const visibleStampTotal = scope.isChief
    ? stampRows.length
    : stampRows.filter(s => pointMap.get(s.pointId)?.deptName === scope.departmentName).length

  return {
    config: serializeConfig(configRow),
    points,
    recentStamps,
    leaderboard,
    stats: {
      totalPoints: accessiblePoints.length,
      publishedPoints: accessiblePoints.filter(p => p.isPublished).length,
      totalStamps: visibleStampTotal,
      participantCount: playerAgg.size,
      finishCount: leaderboard.filter(item => item.finishCollected).length
    }
  }
}

export function updateYeucaTreasureConfigAdmin(
  client: DatabaseClient,
  event: H3Event,
  adminId: string,
  scope: YeucaAdminScope,
  input: {
    enabled: boolean
    title: string
    subtitle: string
    goalCount: number
    requireMember: boolean
  },
  runtimeConfig?: TreasureRuntimeHint
): YeucaTreasureConfigItem {
  if (!scope.isChief) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Chief privilege required',
      data: { code: 'YEUCA_CHIEF_REQUIRED', message: '仅限总管调整寻宝全局开关' }
    })
  }
  ensureYeucaTreasureSeeded(client, runtimeConfig)

  const now = Date.now()
  client.db
    .update(yeucaTreasureConfig)
    .set({
      enabled: input.enabled,
      title: input.title.trim(),
      subtitle: input.subtitle.trim(),
      goalCount: input.goalCount,
      requireMember: input.requireMember,
      updatedByAdminId: adminId,
      updatedAt: now
    })
    .where(eq(yeucaTreasureConfig.id, DEFAULT_TREASURE_CONFIG.id))
    .run()

  writeAudit(client, event, {
    actorAdminId: adminId,
    action: 'yeuca.treasure.config.update',
    entityType: 'yeuca_treasure_config',
    entityId: DEFAULT_TREASURE_CONFIG.id,
    details: {
      enabled: input.enabled,
      goalCount: input.goalCount,
      requireMember: input.requireMember
    }
  })

  const updated = client.db
    .select()
    .from(yeucaTreasureConfig)
    .where(eq(yeucaTreasureConfig.id, DEFAULT_TREASURE_CONFIG.id))
    .get()!
  return serializeConfig(updated)
}

export interface UpsertTreasurePointInput {
  id?: string
  name: string
  alias: string
  kind: YeucaTreasurePointKind
  deptName: string
  landmark: string
  room: string
  coordType: 'wgs84' | 'gcj02'
  lng: number
  lat: number
  radiusMeters: number
  verifyMode: 'gps_answer' | 'gps_only' | 'answer_or_trial'
  clue: string
  question: string
  answer: string
  characterKey: string
  glyph: string
  sortOrder: number
  isPublished: boolean
}

export function createYeucaTreasurePointAdmin(
  client: DatabaseClient,
  event: H3Event,
  adminId: string,
  scope: YeucaAdminScope,
  input: UpsertTreasurePointInput,
  runtimeConfig?: TreasureRuntimeHint
): YeucaTreasurePointAdminItem {
  ensureYeucaTreasureSeeded(client, runtimeConfig)

  if (!scope.isChief && input.kind === 'finish') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Finish point forbidden for minister',
      data: { code: 'YEUCA_CHIEF_REQUIRED', message: '协会终点点位仅限总管创建与调整' }
    })
  }
  if (input.verifyMode !== 'gps_only' && !input.answer.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Answer required',
      data: { code: 'TREASURE_ANSWER_REQUIRED', message: '需答题/暗号模式必须设置标准暗号或答案' }
    })
  }

  const scopedDept = resolveYeucaScopedDepartment(scope, input.deptName || '协会全体') || '协会全体'
  const id = (input.id || '').trim() || makePointId(input.name)
  const existing = client.db.select().from(yeucaTreasurePoints).where(eq(yeucaTreasurePoints.id, id)).get()
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Point ID already exists',
      data: { code: 'TREASURE_POINT_EXISTS', message: `点位标识「${id}」已存在，请换个名称或标识` }
    })
  }

  const coords = normalizeCoordinates(input.lng, input.lat, input.coordType)
  const region = computeTreasureRegion(coords.lng)
  const now = Date.now()

  client.db.insert(yeucaTreasurePoints).values({
    id,
    name: input.name.trim(),
    alias: input.alias.trim(),
    kind: input.kind,
    deptName: scopedDept,
    landmark: input.landmark.trim(),
    room: input.room.trim(),
    region,
    lng: coords.lng,
    lat: coords.lat,
    radiusMeters: input.radiusMeters,
    verifyMode: input.verifyMode,
    clue: input.clue.trim(),
    question: input.question.trim(),
    answer: input.answer.trim(),
    characterKey: input.characterKey.trim(),
    glyph: input.glyph.trim(),
    sortOrder: input.sortOrder,
    isPublished: input.isPublished,
    createdByAdminId: adminId,
    createdAt: now,
    updatedAt: now
  }).run()

  writeAudit(client, event, {
    actorAdminId: adminId,
    action: 'yeuca.treasure.point.create',
    entityType: 'yeuca_treasure_point',
    entityId: id,
    details: {
      name: input.name.trim(),
      deptName: scopedDept,
      kind: input.kind,
      verifyMode: input.verifyMode,
      lng: coords.lng,
      lat: coords.lat
    }
  })

  const row = client.db.select().from(yeucaTreasurePoints).where(eq(yeucaTreasurePoints.id, id)).get()!
  return serializePointAdmin(row, scope, 0)
}

export function updateYeucaTreasurePointAdmin(
  client: DatabaseClient,
  event: H3Event,
  adminId: string,
  scope: YeucaAdminScope,
  pointId: string,
  input: UpsertTreasurePointInput,
  runtimeConfig?: TreasureRuntimeHint
): YeucaTreasurePointAdminItem {
  ensureYeucaTreasureSeeded(client, runtimeConfig)

  const existing = client.db.select().from(yeucaTreasurePoints).where(eq(yeucaTreasurePoints.id, pointId)).get()
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Treasure point not found',
      data: { code: 'TREASURE_POINT_NOT_FOUND', message: '寻宝点位不存在' }
    })
  }

  assertYeucaDepartmentAccess(scope, existing.deptName, '寻宝点位')

  if (!scope.isChief && (input.kind === 'finish' || existing.kind === 'finish')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Finish point forbidden for minister',
      data: { code: 'YEUCA_CHIEF_REQUIRED', message: '协会终点点位仅限总管调整' }
    })
  }

  const nextAnswer = input.answer.trim() || existing.answer
  if (input.verifyMode !== 'gps_only' && !nextAnswer) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Answer required',
      data: { code: 'TREASURE_ANSWER_REQUIRED', message: '需答题/暗号模式必须保留或填写标准答案' }
    })
  }

  const nextDept = resolveYeucaScopedDepartment(scope, input.deptName || existing.deptName) || existing.deptName
  const coords = normalizeCoordinates(input.lng, input.lat, input.coordType)
  const region = computeTreasureRegion(coords.lng)
  const now = Date.now()

  client.db
    .update(yeucaTreasurePoints)
    .set({
      name: input.name.trim(),
      alias: input.alias.trim(),
      kind: input.kind,
      deptName: nextDept,
      landmark: input.landmark.trim(),
      room: input.room.trim(),
      region,
      lng: coords.lng,
      lat: coords.lat,
      radiusMeters: input.radiusMeters,
      verifyMode: input.verifyMode,
      clue: input.clue.trim(),
      question: input.question.trim(),
      answer: nextAnswer,
      characterKey: input.characterKey.trim(),
      glyph: input.glyph.trim(),
      sortOrder: input.sortOrder,
      isPublished: input.isPublished,
      updatedAt: now
    })
    .where(eq(yeucaTreasurePoints.id, pointId))
    .run()

  writeAudit(client, event, {
    actorAdminId: adminId,
    action: 'yeuca.treasure.point.update',
    entityType: 'yeuca_treasure_point',
    entityId: pointId,
    details: {
      name: input.name.trim(),
      deptName: nextDept,
      verifyMode: input.verifyMode,
      isPublished: input.isPublished,
      lng: coords.lng,
      lat: coords.lat
    }
  })

  const row = client.db.select().from(yeucaTreasurePoints).where(eq(yeucaTreasurePoints.id, pointId)).get()!
  const count = (client.sqlite.prepare('SELECT count(*) AS c FROM yeuca_treasure_stamps WHERE point_id = ?').get(pointId) as { c: number })?.c ?? 0
  return serializePointAdmin(row, scope, count)
}

export function deleteYeucaTreasurePointAdmin(
  client: DatabaseClient,
  event: H3Event,
  adminId: string,
  scope: YeucaAdminScope,
  pointId: string,
  runtimeConfig?: TreasureRuntimeHint
): { deletedId: string } {
  ensureYeucaTreasureSeeded(client, runtimeConfig)

  const existing = client.db.select().from(yeucaTreasurePoints).where(eq(yeucaTreasurePoints.id, pointId)).get()
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Treasure point not found',
      data: { code: 'TREASURE_POINT_NOT_FOUND', message: '寻宝点位不存在' }
    })
  }

  assertYeucaDepartmentAccess(scope, existing.deptName, '寻宝点位')
  if (!scope.isChief && existing.kind === 'finish') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Finish point forbidden for minister',
      data: { code: 'YEUCA_CHIEF_REQUIRED', message: '协会终点点位仅限总管删除' }
    })
  }

  client.db.delete(yeucaTreasurePoints).where(eq(yeucaTreasurePoints.id, pointId)).run()

  writeAudit(client, event, {
    actorAdminId: adminId,
    action: 'yeuca.treasure.point.delete',
    entityType: 'yeuca_treasure_point',
    entityId: pointId,
    details: {
      name: existing.name,
      deptName: existing.deptName
    }
  })

  return { deletedId: pointId }
}

export interface ResolvedTreasureActor {
  actor: YeucaTreasurePublicActor
  actorId: string | null
  hasCsrfSession: boolean
}

export function resolveTreasureActor(
  event: H3Event,
  client: DatabaseClient
): ResolvedTreasureActor {
  const memberSession = readOptionalYeucaMemberSession(event, client)
  if (memberSession) {
    const dept = memberSession.member.department || '计协会员'
    return {
      actor: {
        authenticated: true,
        type: 'yeuca_member',
        label: `${memberSession.member.name} (${memberSession.member.studentNo})`,
        studentNo: memberSession.member.studentNo,
        department: dept
      },
      actorId: memberSession.member.id,
      hasCsrfSession: false
    }
  }

  const userSession = getOptionalUserSession(event, client)
  if (userSession) {
    return {
      actor: {
        authenticated: true,
        type: 'user',
        label: userSession.user.displayName || userSession.user.username
      },
      actorId: userSession.user.id,
      hasCsrfSession: true
    }
  }

  return {
    actor: {
      authenticated: false,
      type: null,
      label: ''
    },
    actorId: null,
    hasCsrfSession: false
  }
}

export function getPublicTreasureState(
  event: H3Event,
  client: DatabaseClient,
  runtimeConfig?: TreasureRuntimeHint
): YeucaTreasurePublicStatePayload {
  ensureYeucaTreasureSeeded(client, runtimeConfig)

  const configRow = client.db
    .select()
    .from(yeucaTreasureConfig)
    .where(eq(yeucaTreasureConfig.id, DEFAULT_TREASURE_CONFIG.id))
    .get()!

  const { actor, actorId } = resolveTreasureActor(event, client)

  const pointRows = client.db
    .select()
    .from(yeucaTreasurePoints)
    .where(eq(yeucaTreasurePoints.isPublished, true))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)

  const collectedMap: Record<string, number> = {}
  if (actor.type && actorId) {
    const stampRows = client.db
      .select({
        pointId: yeucaTreasureStamps.pointId,
        collectedAt: yeucaTreasureStamps.collectedAt
      })
      .from(yeucaTreasureStamps)
      .where(and(
        eq(yeucaTreasureStamps.actorType, actor.type),
        eq(yeucaTreasureStamps.actorId, actorId)
      ))
      .all()
    for (const s of stampRows) {
      collectedMap[s.pointId] = s.collectedAt
    }
    if (actor.type === 'user' && !collectedMap[PILOT_POINT_ID]) {
      const legacy = readTreasureStamp(client, actorId)
      if (legacy) collectedMap[PILOT_POINT_ID] = legacy
    }
  }

  return {
    enabled: Boolean(configRow.enabled),
    title: configRow.title,
    subtitle: configRow.subtitle,
    goalCount: configRow.goalCount,
    requireMember: Boolean(configRow.requireMember),
    actor,
    points: configRow.enabled ? pointRows.map(serializePointPublic) : [],
    collectedMap
  }
}

export function assertTreasureClaimOriginAndSession(
  event: H3Event,
  client: DatabaseClient
): ResolvedTreasureActor {
  applyYeucaCors(event)
  assertYeucaPostOrigin(event)

  const resolved = resolveTreasureActor(event, client)
  // 若采用迎新网普通用户会话，继续校验传统用户 CSRF 令牌，防跨站伪造。
  if (resolved.actor.type === 'user') {
    assertTrustedOrigin(event)
    requireUserSession(event, client, { csrf: true })
  }
  return resolved
}

export function handlePublicTreasureClaim(
  event: H3Event,
  client: DatabaseClient,
  input: TreasureClaimRequestInput,
  runtimeConfig?: TreasureRuntimeHint
): YeucaTreasureClaimResult {
  const resolved = assertTreasureClaimOriginAndSession(event, client)
  ensureYeucaTreasureSeeded(client, runtimeConfig)

  const configRow = client.db
    .select()
    .from(yeucaTreasureConfig)
    .where(eq(yeucaTreasureConfig.id, DEFAULT_TREASURE_CONFIG.id))
    .get()!

  if (!configRow.enabled) {
    return { status: 'closed' }
  }

  const targetId = input.pointId === LEGACY_PILOT_POINT_ID ? PILOT_POINT_ID : input.pointId
  const pointRow = client.db
    .select()
    .from(yeucaTreasurePoints)
    .where(and(
      eq(yeucaTreasurePoints.id, targetId),
      eq(yeucaTreasurePoints.isPublished, true)
    ))
    .get()

  if (!pointRow) {
    return { status: 'not-found' }
  }

  const actorType = resolved.actor.type
  const actorId = resolved.actorId
  const rateIdentity = actorId ? `${actorType}:${actorId}` : 'guest'
  assertRateLimit(
    event,
    `yeuca-treasure:${input.action}:${rateIdentity}`,
    input.action === 'claim' ? 12 : 30,
    60_000,
    client
  )

  if (configRow.requireMember && actorType !== 'yeuca_member') {
    return { status: 'member-required' }
  }

  if ((pointRow.verifyMode === 'gps_answer' || pointRow.verifyMode === 'gps_only') && !actorId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
      data: { code: 'AUTHENTICATION_REQUIRED', message: '请先登录计协会员账号后再参与定位集章' }
    })
  }

  // 检查位置/距离
  let computedDistance: number | null
  if (input.position) {
    const now = Date.now()
    const age = now - input.position.timestamp
    if (age > MAX_POSITION_AGE_MS || age < -MAX_CLOCK_SKEW_MS) {
      return { status: 'stale' }
    }
    if (input.position.accuracy > MAX_GPS_ACCURACY_METERS) {
      return { status: 'inaccurate' }
    }
    const meters = haversineMeters({ lat: pointRow.lat, lng: pointRow.lng }, input.position)
    const eligible = meters <= pointRow.radiusMeters + 1e-7
    computedDistance = (eligible ? Math.round(meters * 10) : Math.ceil(meters * 10)) / 10
    if (!eligible) {
      return { status: 'outside', distanceMeters: computedDistance }
    }
  } else if (pointRow.verifyMode === 'answer_or_trial' && typeof input.trialDistanceMeters === 'number') {
    const d = Math.round(input.trialDistanceMeters * 10) / 10
    computedDistance = d
    if (d > pointRow.radiusMeters) {
      return { status: 'outside', distanceMeters: d }
    }
  } else {
    return { status: 'outside', distanceMeters: pointRow.radiusMeters + 1 }
  }

  if (input.action === 'check') {
    return { status: 'eligible', distanceMeters: computedDistance ?? 0 }
  }

  // 检查是否已收集
  if (actorType && actorId) {
    const existingStamp = client.db
      .select()
      .from(yeucaTreasureStamps)
      .where(and(
        eq(yeucaTreasureStamps.actorType, actorType),
        eq(yeucaTreasureStamps.actorId, actorId),
        eq(yeucaTreasureStamps.pointId, pointRow.id)
      ))
      .get()
    if (existingStamp) {
      return { status: 'collected', collectedAt: existingStamp.collectedAt, pointId: pointRow.id }
    }
  }

  // 终点解锁条件校验
  if (pointRow.kind === 'finish') {
    let earnedCount = 0
    if (actorType && actorId) {
      const stamps = client.db
        .select({ pointId: yeucaTreasureStamps.pointId })
        .from(yeucaTreasureStamps)
        .where(and(
          eq(yeucaTreasureStamps.actorType, actorType),
          eq(yeucaTreasureStamps.actorId, actorId)
        ))
        .all()
      const finishIds = new Set(
        client.db
          .select({ id: yeucaTreasurePoints.id })
          .from(yeucaTreasurePoints)
          .where(eq(yeucaTreasurePoints.kind, 'finish'))
          .all()
          .map(r => r.id)
      )
      earnedCount = stamps.filter(s => !finishIds.has(s.pointId)).length
    }
    if (earnedCount < configRow.goalCount) {
      return { status: 'goal-unmet' }
    }
  }

  // 题目 / 暗号验证
  if (pointRow.verifyMode !== 'gps_only') {
    if (!answerMatches(input.answer, pointRow.answer)) {
      if (actorId) {
        writeAudit(client, event, {
          actorAdminId: null,
          action: 'yeuca.treasure.stamp.failed',
          entityType: 'yeuca_treasure_stamp',
          entityId: pointRow.id,
          details: {
            pointName: pointRow.name,
            deptName: pointRow.deptName,
            actorType,
            actorLabel: resolved.actor.label
          }
        })
      }
      return { status: 'wrong-answer' }
    }
  }

  const collectedAt = Date.now()

  // 已登录账号写入持久化数据库与审计流水
  if (actorType && actorId) {
    client.db.insert(yeucaTreasureStamps).values({
      id: randomUUID(),
      pointId: pointRow.id,
      actorType,
      actorId,
      actorLabel: resolved.actor.label,
      verifyMode: input.position ? pointRow.verifyMode : 'trial',
      distanceMeters: computedDistance,
      lng: input.position?.lng ?? null,
      lat: input.position?.lat ?? null,
      accuracy: input.position?.accuracy ?? null,
      collectedAt
    }).onConflictDoNothing().run()

    if (actorType === 'user' && pointRow.id === PILOT_POINT_ID) {
      awardTreasureStamp(client, actorId)
    }

    writeAudit(client, event, {
      actorAdminId: null,
      action: 'yeuca.treasure.stamp.claim',
      entityType: 'yeuca_treasure_stamp',
      entityId: pointRow.id,
      details: {
        pointName: pointRow.name,
        deptName: pointRow.deptName,
        actorType,
        actorLabel: resolved.actor.label,
        verifyMode: input.position ? pointRow.verifyMode : 'trial',
        distanceMeters: computedDistance
      }
    })
  }

  return { status: 'collected', collectedAt, pointId: pointRow.id }
}

export function getTreasureMetaOptions() {
  return {
    landmarks: CAMPUS_LANDMARK_COORDS,
    characters: TREASURE_CHARACTER_OPTIONS
  }
}
