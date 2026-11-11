import {
  findMusicAssociationContent,
  getSingerQueuePosition
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'

export default defineEventHandler((event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)

  const query = getQuery(event)
  const singerId = String(query.singerId ?? '').trim()
  if (!singerId) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: { code: 'VALIDATION_ERROR', field: 'singerId' }
    })
  }

  const contentId = findMusicAssociationContent(client).id
  return getSingerQueuePosition(client, contentId, singerId)
})
