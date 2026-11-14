import {
  findMusicAssociationContent,
  getCallBoard
} from '../../../modules/competition/service'
import { useAppDatabase } from '../../../utils/database'
import { assertTrustedOrigin } from '../../../utils/security'

export default defineEventHandler((event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const contentId = findMusicAssociationContent(client).id
  return getCallBoard(client, contentId)
})
