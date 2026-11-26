import { thirdPartyFormSwitchSchema } from '../../../../../../shared/schemas/server'
import {
  DEFAULT_OPTION_FIELD,
  writeActiveFormConfig
} from '../../../../../modules/vote-sync/form-config'
import { fetchJinshujuForm, readJinshujuToken } from '../../../../../utils/jinshuju'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

/**
 * 切换后台生效的表单。
 *
 * 落盘前先读一次远端结构：token 写错或表单已被删除时立即报错，
 * 不会把配置文件指到一个取不到数据的 token 上。
 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, thirdPartyFormSwitchSchema)
  const apiToken = readJinshujuToken(event)
  if (!apiToken) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Jinshuju token is not configured',
      data: { code: 'JINSHUJU_TOKEN_MISSING' }
    })
  }

  const form = await fetchJinshujuForm({
    apiToken,
    formToken: input.token,
    optionField: input.optionField ?? DEFAULT_OPTION_FIELD
  })

  const optionField = input.optionField ?? form.fields[0]?.apiCode ?? DEFAULT_OPTION_FIELD
  if (!form.fields.some(field => field.apiCode === optionField)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Option field does not exist on this form',
      data: { code: 'OPTION_FIELD_NOT_FOUND', optionField }
    })
  }

  const config = writeActiveFormConfig({ formToken: input.token, optionField }, event)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.popularity_third_party_form_switch',
    entityType: 'jinshuju_form',
    entityId: input.token,
    details: { optionField, choiceCount: form.fields.find(f => f.apiCode === optionField)?.choices.length ?? 0 }
  })

  return { ok: true, config, form }
})
