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
  // ?round=semi 可以手动指定看哪一轮；不带就看当前正在用的那一轮。
  const query = getQuery(event)
  const raw = typeof query.round === 'string' ? query.round : ''
  const roundKey = raw === 'prelim' || raw === 'semi' || raw === 'final' ? raw : null
  return getCallBoard(client, contentId, roundKey)
})
