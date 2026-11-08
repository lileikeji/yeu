import { competitionPreRegisterSchema } from '../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  preRegisterFromForm
} from '../../../modules/competition/service'
import { getClientIpAddress } from '../../../utils/client-ip'
import { useAppDatabase } from '../../../utils/database'
import { assertRateLimit } from '../../../utils/rate-limit'
import { assertTrustedOrigin } from '../../../utils/security'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)

  const ip = getClientIpAddress(event)
  assertRateLimit(event, `competition-pre-register:${ip}`, 5, 60 * 60 * 1000, client)

  const input = await parseBody(event, competitionPreRegisterSchema)
  const contentId = findMusicAssociationContent(client).id
  const result = preRegisterFromForm(client, contentId, input)

  setResponseStatus(event, 201)
  return result
})
