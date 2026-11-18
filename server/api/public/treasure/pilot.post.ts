import type { TreasurePilotResult } from '../../../../shared/types/treasure-pilot'
import {
  awardTreasureStamp,
  checkTreasurePosition,
  matchesTreasureAnswer,
  readTreasurePilotConfig,
  treasurePilotRequestSchema
} from '../../../modules/treasure-pilot/service'
import { useAppDatabase } from '../../../utils/database'
import { assertRateLimit } from '../../../utils/rate-limit'
import { assertTrustedOrigin } from '../../../utils/security'
import { requireUserSession } from '../../../utils/user-auth'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event): Promise<TreasurePilotResult> => {
  assertTrustedOrigin(event)
  const client = useAppDatabase(event)
  const { user } = requireUserSession(event, client, { csrf: true })
  const pilot = readTreasurePilotConfig(useRuntimeConfig(event))
  if (!pilot) throw createError({ statusCode: 503, statusMessage: 'Treasure pilot is closed' })

  const input = await parseBody(event, treasurePilotRequestSchema)
  const isClaim = input.action === 'claim'
  assertRateLimit(event, `treasure-pilot:${input.action}:${user.id}`, isClaim ? 6 : 15, 60_000, client)
  const check = checkTreasurePosition(pilot.point, input.position)
  if (!isClaim || check.status !== 'eligible') return check
  if (!matchesTreasureAnswer(input.answer, pilot.answer)) return { status: 'wrong-answer' }

  return { status: 'collected', collectedAt: awardTreasureStamp(client, user.id) }
})
