import { competitionSongAccompanimentSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  submitAccompanimentByThreeFactors
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

/** 选手自己传伴奏：三要素定位，只有确认晋级那一轮能传；不传也能交曲目。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionSongAccompanimentSchema)
  const contentId = findMusicAssociationContent(client).id
  const data = Buffer.from(input.data, 'base64')
  return submitAccompanimentByThreeFactors(client, contentId, input, {
    filename: input.filename ?? '',
    data
  })
})
