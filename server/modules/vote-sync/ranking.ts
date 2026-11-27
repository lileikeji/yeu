/**
 * 把第三方投票的聚合行整理成榜单。
 *
 * 候选名单来自决赛第一轮（`listPopularityCandidates`），顺序即出场号；
 * 金数据的选项名就是选手姓名，这里按姓名回连 `singerId`。
 * 不在候选名单里的选项（历史名单、改过名）仍然列出，只是没有选手信息。
 */

import type { ThirdPartyRankingEntry, ThirdPartyRankingPayload } from '~~/shared/types'
import type { ThirdPartyStatus } from './risk'

export interface ThirdPartyAggRow {
  optionId: string
  status: ThirdPartyStatus
  count: number
}

export interface RankingCandidate {
  singerId: string
  number: number
  name: string
  className: string | null
  photoUrl: string | null
  song: string
}

export interface RankingInput {
  formToken: string
  rows: ThirdPartyAggRow[]
  candidates: RankingCandidate[]
  generatedAt: number
}

interface Tally {
  valid: number
  watch: number
  voided: number
}

function emptyTally(): Tally {
  return { valid: 0, watch: 0, voided: 0 }
}

/**
 * 构造榜单。排序：有效票降序 → 出场号升序 → 姓名；未匹配的条目排在最后。
 * 名次只在有有效票时给出，同票并列（1、1、3）。
 */
export function buildThirdPartyRanking(input: RankingInput): ThirdPartyRankingPayload {
  const tally = new Map<string, Tally>()
  const totals = { received: 0, valid: 0, watch: 0, voided: 0 }

  for (const row of input.rows) {
    if (!Number.isFinite(row.count) || row.count <= 0) continue
    const bucket = tally.get(row.optionId) ?? emptyTally()
    if (row.status === 'valid') bucket.valid += row.count
    else if (row.status === 'watch') bucket.watch += row.count
    else bucket.voided += row.count
    tally.set(row.optionId, bucket)
    totals.received += row.count
    if (row.status === 'valid') totals.valid += row.count
    else if (row.status === 'watch') totals.watch += row.count
    else totals.voided += row.count
  }

  const candidateOrder = new Map(input.candidates.map((candidate, index) => [candidate.name, index]))
  // 选项名可能带后缀（现行表单是「姓名《歌名》」），历史数据又是纯姓名。
  // 先按「精确姓名 → 姓名前缀（取最长）」归并，避免改一版选项名就丢历史票。
  const namesByLength = input.candidates.map(candidate => candidate.name).sort((left, right) => right.length - left.length)
  const resolveCache = new Map<string, string>()
  const merged = new Map<string, Tally>()
  for (const [optionId, bucket] of tally) {
    let resolved = resolveCache.get(optionId)
    if (resolved === undefined) {
      resolved = candidateOrder.has(optionId)
        ? optionId
        : namesByLength.find(name => optionId.startsWith(name)) ?? optionId
      resolveCache.set(optionId, resolved)
    }
    const target = merged.get(resolved) ?? emptyTally()
    target.valid += bucket.valid
    target.watch += bucket.watch
    target.voided += bucket.voided
    merged.set(resolved, target)
  }

  const entries: ThirdPartyRankingEntry[] = input.candidates.map((candidate) => {
    const bucket = merged.get(candidate.name) ?? emptyTally()
    return {
      optionId: candidate.name,
      singerId: candidate.singerId,
      number: candidate.number,
      name: candidate.name,
      className: candidate.className,
      photoUrl: candidate.photoUrl,
      song: candidate.song,
      valid: bucket.valid,
      watch: bucket.watch,
      voided: bucket.voided,
      rank: 0,
      share: 0
    }
  })

  // 不在候选名单里的选项也保留，避免票数凭空消失。
  for (const [optionId, bucket] of merged) {
    if (candidateOrder.has(optionId)) continue
    entries.push({
      optionId,
      singerId: null,
      number: null,
      name: optionId,
      className: null,
      photoUrl: null,
      song: '',
      valid: bucket.valid,
      watch: bucket.watch,
      voided: bucket.voided,
      rank: 0,
      share: 0
    })
  }

  // 候选选手在前、按票数排；不在决赛名单里的选项统一沉到榜尾且不参与名次。
  entries.sort((left, right) => {
    const matched = Number(candidateOrder.has(right.optionId)) - Number(candidateOrder.has(left.optionId))
    if (matched !== 0) return matched
    if (!candidateOrder.has(left.optionId)) return left.name.localeCompare(right.name, 'zh-Hans-CN')
    return right.valid - left.valid
      || (candidateOrder.get(left.optionId) ?? 0) - (candidateOrder.get(right.optionId) ?? 0)
  })

  let lastValid = -1
  let lastRank = 0
  let matchedCount = 0
  for (const entry of entries) {
    const ranked = candidateOrder.has(entry.optionId) && entry.valid > 0
    if (ranked) {
      matchedCount += 1
      entry.rank = entry.valid === lastValid ? lastRank : matchedCount
      lastValid = entry.valid
      lastRank = entry.rank
    }
    entry.share = totals.valid > 0 ? Number((entry.valid / totals.valid).toFixed(4)) : 0
  }

  return { formToken: input.formToken, generatedAt: input.generatedAt, totals, entries }
}
