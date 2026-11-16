import { getSongFormState } from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'

/** 用邮件里的 token 取自己的曲目表单，不需要再填三要素。 */
export default defineEventHandler((event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const query = getQuery(event)
  const token = String(query.token ?? '').trim()
  if (!token) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: { code: 'VALIDATION_ERROR', field: 'token' }
    })
  }
  return getSongFormState(client, token)
})
