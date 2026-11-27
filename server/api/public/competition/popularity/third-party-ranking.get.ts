import { eq, sql } from 'drizzle-orm'
import { thirdPartyVoteRecords } from '../../../../database/schema'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  listPopularityCandidates
} from '../../../../modules/competition/service'
import { buildThirdPartyRanking } from '../../../../modules/vote-sync/ranking'
import { MANUAL_FORM_TOKEN } from '../../../../modules/vote-sync/manual'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'
import { readJinshujuConfig } from '../../../../utils/jinshuju'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { setHeader } from 'h3'

/** 公开只读榜单：只暴露票数与选手公开信息，不含 IP、昵称等任何投票人数据。 */
export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  assertRateLimit(event, `third-party-ranking:${getClientIpAddress(event)}`, 60, 60_000, client)

  const generatedAt = Date.now()
  // 没配置金数据表单时，后台手动补录的票仍然要能上榜，所以回退到固定 form_token。
  const formToken = readJinshujuConfig(event)?.formToken || MANUAL_FORM_TOKEN

  const rows = client.db.select({
    optionId: thirdPartyVoteRecords.optionId,
    status: thirdPartyVoteRecords.status,
    count: sql<number>`count(*)`.as('count')
  }).from(thirdPartyVoteRecords)
    .where(eq(thirdPartyVoteRecords.formToken, formToken))
    .groupBy(thirdPartyVoteRecords.optionId, thirdPartyVoteRecords.status)
    .all()

  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const candidates = listPopularityCandidates(client, eventRow.id)

  // 榜单由定时插件每 5 分钟更新一次，30 秒缓存足够，也能挡住突发流量。
  setPublicCache(event, 30)

  const configured = Boolean(readJinshujuConfig(event)?.formToken)
  return {
    ...buildThirdPartyRanking({ formToken, rows, candidates, generatedAt }),
    // 微信里点开即可投票；没配金数据表单时（纯手工补录）没有可跳转的地址。
    formUrl: configured ? `https://jinshuju.net/f/${formToken}` : null
  }
})
