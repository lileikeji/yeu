import { listPublicNotices } from '../../../modules/notices/service'
import { useAppDatabase } from '../../../utils/database'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  return listPublicNotices(event, useAppDatabase(event))
})
