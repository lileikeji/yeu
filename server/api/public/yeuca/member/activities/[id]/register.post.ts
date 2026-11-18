import { z } from 'zod'
import { setMemberActivityRegistration } from '../../../../../../modules/yeuca/activity-service'
import { requireYeucaMemberSession } from '../../../../../../modules/yeuca/member-service'
import { useAppDatabase } from '../../../../../../utils/database'
import { parseBody, requireUuidParam } from '../../../../../../utils/validation'
import { applyYeucaCors, assertYeucaPostOrigin } from '../../../../../../utils/yeuca-cors'

const bodySchema = z.object({
  action: z.enum(['register', 'cancel']).default('register'),
  note: z.string().trim().max(200).default('')
})

export default defineEventHandler(async (event) => {
  applyYeucaCors(event)
  assertYeucaPostOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const session = requireYeucaMemberSession(event, client)
  const activityId = requireUuidParam(event)
  const input = await parseBody(event, bodySchema)
  return setMemberActivityRegistration(client, activityId, session.member.id, input.action, input.note)
})
