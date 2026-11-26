import { handlePopularityWithdraw } from '../../../../../modules/competition/popularity-vote'

export default defineEventHandler(event => handlePopularityWithdraw(event, { requireBrowserOrigin: false }))
