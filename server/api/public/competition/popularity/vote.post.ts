import { handlePopularityVote } from '../../../../modules/competition/popularity-vote'

export default defineEventHandler(event => handlePopularityVote(event))
