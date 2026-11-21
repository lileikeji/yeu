import { yeucaVisitBanSchema } from '../../../../../shared/schemas/yeuca'
import { banYeucaIp, unbanYeucaIp } from '../../../../modules/yeuca/visit-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { requireYeucaChiefScope } from '../../../../utils/yeuca-admin'

/** 封禁 / 解封一个来源 IP。封禁默认 24 小时，过期自动失效。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  requireYeucaChiefScope(client, session)

  const input = await parseBody(event, yeucaVisitBanSchema)

  if (input.action === 'unban') {
    unbanYeucaIp(client, input.ip)
    writeAudit(client, event, {
      actorAdminId: session.admin.id,
      action: 'yeuca.visit.unban',
      entityType: 'yeuca_ip_ban',
      entityId: input.ip,
      details: {}
    })
    return { ok: true, ip: input.ip, banned: false }
  }

  const ban = banYeucaIp(client, {
    ip: input.ip,
    reason: input.reason,
    hours: input.hours ?? 24,
    adminId: session.admin.id
  })
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.visit.ban',
    entityType: 'yeuca_ip_ban',
    entityId: input.ip,
    details: { reason: input.reason, hours: input.hours ?? 24 }
  })
  return { ok: true, ip: ban.ip, banned: true, expiresAt: ban.expiresAt }
})
