import { handlePopularityVisit } from '../../../../modules/competition/popularity-visit-http'

export default defineEventHandler(event => handlePopularityVisit(event))
