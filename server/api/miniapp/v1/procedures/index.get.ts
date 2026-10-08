import { publicProceduresQuerySchema } from '../../../../../shared/schemas/server'
import { listProcedures } from '../../../../modules/procedures/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'
import { presentPublicList, presentPublicProcedure } from '../../../../utils/public-api-presentation'
import { parseQuery } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const result = listProcedures(
    useAppDatabase(event),
    parseQuery(event, publicProceduresQuerySchema),
    true
  )
  setPublicCache(event, 60)
  return presentPublicList(result, presentPublicProcedure)
})
