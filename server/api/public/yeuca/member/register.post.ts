import { memberRegisterSchema } from '../../../../../shared/schemas/yeuca'
import { registerYeucaMember } from '../../../../modules/yeuca/member-service'
import { useAppDatabase } from '../../../../utils/database'
import { parseBody } from '../../../../utils/validation'
import { applyYeucaCors, assertYeucaPostOrigin } from '../../../../utils/yeuca-cors'

export default defineEventHandler(async (event) => {
  applyYeucaCors(event)
  assertYeucaPostOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const input = await parseBody(event, memberRegisterSchema)
  const result = await registerYeucaMember(event, client, input)
  setResponseStatus(event, 201)
  return {
    authenticated: result.authenticated,
    member: result.member,
    expiresAt: result.expiresAt,
    sessionToken: result.sessionToken
  }
})
