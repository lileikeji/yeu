import { getIpSecurityDossier } from '../../../../modules/admin-security/service'
import { useAdminRequest } from '../../../../utils/http'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const ip = decodeURIComponent(getRouterParam(event, 'ip') || '').trim()
  if (!ip) {
    throw createError({ statusCode: 400, statusMessage: 'IP is required' })
  }
  return getIpSecurityDossier(client, ip)
})
