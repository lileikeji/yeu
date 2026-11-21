import {
  findMusicAssociationContent,
  getRankBoard
} from '../../../modules/competition/service'
import { useAppDatabase } from '../../../utils/database'
import { assertTrustedOrigin } from '../../../utils/security'

/** 公开排行：免登录，只给名次/姓名/歌曲/出场顺序/照片。 */
export default defineEventHandler((event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const contentId = findMusicAssociationContent(client).id
  const roundKey = String(getQuery(event).round ?? '').trim()
  return getRankBoard(client, contentId, roundKey || undefined)
})
