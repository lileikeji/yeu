import { getPublicContent } from '../../modules/content/service'
import { useAppDatabase } from '../../utils/database'
import { publicContentRoute } from '../../utils/public-content-route'
import { requireSlugParam } from '../../utils/validation'

export default defineEventHandler((event) => {
  const slug = requireSlugParam(event)
  const content = getPublicContent(useAppDatabase(event), slug)
  setHeader(event, 'Cache-Control', 'public, max-age=3600')
  return sendRedirect(event, publicContentRoute(content.kind, slug), 308)
})
