import { getRouterParam } from 'h3'
import { getClaimEvidence, isPublicClaimId } from '../../../modules/knowledge/evidence'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'

export default defineEventHandler((event) => {
  const claimId = getRouterParam(event, 'claimId') ?? ''

  // 非法 id 直接当不存在处理：不查库、不泄露库里是否真的有这条记录。
  if (!isPublicClaimId(claimId)) {
    throw createError({ statusCode: 404, statusMessage: 'Claim not found' })
  }

  const evidence = getClaimEvidence(useAppDatabase(event), claimId)

  if (!evidence) {
    throw createError({ statusCode: 404, statusMessage: 'Claim not found' })
  }

  setPublicCache(event, 300)
  return evidence
})
