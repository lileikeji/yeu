import { readPopularityVisits } from '../../../../modules/competition/popularity-visit-http'
import { useAdminRequest } from '../../../../utils/http'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return { report: readPopularityVisits(event, client) }
})
