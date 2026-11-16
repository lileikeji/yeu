import { z } from 'zod'
import { confirmReceiptByToken } from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

const bodySchema = z.object({ token: z.string().trim().min(8).max(64) }).strict()

/** 邮件里的「我已收到」按钮：点一下写回执，后台就能看到谁确认了。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, bodySchema)
  return confirmReceiptByToken(client, input.token)
})
