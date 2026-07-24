const QUESTION_MARKERS = [
  '怎么', '如何', '哪里', '在哪', '什么时候', '何时', '多少', '能不能', '可不可以',
  '需要什么', '要带什么', '准备什么', '怎么办', '是否', '为什么', '谁负责', '流程是什么',
  '怎么申请', '怎么办理', '怎么去', '怎么走', '有没有', '有无'
] as const

const PROMPT_INJECTION_MARKERS = [
  '忽略之前的指令', '忽略此前指令', '忽略系统指令', '系统提示词', '开发者指令',
  '泄露密钥', '显示密钥', '输出apikey', 'jailbreak', 'ignore previous instructions',
  'reveal system prompt'
] as const

export function normalizeAssistantQuery(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function isQuestionLike(value: string): boolean {
  const query = normalizeAssistantQuery(value).toLocaleLowerCase('zh-CN')
  if (query.length < 4) return false
  return /[?？]$/.test(query) || QUESTION_MARKERS.some(marker => query.includes(marker))
}

export function containsPromptInjection(value: string): boolean {
  const query = normalizeAssistantQuery(value).toLocaleLowerCase('zh-CN').replace(/\s+/g, '')
  return PROMPT_INJECTION_MARKERS.some(marker => query.includes(marker.replace(/\s+/g, '')))
}

export function shouldRequestAssistantAnswer(value: string, localResultCount: number): boolean {
  return localResultCount === 0 && isQuestionLike(value) && !containsPromptInjection(value)
}
