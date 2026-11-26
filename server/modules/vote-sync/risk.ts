/**
 * 第三方投票（金数据表单等）的风险评分。
 *
 * 这些函数只做纯计算，不碰数据库与网络，便于单测与线上复盘。
 * 分数语义与站内人气投票保持一致：0-59 有效、60-84 待审、85 以上作废。
 */

export interface ThirdPartyVoteRow {
  /** 平台侧唯一标识，做幂等键 */
  recordId: string
  /** 投给了哪个选项 */
  optionId: string
  /** 平台侧能拿到的投票人标识，可能是昵称或空 */
  voterRef: string | null
  ip: string | null
  uaSummary: string | null
  /** 投票时间，毫秒时间戳 */
  votedAt: number
  /** 平台侧设备指纹，没有则为 null */
  uaFingerprint: string | null
  /** 平台记录的表单填写时长（秒） */
  fillSeconds: number | null
}

export interface ThirdPartyVoteContext {
  /** 同 IP 段在观察窗口内的票数 */
  sameIpWindow: number
  /** 同一投票人标识在观察窗口内的票数 */
  sameVoterWindow: number
  /** 观察窗口内的总票数 */
  burstWindow: number
  /** 该表单的历史每分钟基线票数 */
  baselinePerMinute: number
  /** 与上一条票的时间间隔（毫秒），无上一条则为 null */
  votedIntervalMs: number | null
}

export type ThirdPartyStatus = 'valid' | 'watch' | 'void'

export interface ThirdPartyScore {
  score: number
  flags: string[]
}

const WEIGHT = {
  ipCluster: 25,
  ipHeavy: 15,
  voterRepeat: 40,
  idcIp: 30,
  burst: 20,
  noIdentity: 10,
  fastInterval: 15,
  fastFill: 20
} as const

const IP_CLUSTER_THRESHOLD = 3
const IP_HEAVY_THRESHOLD = 8
const BURST_MULTIPLIER = 10
const FAST_INTERVAL_MS = 3_000
const FAST_FILL_SECONDS = 5
const MAX_SCORE = 100
const WATCH_THRESHOLD = 60
const VOID_THRESHOLD = 85

/**
 * 常见云厂商与机房的 IPv4 段，只用于粗筛，命中不代表一定作弊。
 */
const DATACENTER_CIDRS = [
  '47.96.0.0/12',
  '39.96.0.0/13',
  '120.24.0.0/13',
  '101.37.0.0/16',
  '112.124.0.0/14',
  '114.215.0.0/16',
  '115.28.0.0/15',
  '121.40.0.0/14',
  '123.56.0.0/15',
  '182.92.0.0/16',
  '103.21.244.0/22',
  '129.28.0.0/16',
  '132.232.0.0/16',
  '134.175.0.0/16',
  '150.109.0.0/16',
  '170.106.0.0/16',
  '81.68.0.0/15',
  '119.29.0.0/16',
  '106.52.0.0/14',
  '106.75.0.0/16',
  '117.50.0.0/16',
  '42.51.0.0/16',
  '43.226.0.0/16',
  '45.248.0.0/16',
  '114.115.0.0/16',
  '121.36.0.0/14',
  '122.112.0.0/14',
  '124.70.0.0/16',
  '124.71.0.0/16',
  '139.9.0.0/16',
  '49.4.0.0/16',
  '3.0.0.0/8',
  '13.32.0.0/11',
  '18.0.0.0/8',
  '34.0.0.0/8',
  '35.0.0.0/8',
  '52.0.0.0/8',
  '54.0.0.0/8',
  '20.0.0.0/8',
  '40.64.0.0/10',
  '104.40.0.0/13',
  '168.61.0.0/16'
]

interface CidrRange {
  start: number
  end: number
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

function parseCidr(cidr: string): CidrRange | null {
  const [address, bitsRaw] = cidr.split('/')
  if (address === undefined || bitsRaw === undefined) return null
  const base = ipv4ToInt(address)
  if (base === null) return null
  const bits = Number(bitsRaw)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null
  const size = 2 ** (32 - bits)
  const start = Math.floor(base / size) * size
  return { start, end: start + size - 1 }
}

const DATACENTER_RANGES = DATACENTER_CIDRS
  .map(parseCidr)
  .filter((range): range is CidrRange => range !== null)

/** IPv4 归一到 /24 便于聚合同一出口 IP；IPv6 与异常值原样返回。 */
export function normalizeIpCidr(ip: string | null | undefined): string | null {
  if (!ip) return null
  const trimmed = ip.trim()
  if (!trimmed) return null
  if (ipv4ToInt(trimmed) === null) return trimmed
  const [a, b, c] = trimmed.split('.')
  return `${a}.${b}.${c}.0/24`
}

export function isDatacenterIp(ip: string | null | undefined): boolean {
  if (!ip) return false
  const value = ipv4ToInt(ip.trim())
  if (value === null) return false
  return DATACENTER_RANGES.some((range) => value >= range.start && value <= range.end)
}

export function scoreThirdPartyVote(
  row: ThirdPartyVoteRow,
  context: ThirdPartyVoteContext
): ThirdPartyScore {
  const flags: string[] = []
  let score = 0
  const add = (flag: string, weight: number) => {
    flags.push(flag)
    score += weight
  }

  if (context.sameIpWindow > IP_CLUSTER_THRESHOLD) add('ip_cluster', WEIGHT.ipCluster)
  if (context.sameIpWindow > IP_HEAVY_THRESHOLD) add('ip_heavy', WEIGHT.ipHeavy)
  if (context.sameVoterWindow > 1) add('voter_repeat', WEIGHT.voterRepeat)
  if (isDatacenterIp(row.ip)) add('idc_ip', WEIGHT.idcIp)
  if (context.burstWindow > Math.max(1, context.baselinePerMinute) * BURST_MULTIPLIER) {
    add('burst', WEIGHT.burst)
  }
  if (!row.voterRef) add('no_identity', WEIGHT.noIdentity)
  if (context.votedIntervalMs !== null && context.votedIntervalMs < FAST_INTERVAL_MS) {
    add('fast_interval', WEIGHT.fastInterval)
  }
  if (row.fillSeconds !== null && row.fillSeconds < FAST_FILL_SECONDS) {
    add('fast_fill', WEIGHT.fastFill)
  }

  return { score: Math.min(MAX_SCORE, score), flags }
}

export function decideThirdPartyStatus(score: number): ThirdPartyStatus {
  if (score >= VOID_THRESHOLD) return 'void'
  if (score >= WATCH_THRESHOLD) return 'watch'
  return 'valid'
}
