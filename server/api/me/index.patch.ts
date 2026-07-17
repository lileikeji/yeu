import { updateUserProfileSchema } from '../../../shared/schemas/server'
import { requireUserSession } from '../../utils/user-auth'
import { useAppDatabase } from '../../utils/database'
import { parseBody } from '../../utils/validation'
import { updateOwnProfile } from '../../modules/users/service'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireUserSession(event, client, { csrf: true })
  const input = await parseBody(event, updateUserProfileSchema)
  const user = await updateOwnProfile(client, session.user.id, input)
  return { user }
})
