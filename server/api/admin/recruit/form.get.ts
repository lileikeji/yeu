import {
  ensureRecruitForm,
  getClubContent,
  serializeFormConfig
} from '../../../modules/recruit/service'
import { useAdminRequest } from '../../../utils/http'
import { resolveRecruitContentId } from '../../../utils/recruit-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)

  const club = getClubContent(client, contentId)
  if (!club) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Content not found',
      data: { code: 'NOT_FOUND' }
    })
  }

  const form = ensureRecruitForm(client, contentId)
  return { form: serializeFormConfig(form, { slug: club.slug, title: club.title }) }
})
