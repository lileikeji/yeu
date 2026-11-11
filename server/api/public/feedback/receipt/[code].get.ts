import { getRouterParam } from 'h3'
import { getFeedbackByReceiptCode } from '../../../../modules/feedback/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'

export default defineEventHandler((event) => {
  const code = (getRouterParam(event, 'code') ?? '').toUpperCase()
  const receipt = getFeedbackByReceiptCode(useAppDatabase(event), code)

  if (!receipt) {
    throw createError({ statusCode: 404, statusMessage: 'Receipt not found' })
  }

  // 回执状态会随处理进展变化，缓存窗口短一些。
  setPublicCache(event, 60)
  return receipt
})
