import { applyYeucaCors } from '../../../../utils/yeuca-cors'

export default defineEventHandler((event) => {
  applyYeucaCors(event)
  setResponseStatus(event, 204)
  return ''
})
