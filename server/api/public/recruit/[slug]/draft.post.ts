import {
  getRecruitFormBySlug,
  recruitDraftKey,
  saveRecruitDraft
} from '../../../../modules/recruit/service'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { getSecurityConfig, hashOpaqueToken, assertTrustedOrigin } from '../../../../utils/security'
import { parseBody, requireSlugParam } from '../../../../utils/validation'
import { publicRecruitDraftSchema } from '../../../../../shared/schemas/server'

/** Upsert the visitor's half-filled form (keyed by IP + browser signature). */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const slug = requireSlugParam(event)

  const ipAddress = getClientIpAddress(event)
  assertRateLimit(event, `recruit-draft:${ipAddress}`, 30, 60 * 60 * 1000, client)

  const found = getRecruitFormBySlug(client, slug)
  if (!found || found.clubStatus !== 'published' || found.form.status !== 'open') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recruit form is not open',
      data: { code: 'RECRUIT_FORM_CLOSED' }
    })
  }

  const input = await parseBody(event, publicRecruitDraftSchema)
  const security = getSecurityConfig(event)
  const draftKey = recruitDraftKey(
    client,
    security.secret,
    ipAddress,
    getHeader(event, 'user-agent') ?? ''
  )
  saveRecruitDraft(client, found.form.id, draftKey, input.data)
  setResponseStatus(event, 204)
})
