import { getPublicProcedure } from '../../../modules/procedures/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { requireSlugParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const result = getPublicProcedure(useAppDatabase(event), requireSlugParam(event))
  setPublicCache(event, 120)
  return result
})
