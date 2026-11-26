import { thirdPartyFormCreateSchema } from '../../../../../../shared/schemas/server'
import { DEFAULT_OPTION_FIELD, writeActiveFormConfig } from '../../../../../modules/vote-sync/form-config'
import { createJinshujuForm, readJinshujuToken } from '../../../../../utils/jinshuju'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

/** 新建金数据投票表单，可顺手设为生效表单。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, thirdPartyFormCreateSchema)
  const apiToken = readJinshujuToken(event)
  if (!apiToken) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Jinshuju token is not configured',
      data: { code: 'JINSHUJU_TOKEN_MISSING' }
    })
  }

  const options = input.options ?? []
  const created = await createJinshujuForm(
    { apiToken, formToken: '', optionField: DEFAULT_OPTION_FIELD },
    {
      name: input.name,
      description: input.description,
      fieldLabel: input.fieldLabel,
      options
    }
  )

  const activated = input.activate === true
  if (activated) {
    writeActiveFormConfig(
      { formToken: created.token, optionField: DEFAULT_OPTION_FIELD },
      event
    )
  }

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.popularity_third_party_form_create',
    entityType: 'jinshuju_form',
    entityId: created.token,
    details: { name: input.name, optionCount: options.length, activated }
  })

  return { ok: true, token: created.token, url: created.url, activated }
})
