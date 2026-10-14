import {
  ensureRecruitForm,
  getSubmissionStats
} from '../../../../modules/recruit/service'
import { useAdminRequest } from '../../../../utils/http'
import { resolveRecruitContentId } from '../../../../utils/recruit-admin'

/** 后台「数据概览」：每日提交趋势、意向部门与班级分布。 */
export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const form = ensureRecruitForm(client, contentId)

  return getSubmissionStats(client, form.id)
})
