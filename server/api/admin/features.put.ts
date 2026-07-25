import { updateFrontendFeatureSchema } from '../../../shared/schemas/server'
import { updateFrontendFeature } from '../../modules/features/service'
import { writeAudit } from '../../utils/audit'
import { useAdminRequest } from '../../utils/http'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, updateFrontendFeatureSchema)
  const item = updateFrontendFeature(client, {
    key: input.key,
    enabled: input.enabled,
    adminId: session.admin.id
  })

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: input.enabled ? 'frontend-feature.enable' : 'frontend-feature.disable',
    entityType: 'frontend-feature',
    entityId: input.key,
    details: {
      title: item.title,
      enabled: item.enabled
    }
  })

  return { item }
})
