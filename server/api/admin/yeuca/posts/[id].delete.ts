import { deleteYeucaPost, getYeucaPostById } from '../../../../modules/yeuca/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'
import { assertYeucaDepartmentAccess, resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const existing = getYeucaPostById(client, id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found', data: { code: 'NOT_FOUND' } })
  }
  assertYeucaDepartmentAccess(scope, existing.deptName, '动态/笔记')

  deleteYeucaPost(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.post.delete',
    entityType: 'yeuca_post',
    entityId: id,
    details: { title: existing.title, department: existing.deptName }
  })
  return { deleted: true }
})
