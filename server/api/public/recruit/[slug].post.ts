import { publicRecruitSubmissionSchema } from '../../../../shared/schemas/server'
import {
  createSubmission,
  getRecruitDraft,
  getRecruitFormBySlug,
  buildSubmissionFilename,
  markDraftSubmitted,
  recruitDraftKey,
  resolveReferrerByCode,
  updateSubmission,
  validateSubmissionInput
} from '../../../modules/recruit/service'
import { getClientIpAddress } from '../../../utils/client-ip'
import { useAppDatabase } from '../../../utils/database'
import { assertRateLimit } from '../../../utils/rate-limit'
import { getSecurityConfig, hashOpaqueToken, assertTrustedOrigin } from '../../../utils/security'
import { parseBody, requireSlugParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const slug = requireSlugParam(event)

  const ipAddress = getClientIpAddress(event)
  assertRateLimit(event, `public-recruit:${ipAddress}`, 5, 60 * 60 * 1000, client)

  const found = getRecruitFormBySlug(client, slug)
  if (!found || found.clubStatus !== 'published' || found.form.status !== 'open') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recruit form is not open',
      data: { code: 'RECRUIT_FORM_CLOSED' }
    })
  }

  const input = await parseBody(event, publicRecruitSubmissionSchema)
  const fields = JSON.parse(found.form.fieldsJson) as Parameters<typeof validateSubmissionInput>[0]
  const normalized = validateSubmissionInput(fields, input.data)

  // When payment is enabled the applicant must explicitly confirm the fee.
  const paymentEnabled = Boolean(found.form.paymentEnabled)
  if (paymentEnabled && input.paymentConfirmed !== true) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: {
        code: 'VALIDATION_ERROR',
        field: 'paymentConfirmed',
        message: '请先按收款码缴纳会费，并勾选「已缴纳会费」后再提交'
      }
    })
  }

  // Invite tracking: ?ref=CODE on the signup link credits the referrer.
  // Absent or invalid codes record no referrer.
  const rawRef = getQuery(event).ref
  const refCode = typeof rawRef === 'string' ? rawRef : ''
  const referrerName = resolveReferrerByCode(client, found.form.id, refCode)

  // Same visitor (IP + browser signature) editing an existing signup updates
  // that record instead of creating a duplicate.
  const security = getSecurityConfig(event)
  const draftKey = recruitDraftKey(
    client,
    security.secret,
    ipAddress,
    getHeader(event, 'user-agent') ?? ''
  )
  const draftState = getRecruitDraft(client, found.form.id, draftKey)
  let submission = draftState?.submissionId
    ? updateSubmission(client, found.form, draftState.submissionId, input.data)
    : createSubmission(
      client,
      found.form,
      normalized,
      hashOpaqueToken(security.secret, 'recruit-ip', ipAddress),
      referrerName,
      paymentEnabled ? input.paymentConfirmed === true : null
    )

  // Keep the payload linked so the visitor can review, edit again, or restart.
  markDraftSubmitted(client, found.form.id, draftKey, submission.id, normalized.data)


  setResponseStatus(event, 201)
  return {
    id: submission.id,
    filename: buildSubmissionFilename(submission)
  }
})
