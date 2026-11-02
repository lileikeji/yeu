import { getQuery } from 'h3'
import { listHotSignalEvents } from '../../../../modules/signal/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'

const DEFAULT_LIMIT = 10

export default defineEventHandler((event) => {
  const { limit } = getQuery(event)
  const parsed = Number(limit)
  const size = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_LIMIT
  setPublicCache(event, 30)
  return {
    events: listHotSignalEvents(useAppDatabase(event), size),
    generatedAt: new Date().toISOString()
  }
})
