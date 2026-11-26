import { thirdPartyFormDeleteSchema } from '../../../../../../shared/schemas/server'
import {
  DEFAULT_OPTION_FIELD,
  clearActiveFormConfig,
  readActiveFormConfig
} from '../../../../../modules/vote-sync/form-config'
import { deleteJinshujuForm, readJinshujuToken } from '../../../../../utils/jinshuju'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

/** 删除金数据表单。删的是当前生效表单时，同时清掉本地配置避免指向已不存在的 token。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, thirdPartyFormDeleteSchema)
  const apiToken = readJinshujuToken(event)
  if (!apiToken) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Jinshuju token is not configured',
      data: { code: 'JINSHUJU_TOKEN_MISSING' }
    })
  }

  const active = readActiveFormConfig(event)
  await deleteJinshujuForm(
    { apiToken, formToken: input.token, optionField: DEFAULT_OPTION_FIELD },
    input.token
  )

  const cleared = active?.formToken === input.token
  if (cleared) clearActiveFormConfig(event)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.popularity_third_party_form_delete',
    entityType: 'jinshuju_form',
    entityId: input.token,
    details: { cleared }
  })

  return { ok: true, token: input.token, cleared }
})
