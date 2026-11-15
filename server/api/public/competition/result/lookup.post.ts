import { competitionResultLookupSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  lookupCompetitionResult
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

/**
 * 三要素查询（姓名 + 学号 + QQ 或邮箱）；查询通道只在结果邮件发出后开放。
 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionResultLookupSchema)
  const contentId = findMusicAssociationContent(client).id
  // 老客户端只传 qq，新客户端传 contact；两者都收。
  return lookupCompetitionResult(client, contentId, {
    name: input.name,
    studentNo: input.studentNo,
    contact: input.contact ?? input.qq
  })
})
