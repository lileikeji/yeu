import { competitionResultLookupSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  lookupCompetitionResult
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

/** 三要素查询（姓名 + 学号 + QQ）；查询通道只在结果邮件发出后开放。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionResultLookupSchema)
  const contentId = findMusicAssociationContent(client).id
  return lookupCompetitionResult(client, contentId, input)
})
