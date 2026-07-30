import { confirmPublicNotice } from '../../../../modules/notices/service'
import { useAppDatabase } from '../../../../utils/database'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { assertTrustedOrigin } from '../../../../utils/security'

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default defineEventHandler((event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const id = getRouterParam(event, 'id') ?? ''
  if (!ID_PATTERN.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid notice id' })
  }
  const client = useAppDatabase(event)
  assertRateLimit(event, `notice-confirm:${getClientIpAddress(event)}`, 20, 60 * 1000, client)
  return confirmPublicNotice(event, client, id)
})
