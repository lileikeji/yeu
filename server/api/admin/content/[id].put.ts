import { z } from 'zod'
import { updateContentSchema } from '../../../../shared/schemas/server'
import { archiveContent, getAdminContent, publishContent, updateContent } from '../../../modules/content/service'
import { writeAudit } from '../../../utils/audit'
import {
  assertOrganizationContentUpdateAllowed,
  requireAdminContentAccess,
  withAutomaticOrganizationVerification
} from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

const compatibilitySchema = updateContentSchema.extend({
  status: z.enum(['published', 'archived']).optional()
})

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  requireAdminContentAccess(session, id)
  const input = await parseBody(event, compatibilitySchema)
  assertOrganizationContentUpdateAllowed(session, input)
  const { status, ...fields } = input
  if (session.admin.role === 'organization' && status) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Organization administrators cannot change publication status',
      data: { code: 'PUBLICATION_PERMISSION_REQUIRED' }
    })
  }

  const update = withAutomaticOrganizationVerification(session, fields)
  const updated = Object.keys(update).length > 0
    ? updateContent(client, id, update)
    : getAdminContent(client, id)

  const result = status === 'published'
    ? publishContent(client, id)
    : status === 'archived'
      ? archiveContent(client, id)
      : updated
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: status ? `content.${status}` : 'content.update',
    entityType: 'content',
    entityId: id,
    details: {
      fields: [...new Set([...Object.keys(input), ...Object.keys(update)])],
      compatibilityMethod: 'PUT'
    }
  })
  return result
})
