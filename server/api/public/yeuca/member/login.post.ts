import { memberLoginSchema } from '../../../../../shared/schemas/yeuca'
import { loginYeucaMember } from '../../../../modules/yeuca/member-service'
import { useAppDatabase } from '../../../../utils/database'
import { parseBody } from '../../../../utils/validation'
import { applyYeucaCors, assertYeucaPostOrigin } from '../../../../utils/yeuca-cors'

export default defineEventHandler(async (event) => {
  applyYeucaCors(event)
  assertYeucaPostOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const input = await parseBody(event, memberLoginSchema)
  const result = await loginYeucaMember(event, client, input.account, input.password)
  return {
    authenticated: result.authenticated,
    member: result.member,
    expiresAt: result.expiresAt,
    sessionToken: result.sessionToken
  }
})
