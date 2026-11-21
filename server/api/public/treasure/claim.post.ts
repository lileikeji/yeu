import { handlePublicTreasureClaim, treasureClaimRequestSchema } from '../../../modules/yeuca/treasure-service'
import { useAppDatabase } from '../../../utils/database'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, treasureClaimRequestSchema)
  return handlePublicTreasureClaim(event, client, input, useRuntimeConfig(event))
})
