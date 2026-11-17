import { publicRecruitSubmissionSchema } from '../../../../shared/schemas/server'
import { COMPUTER_ASSOCIATION_SLUG } from '../../../../shared/utils/yeuca'
import {
  buildSubmissionFilename,
  createSubmission,
  getRecruitDraft,
  getRecruitFormBySlug,
  markDraftSubmitted,
  recruitDraftKey,
  updateSubmission,
  validateSubmissionInput
} from '../../../modules/recruit/service'
import { getClientIpAddress } from '../../../utils/client-ip'
import { useAppDatabase } from '../../../utils/database'
import { assertRateLimit } from '../../../utils/rate-limit'
import { getSecurityConfig, hashOpaqueToken } from '../../../utils/security'
import { parseBody } from '../../../utils/validation'
import { applyYeucaCors, assertYeucaPostOrigin } from '../../../utils/yeuca-cors'

export default defineEventHandler(async (event) => {
  applyYeucaCors(event)
  assertYeucaPostOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const ipAddress = getClientIpAddress(event)
  assertRateLimit(event, `public-recruit:${ipAddress}`, 5, 60 * 60 * 1000, client)

  const found = getRecruitFormBySlug(client, COMPUTER_ASSOCIATION_SLUG)
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

  const paymentEnabled = Boolean(found.form.paymentEnabled)
  if (paymentEnabled && input.paymentConfirmed !== true) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: {
        code: 'VALIDATION_ERROR',
        field: 'paymentConfirmed',
        message: '请先按指引确认会费说明后再提交'
      }
    })
  }

  const security = getSecurityConfig(event)
  const draftKey = recruitDraftKey(
    client,
    security.secret,
    ipAddress,
    getHeader(event, 'user-agent') ?? ''
  )
  const draftState = getRecruitDraft(client, found.form.id, draftKey)
  const submission = draftState?.submissionId
    ? updateSubmission(client, found.form, draftState.submissionId, input.data)
    : createSubmission(
        client,
        found.form,
        normalized,
        hashOpaqueToken(security.secret, 'recruit-ip', ipAddress),
        null,
        paymentEnabled ? input.paymentConfirmed === true : null
      )

  markDraftSubmitted(client, found.form.id, draftKey, submission.id, normalized.data)
  setResponseStatus(event, 201)
  return {
    id: submission.id,
    filename: buildSubmissionFilename(submission)
  }
})
