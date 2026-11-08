import { findMusicAssociationContent, getRegistrationState } from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const contentId = findMusicAssociationContent(client).id
  const state = getRegistrationState(client, contentId)
  // 登记开关允许 30 秒内生效延迟，换取扫码高峰的短缓存。
  setPublicCache(event, 30)
  return state
})
