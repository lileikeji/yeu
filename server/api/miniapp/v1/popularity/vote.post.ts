import { handlePopularityVote } from '../../../../modules/competition/popularity-vote'

/**
 * 小程序投票：与网页共用 `handlePopularityVote`，仅放宽“浏览器 Origin / Cookie”两项
 * 载体要求（小程序没有 Cookie 罐），页面票据、停留时长、评分与落库完全一致。
 */
export default defineEventHandler(event => handlePopularityVote(event, {
  requireBrowserOrigin: false,
  allowSessionTokenIdentity: true
}))
