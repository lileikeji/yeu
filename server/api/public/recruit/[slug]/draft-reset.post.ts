import {
  getRecruitFormBySlug,
  recruitDraftKey,
  resetRecruitDraft
} from '../../../../modules/recruit/service'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { getSecurityConfig, hashOpaqueToken, assertTrustedOrigin } from '../../../../utils/security'
import { parseBody, requireSlugParam } from '../../../../utils/validation'
import { z } from 'zod'

const resetSchema = z.object({
  mode: z.enum(['edit', 'fresh'])
}).strict()

/** 'edit' reopens the submitted data; 'fresh' clears everything for a blank form. */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const slug = requireSlugParam(event)

  const ipAddress = getClientIpAddress(event)
  assertRateLimit(event, `recruit-draft:${ipAddress}`, 30, 60 * 60 * 1000, client)

  const found = getRecruitFormBySlug(client, slug)
  if (!found || found.clubStatus !== 'published') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recruit form not found',
      data: { code: 'NOT_FOUND' }
    })
  }

  const input = await parseBody(event, resetSchema)
  const security = getSecurityConfig(event)
  const draftKey = recruitDraftKey(
    client,
    security.secret,
    ipAddress,
    getHeader(event, 'user-agent') ?? ''
  )
  resetRecruitDraft(client, found.form.id, draftKey, input.mode)
  setResponseStatus(event, 204)
})
