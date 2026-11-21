import { updateYeucaPostSchema } from '../../../../../shared/schemas/yeuca'
import { getYeucaPostById, updateYeucaPost } from '../../../../modules/yeuca/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'
import { assertYeucaDepartmentAccess, resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const existing = getYeucaPostById(client, id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found', data: { code: 'NOT_FOUND' } })
  }
  assertYeucaDepartmentAccess(scope, existing.deptName, '动态/笔记')

  const input = await parseBody(event, updateYeucaPostSchema)
  if (!scope.isChief && input.deptName !== undefined && input.deptName.trim() !== scope.departmentName) {
    assertYeucaDepartmentAccess(scope, input.deptName, '动态/笔记（调整部门）')
  }
  const post = updateYeucaPost(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.post.update',
    entityType: 'yeuca_post',
    entityId: id,
    details: { title: post.title, department: post.deptName, fields: Object.keys(input) }
  })
  return post
})
