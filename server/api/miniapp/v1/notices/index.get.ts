import { listPublicNotices } from '../../../../modules/notices/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'

export default defineEventHandler((event) => {
  setPublicCache(event, 30)
  return listPublicNotices(event, useAppDatabase(event))
})
