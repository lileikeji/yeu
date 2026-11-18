import { memberUpdateProfileSchema } from '../../../../../shared/schemas/yeuca'
import { requireYeucaMemberSession, updateMemberProfile } from '../../../../modules/yeuca/member-service'
import { useAppDatabase } from '../../../../utils/database'
import { parseBody } from '../../../../utils/validation'
import { applyYeucaCors, assertYeucaPostOrigin } from '../../../../utils/yeuca-cors'

export default defineEventHandler(async (event) => {
  applyYeucaCors(event)
  assertYeucaPostOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const session = requireYeucaMemberSession(event, client)
  const input = await parseBody(event, memberUpdateProfileSchema)
  const member = await updateMemberProfile(client, session.member.id, input)
  return { member }
})
