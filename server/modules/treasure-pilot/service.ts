import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  TREASURE_PILOT_RADIUS_METERS,
  type TreasurePosition,
  type TreasurePositionCheck
} from '../../../shared/types/treasure-pilot'
import { haversineMeters } from '../../../shared/utils/bus-route-progress'
import type { DatabaseClient } from '../../database/client'
import { treasureStamps } from '../../database/schema'

const PILOT_POINT_ID = 'rainbow-bridge'
const MAX_ACCURACY_METERS = 12
const MAX_POSITION_AGE_MS = 30_000
const MAX_CLOCK_SKEW_MS = 5_000
const longitude = z.number().min(-180).max(180)
const latitude = z.number().min(-90).max(90)
const normalizedAnswer = (answer: string) => answer.normalize('NFKC').trim()
const configText = (value: unknown) => {
  if (typeof value === 'string') return value.trim()
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

const positionSchema = z.strictObject({
  lng: longitude,
  lat: latitude,
  accuracy: z.number().nonnegative(),
  timestamp: z.number().nonnegative()
})

export const treasurePilotRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('check'), position: positionSchema }),
  z.strictObject({
    action: z.literal('claim'),
    position: positionSchema,
    answer: z.string().trim().min(1).max(64)
  })
])

export function readTreasurePilotConfig(config: {
  treasurePilotLongitude: unknown
  treasurePilotLatitude: unknown
  treasurePilotAnswer: unknown
}) {
  const lng = configText(config.treasurePilotLongitude)
  const lat = configText(config.treasurePilotLatitude)
  const answer = normalizedAnswer(configText(config.treasurePilotAnswer))
  if (!lng || !lat || !answer || answer.length > 64) return null
  const point = { lng: Number(lng), lat: Number(lat) }
  if (!longitude.safeParse(point.lng).success || !latitude.safeParse(point.lat).success) return null
  return { point, answer }
}

export function checkTreasurePosition(
  point: { lat: number, lng: number },
  position: TreasurePosition,
  now = Date.now()
): TreasurePositionCheck {
  const age = now - position.timestamp
  if (age > MAX_POSITION_AGE_MS || age < -MAX_CLOCK_SKEW_MS) return { status: 'stale' }
  if (position.accuracy > MAX_ACCURACY_METERS) return { status: 'inaccurate' }
  const distance = haversineMeters(point, position)
  const eligible = distance <= TREASURE_PILOT_RADIUS_METERS + 1e-7
  return {
    status: eligible ? 'eligible' : 'outside',
    distanceMeters: (eligible ? Math.round(distance * 10) : Math.ceil(distance * 10)) / 10
  }
}

export function matchesTreasureAnswer(answer: string, expected: string): boolean {
  return normalizedAnswer(answer) === expected
}

export function readTreasureStamp(client: DatabaseClient, userId: string): number | null {
  return client.db.select({ collectedAt: treasureStamps.collectedAt }).from(treasureStamps)
    .where(and(eq(treasureStamps.userId, userId), eq(treasureStamps.pointId, PILOT_POINT_ID)))
    .get()?.collectedAt ?? null
}

export function awardTreasureStamp(client: DatabaseClient, userId: string): number {
  client.db.insert(treasureStamps).values({ userId, pointId: PILOT_POINT_ID, collectedAt: Date.now() })
    .onConflictDoNothing()
    .run()
  const collectedAt = readTreasureStamp(client, userId)
  if (collectedAt === null) throw new Error('Treasure stamp write did not persist')
  return collectedAt
}
