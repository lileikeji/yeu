import { getRouterParam, setHeader } from 'h3'
import { getSignalEventBySlug } from '../../../modules/signal/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const slug = getRouterParam(event, 'slug') ?? ''
  const detail = getSignalEventBySlug(useAppDatabase(event), slug)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: '事件不存在' })
  }
  setPublicCache(event, 60)
  return detail
})
