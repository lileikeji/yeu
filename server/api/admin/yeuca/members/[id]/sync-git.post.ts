import { syncYeucaMemberGitAdmin } from '../../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { requireUuidParam } from '../../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const member = await syncYeucaMemberGitAdmin(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.sync_git',
    entityType: 'yeuca_member',
    entityId: id,
    details: { gitSynced: member.gitSynced }
  })
  return member
})
