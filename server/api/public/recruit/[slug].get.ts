import {
  getRecruitDraft,
  getRecruitFormBySlug,
  recruitDraftKey,
  recordRecruitView,
  serializeFormConfig
} from '../../../modules/recruit/service'
import { getSecurityConfig } from '../../../utils/security'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { requireSlugParam } from '../../../utils/validation'

import { getClientIpAddress } from '../../../utils/client-ip'

interface PublicRecruitFormPayload {
  available: boolean
  reason?: 'closed'
  club?: { name: string; slug: string }
  form?: {
    title: string
    slogan: string
    intro: string
    fields: Array<{
      key: string
      label: string
      type: string
      required: boolean
      options?: string[]
      optionDetails?: Record<string, string>
      placeholder?: string
    }>
    draft?: {
      data: Record<string, string | string[]>
      submitted: boolean
    } | null
    payment?: {
      enabled: boolean
      wechatImage: string | null
      alipayImage: string | null
      note: string
    }
  }
}

export default defineEventHandler((event): PublicRecruitFormPayload => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const slug = requireSlugParam(event)

  const found = getRecruitFormBySlug(client, slug)
  if (!found || found.clubStatus !== 'published') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recruit form not found',
      data: { code: 'NOT_FOUND' }
    })
  }

  if (found.form.status !== 'open') {
    setPublicCache(event, 30)
    return { available: false, reason: 'closed', club: { name: found.clubTitle, slug: found.clubSlug } }
  }

  // Signup-page load = one view (per-referrer + form total). Availability
  // probes from the club page pass probe=1 and count nothing.
  const query = getQuery(event)
  const rawProbe = query.probe
  const rawRef = query.ref
  recordRecruitView(client, found.form, typeof rawRef === 'string' ? rawRef : '', rawProbe === '1')

  // Restore the visitor's half-filled draft (keyed by IP + browser signature).
  const security = getSecurityConfig(event)
  const draftKey = recruitDraftKey(
    client,
    security.secret,
    getClientIpAddress(event),
    getHeader(event, 'user-agent') ?? ''
  )
  const draftState = getRecruitDraft(client, found.form.id, draftKey)
  const draft = draftState ? { data: draftState.data, submitted: draftState.submitted } : null
  if (draft) setHeader(event, 'Cache-Control', 'no-store')
  else setPublicCache(event, 30)
  const config = serializeFormConfig(found.form, { slug: found.clubSlug, title: found.clubTitle })
  return {
    available: true,
    club: { name: found.clubTitle, slug: found.clubSlug },
    form: {
      title: config.title,
      slogan: config.slogan,
      intro: config.intro,
      fields: config.fields.map(field => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        ...(field.options ? { options: field.options } : {}),
        ...(field.optionDetails ? { optionDetails: field.optionDetails } : {}),
        ...(field.placeholder ? { placeholder: field.placeholder } : {})
      })),
      payment: {
        enabled: config.payment.enabled,
        wechatImage: config.payment.wechatImage,
        alipayImage: config.payment.alipayImage,
        note: config.payment.note
      },
      draft
    }
  }
})
