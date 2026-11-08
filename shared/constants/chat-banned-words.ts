/**
 * 聊天违禁词表（固定在代码里，改词重新发布生效；按用户决策不接 AI 巡检）。
 *
 * 命中即拒绝发送，只提示类别不回显具体词。匹配对大小写不敏感，英文词按
 * 整词匹配避免误伤（如 class 里含 ass）。
 */
export interface BannedWordGroup {
  /** 违规类别（拒绝提示里展示，如「广告代购」）。 */
  label: string
  words: string[]
}

export const CHAT_BANNED_WORD_GROUPS: BannedWordGroup[] = [
  {
    label: '广告代购',
    words: [
      '代购', '兼职', '刷单', '点赞', '接单', '招代理', '微商', '优惠券',
      '低价出', '高价收', '出租出借', '跑分', '放单', '加微信', '加v', '加V',
      '加qq', '进群', '扫码', '二维码', '佣金', '返利', '招商', '推广费'
    ]
  },
  {
    label: '色情低俗',
    words: ['约炮', '援交', '裸聊', '色情', '一夜情', '嫖', '卖淫']
  },
  {
    label: '辱骂攻击',
    words: ['傻逼', '煞笔', '弱智', '脑残', '滚蛋', '去死', '畜生', '贱人', '婊子', '妈的个逼']
  },
  {
    label: '诈骗引流',
    words: ['刷单返利', '征信修复', '办理贷款', '无抵押', '赌博', '博彩', '六合彩', '网赌', '提现', '转账到']
  }
]

const compiled = CHAT_BANNED_WORD_GROUPS.map(group => ({
  label: group.label,
  words: group.words,
  // 英文词整词匹配；中文词直接包含匹配
  patterns: group.words.map(word => /^[\u0000-\u00ff]+$/.test(word)
    ? new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    : word)
}))

export interface BannedWordHit {
  label: string
  word: string
}

/** 返回命中的第一个违禁词；未命中返回 null。 */
export function findBannedWord(text: string): BannedWordHit | null {
  const haystack = (text ?? '').trim()
  if (!haystack) return null
  for (const group of compiled) {
    for (let i = 0; i < group.patterns.length; i++) {
      const pattern = group.patterns[i]!
      const matched = typeof pattern === 'string' ? haystack.includes(pattern) : pattern.test(haystack)
      if (matched) return { label: group.label, word: group.words[i]! }
    }
  }
  return null
}
