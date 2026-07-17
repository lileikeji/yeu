import { z } from 'zod'
import { requireUserSession } from '../../utils/user-auth'
import { useAppDatabase } from '../../utils/database'
import { listDormSuggestions } from '../../modules/chat/service'
import { parseQuery } from '../../utils/validation'

const querySchema = z.object({
  q: z.string().trim().max(80).optional()
})

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  requireUserSession(event, client)
  const query = parseQuery(event, querySchema)
  return { items: listDormSuggestions(client, query.q) }
})
