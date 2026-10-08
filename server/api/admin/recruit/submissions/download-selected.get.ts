import {
  buildSubmissionsZip,
  getRecruitFormByContentId,
  getSubmission
} from '../../../../modules/recruit/service'
import { throwNotFound } from '../../../../utils/errors'
import { useAdminRequest } from '../../../../utils/http'
import { resolveRecruitContentId, sendZip } from '../../../../utils/recruit-admin'

const MAX_SELECTED = 100

/** Zip the generated docx files for the selected submissions (ids=csv). */
export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)

  const ids = String(getQuery(event).ids ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .slice(0, MAX_SELECTED)
  if (ids.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ids query parameter is required',
      data: { code: 'IDS_REQUIRED' }
    })
  }

  const form = getRecruitFormByContentId(client, contentId)
  if (!form) throwNotFound('Recruit form')

  const submissions = ids
    .map(id => getSubmission(client, id))
    .filter((submission): submission is NonNullable<typeof submission> =>
      !!submission && submission.formId === form.id)
  if (submissions.length === 0) throwNotFound('Recruit submissions')

  const zip = buildSubmissionsZip(form, submissions)
  sendZip(event, zip.bytes, `纳新申请表-选中${zip.count}份.zip`)
  return zip.bytes
})
