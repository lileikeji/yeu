const QUESTION_MARKERS = [
  '怎么', '如何', '哪里', '在哪', '什么时候', '何时', '多少', '能不能', '可不可以',
  '需要什么', '要带什么', '准备什么', '怎么办', '是否', '为什么', '谁负责', '流程是什么',
  '怎么申请', '怎么办理', '怎么去', '怎么走', '有没有', '有无', '是什么', '哪个',
  '哪一个', '属于', '还是', '住哪', '分到', '区别', '介绍一下', '尺寸', '多大',
  '几号', '哪天', '多少钱', '多长', '多宽', '多高', '哪些', '有什么要求',
  '申请条件', '具体规则', '评审流程', '能否', '要不要', '该不该', '是不是',
  '好不好', '怎么样', '多久'
] as const

const QUESTION_ENDING_PATTERN = /[?？吗嘛呢]$/u

const PROMPT_INJECTION_MARKERS = [
  '忽略之前的指令', '忽略此前指令', '忽略系统指令', '系统提示词', '开发者指令',
  '泄露密钥', '显示密钥', '输出apikey', 'jailbreak', 'ignore previous instructions',
  'reveal system prompt'
] as const

export function normalizeAssistantQuery(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function assistantIdentitySubject(value: string): string | null {
  const normalized = normalizeAssistantQuery(value)
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, '')
    .replace(/[?？。！!，,、；;]+$/u, '')
  const match = normalized.match(/^(.{2,24}?)(?:是谁|是什么人|哪位|个人简介|简介)$/u)
  const subject = match?.[1]?.trim()
  return subject && subject.length >= 2 ? subject : null
}

export function isQuestionLike(value: string): boolean {
  const query = normalizeAssistantQuery(value).toLocaleLowerCase('zh-CN')
  if (query.length < 4) return false
  return Boolean(assistantIdentitySubject(query))
    || QUESTION_ENDING_PATTERN.test(query)
    || QUESTION_MARKERS.some(marker => query.includes(marker))
}

export function containsPromptInjection(value: string): boolean {
  const query = normalizeAssistantQuery(value).toLocaleLowerCase('zh-CN').replace(/\s+/g, '')
  return PROMPT_INJECTION_MARKERS.some(marker => query.includes(marker.replace(/\s+/g, '')))
}

export function shouldRequestAssistantAnswer(value: string, localResultCount: number): boolean {
  const identityQuestion = Boolean(assistantIdentitySubject(value))
  return (localResultCount === 0 || identityQuestion)
    && isQuestionLike(value)
    && !containsPromptInjection(value)
}
