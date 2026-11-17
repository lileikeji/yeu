import { updateYeucaSettingsSchema } from '../../../../shared/schemas/yeuca'
import { updateYeucaSettings } from '../../../modules/yeuca/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const input = await parseBody(event, updateYeucaSettingsSchema)
  const settings = updateYeucaSettings(client, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.settings.update',
    entityType: 'yeuca_site_settings',
    entityId: settings.id,
    details: { departments: settings.departments.length }
  })
  return settings
})
