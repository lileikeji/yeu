import { competitionLookupSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  lookupPreRegistrations
} from '../../../../modules/competition/service'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)

  const ip = getClientIpAddress(event)
  assertRateLimit(event, `competition-lookup:${ip}`, 60, 60 * 60 * 1000, client)

  const input = await parseBody(event, competitionLookupSchema)
  const contentId = findMusicAssociationContent(client).id
  return {
    candidates: lookupPreRegistrations(client, contentId, input.name, input.studentNoTail)
  }
})
