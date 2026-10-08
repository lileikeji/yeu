import { listPublicHomeEntries, getPublicFrontendFeatures } from '../../../modules/features/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'

export default defineEventHandler((event) => {
  const client = useAppDatabase(event)
  setPublicCache(event, 30)
  return {
    features: getPublicFrontendFeatures(client),
    entries: listPublicHomeEntries(client)
  }
})
