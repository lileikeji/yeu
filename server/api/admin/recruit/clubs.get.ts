import { getClubContent, listClubContents } from '../../../modules/recruit/service'
import { useAdminRequest } from '../../../utils/http'
import { resolveRecruitContentId } from '../../../utils/recruit-admin'

/**
 * List club contents for the recruit admin club selector. Super admins get all
 * clubs; organization admins only ever see their own scoped content.
 */
export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)

  if (session.admin.role === 'organization') {
    const contentId = resolveRecruitContentId(event, session)
    const own = getClubContent(client, contentId)
    return {
      items: own && own.kind === 'club'
        ? [{ id: own.id, slug: own.slug, title: own.title, status: own.status }]
        : []
    }
  }

  return { items: listClubContents(client) }
})
