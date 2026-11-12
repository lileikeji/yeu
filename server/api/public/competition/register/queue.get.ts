import {
  findMusicAssociationContent,
  findSingerQueueByName,
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
  const name = String(query.name ?? '').trim()
  const studentNoTail = String(query.studentNoTail ?? '').trim()
  if (!singerId && !(name && studentNoTail)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: { code: 'VALIDATION_ERROR', field: 'singerId' }
    })
  }

  const contentId = findMusicAssociationContent(client).id
  if (singerId) return getSingerQueuePosition(client, contentId, singerId)
  return findSingerQueueByName(client, contentId, name, studentNoTail)
})
