import { thirdPartyFormUpdateSchema } from '../../../../../../shared/schemas/server'
import {
  fetchJinshujuForm,
  readJinshujuConfig,
  updateJinshujuChoices,
  updateJinshujuFormInfo,
  updateJinshujuRules
} from '../../../../../utils/jinshuju'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

/** 改金数据表单：选项增删、名称与描述、填写规则，可一次提交多项。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, thirdPartyFormUpdateSchema)
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
  const wantsChoices = add.length > 0 || remove.length > 0
  const wantsInfo = input.name !== undefined || input.description !== undefined
  const wantsRules = input.weixinLimited !== undefined || input.oncePerWeixin !== undefined
  if (!wantsChoices && !wantsInfo && !wantsRules) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nothing to change',
      data: { code: 'FORM_CHANGE_EMPTY' }
    })
  }

  let choiceCount: number | null = null
  if (wantsChoices) {
    const updated = await updateJinshujuChoices(config, {
      fieldApiCode: config.optionField,
      add,
      remove
    })
    choiceCount = updated.fields[0]?.choices.length ?? 0
  }
  if (wantsInfo) {
    await updateJinshujuFormInfo(config, config.formToken, {
      name: input.name,
      description: input.description
    })
  }
  if (wantsRules) {
    await updateJinshujuRules(config, config.formToken, {
      weixinLimited: input.weixinLimited,
      oncePerWeixin: input.oncePerWeixin
    })
  }

  const form = await fetchJinshujuForm(config)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.popularity_third_party_form_update',
    entityType: 'jinshuju_form',
    entityId: config.formToken,
    details: {
      add,
      remove,
      name: input.name ?? null,
      description: input.description ?? null,
      weixinLimited: input.weixinLimited ?? null,
      oncePerWeixin: input.oncePerWeixin ?? null,
      choiceCount
    }
  })

  return { ok: true, form }
})
