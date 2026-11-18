import type { TreasurePilotStatus } from '../../../../shared/types/treasure-pilot'
import { readTreasurePilotConfig, readTreasureStamp } from '../../../modules/treasure-pilot/service'
import { useAppDatabase } from '../../../utils/database'
import { getOptionalUserSession } from '../../../utils/user-auth'

export default defineEventHandler((event): TreasurePilotStatus => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = getOptionalUserSession(event, client)
  return {
    enabled: Boolean(readTreasurePilotConfig(useRuntimeConfig(event))),
    authenticated: Boolean(session),
    collectedAt: session ? readTreasureStamp(client, session.user.id) : null
  }
})
