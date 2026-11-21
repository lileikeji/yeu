import { getAdminYeucaTreasureOverview, getTreasureMetaOptions } from '../../../../modules/yeuca/treasure-service'
import { useAdminRequest } from '../../../../utils/http'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const scope = resolveYeucaAdminScope(client, session)
  const runtimeConfig = useRuntimeConfig(event)
  return {
    ...getAdminYeucaTreasureOverview(client, scope, runtimeConfig),
    meta: getTreasureMetaOptions()
  }
})
