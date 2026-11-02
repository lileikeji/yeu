/**
 * 事件聚簇。
 *
 * 同一件事常常被三个地方分别发一遍：学校主页、教务处、某个学院的公众号。
 * 逐条列出来，用户看到的是一堆重复标题。这里按标题相似度把它们并成一个事件，
 * 并保留每个原始出处，页面上就是「一件事 + N 个来源」。
 *
 * 相似度用字符 1/2/3-gram 的 Dice 系数混合，中文不需要分词就能用。
 */

export interface SignalClusterItem {
  id: string
  title: string
  publishedAt: number
  score: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 两周之外的东西不可能是同一件事。 */
export const SIGNAL_CLUSTER_WINDOW_MS = 14 * DAY_MS
/** 达到这个相似度直接合并。 */
export const SIGNAL_CLUSTER_SIMILARITY = 0.42
/** 相似度低一档，但共享两个以上实词，也可以合并。 */
export const SIGNAL_CLUSTER_SOFT_SIMILARITY = 0.3
export const SIGNAL_CLUSTER_MIN_SHARED_TOKENS = 2

/** 这些词每条通知都有，留着会让「新生报到通知」和「新生宿舍通知」看起来很像。 */
const BOILERPLATE = [
  '关于', '通知', '公告', '公示', '发布', '有关', '相关', '事项', '工作', '安排',
  '事宜', '开展', '做好', '进一步', '如下', '现将', '决定', '要求', '特此',
  '年', '月', '日', '的'
]

/** 这些词在标题里没有区分度，不参与「实词」判断。 */
const STOP_TOKENS = new Set(['学校', '学院', '大学', '仰恩', '学生', '进行', '号'])

function normalizeTitle(title: string): string {
  let text = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[【】[\]（）()《》<>「」“”"'·、,，。.:：;；!！?？—\-_/\\|]+/g, ' ')
  for (const word of BOILERPLATE) text = text.split(word).join(' ')
  return text.replace(/\d+/g, ' ').replace(/\s+/g, '')
}

function ngrams(text: string, size: number): string[] {
  const chars = [...text.replace(/ /g, '')]
  if (chars.length === 0) return []
  if (chars.length <= size) return [chars.join('')]
  const out: string[] = []
  for (let index = 0; index <= chars.length - size; index += 1) {
    out.push(chars.slice(index, index + size).join(''))
  }
  return out
}

function diceCoefficient(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0
  const counts = new Map<string, number>()
  for (const token of left) counts.set(token, (counts.get(token) ?? 0) + 1)
  let overlap = 0
  for (const token of right) {
    const remaining = counts.get(token) ?? 0
    if (remaining > 0) {
      overlap += 1
      counts.set(token, remaining - 1)
    }
  }
  return (2 * overlap) / (left.length + right.length)
}

/** 标题相似度，0–1。 */
export function titleSimilarity(left: string, right: string): number {
  const a = normalizeTitle(left)
  const b = normalizeTitle(right)
  if (!a || !b) return 0
  if (a === b) return 1
  const unigram = diceCoefficient(ngrams(a, 1), ngrams(b, 1))
  const bigram = diceCoefficient(ngrams(a, 2), ngrams(b, 2))
  const trigram = diceCoefficient(ngrams(a, 3), ngrams(b, 3))
  return Math.round((unigram * 0.2 + bigram * 0.5 + trigram * 0.3) * 1000) / 1000
}

/** 标题里的实词（去停用词、去纯数字的二字词）。 */
function keyTokens(title: string): Set<string> {
  const tokens = new Set<string>()
  for (const token of ngrams(normalizeTitle(title), 2)) {
    if (/^\d+$/.test(token)) continue
    if (STOP_TOKENS.has(token)) continue
    tokens.add(token)
  }
  return tokens
}

function sharedTokenCount(left: Set<string>, right: Set<string>): number {
  let shared = 0
  for (const token of left) {
    if (right.has(token)) shared += 1
  }
  return shared
}

function shouldMerge(left: string, right: string): boolean {
  const similarity = titleSimilarity(left, right)
  if (similarity >= SIGNAL_CLUSTER_SIMILARITY) return true
  if (similarity < SIGNAL_CLUSTER_SOFT_SIMILARITY) return false
  return sharedTokenCount(keyTokens(left), keyTokens(right)) >= SIGNAL_CLUSTER_MIN_SHARED_TOKENS
}

interface ClusterGroup<T> {
  representative: T
  lastAt: number
  members: T[]
}

/**
 * 按发布时间升序扫描，把能合并的塞进同一个组。
 * 返回的每个组内部按分数降序，组之间按最早发布时间升序。
 */
export function clusterSignalItems<T extends SignalClusterItem>(items: T[]): T[][] {
  const sorted = [...items].sort((left, right) => left.publishedAt - right.publishedAt || left.id.localeCompare(right.id))
  const groups: ClusterGroup<T>[] = []

  for (const item of sorted) {
    let best: ClusterGroup<T> | null = null
    let bestSimilarity = 0
    for (const group of groups) {
      if (item.publishedAt - group.lastAt > SIGNAL_CLUSTER_WINDOW_MS) continue
      if (!shouldMerge(group.representative.title, item.title)) continue
      const similarity = titleSimilarity(group.representative.title, item.title)
      if (similarity > bestSimilarity) {
        best = group
        bestSimilarity = similarity
      }
    }
    if (best) {
      best.members.push(item)
      best.lastAt = item.publishedAt
      if (item.score > best.representative.score) best.representative = item
      continue
    }
    groups.push({
      representative: item,
      lastAt: item.publishedAt,
      members: [item]
    })
  }

  return groups
    .sort((left, right) => left.members[0]!.publishedAt - right.members[0]!.publishedAt)
    .map(group => [...group.members].sort((left, right) => right.score - left.score || right.publishedAt - left.publishedAt))
}
