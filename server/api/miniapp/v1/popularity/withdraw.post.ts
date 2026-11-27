import { handlePopularityWithdraw } from '../../../../modules/competition/popularity-vote'

/**
 * 小程序取消投票：与网页共用 `handlePopularityWithdraw`，仅放宽浏览器 Origin 要求；
 * 微信票据、身份核验与作废逻辑完全一致。
 */
export default defineEventHandler(event => handlePopularityWithdraw(event, {
  requireBrowserOrigin: false
}))
