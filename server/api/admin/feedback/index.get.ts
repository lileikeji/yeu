import { feedbackQuerySchema } from '../../../../shared/schemas/server'
import { listFeedback } from '../../../modules/feedback/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return listFeedback(client, parseQuery(event, feedbackQuerySchema))
})
