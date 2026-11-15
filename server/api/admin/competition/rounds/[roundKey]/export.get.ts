import { createError } from 'h3'
import { competitionExportKindSchema } from '../../../../../../shared/schemas/server'
import {
  buildCompetitionExport,
  ensureCompetitionEvent,
  getRoundByKey
} from '../../../../../modules/competition/service'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'

/**
 * 后台导出本轮名单：
 * - `kind=detail`    成绩明细（一行 = 一位评委给一位选手的一次评分）
 * - `kind=summary`   排名汇总（一行 = 一位选手）
 * - `kind=advancing` 晋级名单（按本轮晋级人数截取）
 *
 * 走 CSV + UTF-8 BOM，Excel 双击直接正常显示中文；不压缩、不缓存。
 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const parsed = competitionExportKindSchema.safeParse(getQuery(event).kind ?? 'summary')
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'export kind invalid',
      data: { code: 'INVALID_EXPORT_KIND', message: '导出类型只支持 detail / summary / advancing' }
    })
  }

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const { filename, csv } = buildCompetitionExport(client, round, parsed.data)

  setHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  setHeader(
    event,
    'content-disposition',
    `attachment; filename="competition-${roundKey}-${parsed.data}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`
  )

  return `\uFEFF${csv}`
})
