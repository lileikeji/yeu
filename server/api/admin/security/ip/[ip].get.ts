import { getIpSecurityDossier } from '../../../../modules/admin-security/service'
import { requireAdminCapability } from '../../../../utils/auth'
import { useAdminRequest } from '../../../../utils/http'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireAdminCapability(session, 'visitor.raw_ip')
  const ip = decodeURIComponent(getRouterParam(event, 'ip') || '').trim()
  if (!ip) {
    throw createError({ statusCode: 400, statusMessage: 'IP is required' })
  }
  return getIpSecurityDossier(client, ip)
})
