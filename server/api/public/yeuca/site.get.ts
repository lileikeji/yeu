import { getPublicYeucaSnapshot } from '../../../modules/yeuca/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { applyYeucaCors } from '../../../utils/yeuca-cors'

export default defineEventHandler((event) => {
  applyYeucaCors(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const payload = getPublicYeucaSnapshot(useAppDatabase(event))
  setPublicCache(event, 15)
  return payload
})
