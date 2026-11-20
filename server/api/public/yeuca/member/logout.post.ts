import { logoutYeucaMember } from '../../../../modules/yeuca/member-service'
import { useAppDatabase } from '../../../../utils/database'
import { applyYeucaCors, assertYeucaPostOrigin } from '../../../../utils/yeuca-cors'

export default defineEventHandler((event) => {
  applyYeucaCors(event)
  assertYeucaPostOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  logoutYeucaMember(event, client)
  return { ok: true }
})
