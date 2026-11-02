import { getQuery, setHeader } from 'h3'
import { listHotSignalEvents } from '../../../modules/signal/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'

const DEFAULT_LIMIT = 20

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { limit } = getQuery(event)
  const parsed = Number(limit)
  const size = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_LIMIT
  const payload = {
    events: listHotSignalEvents(useAppDatabase(event), size),
    generatedAt: new Date().toISOString()
  }
  setPublicCache(event, 30)
  return payload
})
