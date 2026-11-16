import { competitionSongSubmitSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  submitSongByThreeFactors
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionSongSubmitSchema)
  const contentId = findMusicAssociationContent(client).id
  return submitSongByThreeFactors(client, contentId, {
    name: input.name,
    studentNo: input.studentNo,
    contact: input.contact
  }, input.song)
})
