import { competitionDrawSchema } from '../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  registerDrawNumber
} from '../../../modules/competition/service'
import { useAppDatabase } from '../../../utils/database'
import { assertTrustedOrigin } from '../../../utils/security'
import { parseBody } from '../../../utils/validation'

/** 选手现场抽完签，扫码自己填号：三要素定位后写本轮出场顺序。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionDrawSchema)
  const contentId = findMusicAssociationContent(client).id
  return registerDrawNumber(client, contentId, {
    name: input.name,
    studentNo: input.studentNo,
    contact: input.contact
  }, input.sortOrder)
})
