import { memberVerifyEligibilitySchema } from '../../../../../shared/schemas/yeuca'
import { verifyMemberEligibility } from '../../../../modules/yeuca/member-service'
import { useAppDatabase } from '../../../../utils/database'
import { parseBody } from '../../../../utils/validation'
import { applyYeucaCors, assertYeucaPostOrigin } from '../../../../utils/yeuca-cors'

export default defineEventHandler(async (event) => {
  applyYeucaCors(event)
  assertYeucaPostOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const input = await parseBody(event, memberVerifyEligibilitySchema)
  return verifyMemberEligibility(event, client, input.studentNo, input.name)
})
