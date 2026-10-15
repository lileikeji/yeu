import {
  buildSubmissionsZip,
  getRecruitFormByContentId,
  getSubmission,
  listSubmissions
} from '../../../../modules/recruit/service'
import type { RecruitSubmission } from '~~/shared/types'
import { throwNotFound } from '../../../../utils/errors'
import { useAdminRequest } from '../../../../utils/http'
import { resolveRecruitContentId, sendZip } from '../../../../utils/recruit-admin'

/**
 * Zip the generated docx files for submissions:
 * - ids=csv          按勾选下载（沿用旧入口）
 * - all=1 [&query=]  服务端取全量，不受前端分页限制
 * - department=演唱部 只取该部门的提交
 * - grouped=1        zip 内按部门分文件夹，另带「全部」文件夹
 */
export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const query = getQuery(event)

  const form = getRecruitFormByContentId(client, contentId)
  if (!form) throwNotFound('Recruit form')

  const searchQuery = typeof query.query === 'string' ? query.query : ''
  const department = typeof query.department === 'string' && query.department.trim()
    ? query.department.trim()
    : ''
  const grouped = query.grouped === '1' || query.grouped === 'true'
  const fetchAll = query.all === '1' || query.all === 'true'

  let submissions: RecruitSubmission[] = []
  if (fetchAll || department || grouped) {
    for (let page = 1; ; page += 1) {
      const result = listSubmissions(client, form.id, { query: searchQuery, page, pageSize: 100 })
      submissions.push(...result.items)
      if (submissions.length >= result.total || result.items.length === 0) break
    }
  } else {
    const ids = String(query.ids ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
    if (ids.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ids query parameter is required',
        data: { code: 'IDS_REQUIRED' }
      })
    }
    submissions = ids
      .map(id => getSubmission(client, id))
      .filter((submission): submission is NonNullable<typeof submission> =>
        !!submission && submission.formId === form.id)
  }

  if (department) {
    submissions = submissions.filter(submission => (submission.departments ?? '')
      .split('、')
      .map(part => part.trim())
      .includes(department))
  }
  if (submissions.length === 0) throwNotFound('Recruit submissions')

  const zip = buildSubmissionsZip(form, submissions, { groupByDepartment: grouped })
  const scopeLabel = department ? department : (fetchAll ? '全部' : '选中')
  const suffix = grouped ? '-分部门合集' : ''
  sendZip(event, zip.bytes, `纳新申请表-${scopeLabel}${zip.count}份${suffix}.zip`)
  return zip.bytes
})
