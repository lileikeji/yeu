import { getPublicTreasureState } from '../../../modules/yeuca/treasure-service'
import { useAppDatabase } from '../../../utils/database'
import { applyYeucaCors } from '../../../utils/yeuca-cors'

export default defineEventHandler((event) => {
  applyYeucaCors(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  return getPublicTreasureState(event, client, useRuntimeConfig(event))
})
