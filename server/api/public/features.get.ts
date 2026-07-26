import { getPublicFrontendFeatures } from '../../modules/features/service'
import { useAppDatabase } from '../../utils/database'
import { setPublicCache } from '../../utils/http'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Cloudflare-CDN-Cache-Control', 'no-store')
  const result = getPublicFrontendFeatures(useAppDatabase(event))
  setPublicCache(event, 30)
  return result
})
