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
  'reveal system prompt',
  '制作炸弹', '自制爆炸物', '购买枪支', '制作枪支', '制作冰毒', '制作海洛因',
  '购买毒品', '贩卖毒品', '未成年人色情', '未成年裸照', '杀人不留痕',
  '雇凶杀人', '毒杀他人', '制作勒索软件', '部署木马后门', '盗取账号密码',
  '窃取银行卡密码', '入侵他人服务器', '入侵他人邮箱', '生成钓鱼网站代码',
  '批量撞库', '短信轰炸平台', '发动ddos攻击', '绕过支付验证', '盗刷信用卡',
  '破解他人微信', '获取他人数据库', '社工库查询', '查询他人开房记录',
  '定位他人手机号', '人肉搜索他人', '教我洗钱', '诈骗话术模板', '伪造身份证',
  '伪造公章', '代开发票', '搭建赌博平台', '博彩网站源码', '策划恐怖袭击',
  '加入恐怖组织', '制作生化武器', 'how to build a bomb', 'steal credit card numbers',
  'write ransomware for me', 'build a phishing website', 'bypass payment verification'
] as const

export function normalizeAssistantQuery(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function assistantIdentitySubject(value: string): string | null {
  const normalized = normalizeAssistantQuery(value)
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, '')
    .replace(/[?？。！!，,、；;]+$/u, '')
    .replace(/^(?:请|麻烦)?(?:介绍一下|介绍|讲讲|说说|我想了解|想了解)/u, '')
  const match = normalized.match(/^(.{2,24}?)(?:是谁|是什么人|哪位|个人简介|简介|的?(?:身份(?:和|与)?(?:经历|生平|履历)?|经历|生平|履历))$/u)
  const subject = match?.[1]?.trim().replace(/(?:老师|教师|教授)$/u, '')
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
