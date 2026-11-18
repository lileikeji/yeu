import { memberChangePasswordSchema } from '../../../../../shared/schemas/yeuca'
import { changeMemberPassword, requireYeucaMemberSession } from '../../../../modules/yeuca/member-service'
import { useAppDatabase } from '../../../../utils/database'
import { parseBody } from '../../../../utils/validation'
import { applyYeucaCors, assertYeucaPostOrigin } from '../../../../utils/yeuca-cors'

export default defineEventHandler(async (event) => {
  applyYeucaCors(event)
  assertYeucaPostOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const session = requireYeucaMemberSession(event, client)
  const input = await parseBody(event, memberChangePasswordSchema)
  const res = await changeMemberPassword(client, session.member.id, input.currentPassword, input.newPassword)
  return {
    ok: true,
    gitSynced: res.gitSynced,
    gitSyncError: res.gitSyncError
  }
})
