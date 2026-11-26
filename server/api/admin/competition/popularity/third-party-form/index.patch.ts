import { thirdPartyFormChoicesSchema } from '../../../../../../shared/schemas/server'
import { readJinshujuConfig, updateJinshujuChoices } from '../../../../../utils/jinshuju'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

/** 改金数据表单的选项：新增 / 删除，删除后历史票仍保留但会沉到榜单尾部。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, thirdPartyFormChoicesSchema)
  const config = readJinshujuConfig(event)
  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Jinshuju is not configured',
      data: { code: 'JINSHUJU_NOT_CONFIGURED' }
    })
  }

  const add = (input.add ?? []).filter(Boolean)
  const remove = (input.remove ?? []).filter(Boolean)
  if (add.length === 0 && remove.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nothing to change',
      data: { code: 'CHOICE_CHANGE_EMPTY' }
    })
  }

  const form = await updateJinshujuChoices(config, {
    fieldApiCode: config.optionField,
    add,
    remove
  })

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.popularity_third_party_form_update',
    entityType: 'jinshuju_form',
    entityId: config.formToken,
    details: { add, remove, choiceCount: form.fields[0]?.choices.length ?? 0 }
  })

  return { ok: true, form }
})
