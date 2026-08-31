const QUESTION_MARKERS = [
  '怎么', '如何', '哪里', '在哪', '什么时候', '何时', '多少', '能不能', '可不可以',
  '需要什么', '要带什么', '准备什么', '怎么办', '是否', '为什么', '谁负责', '流程是什么',
  '怎么申请', '怎么办理', '怎么去', '怎么走', '有没有', '有无', '是什么', '哪个',
  '哪一个', '属于', '还是', '住哪', '分到', '区别', '介绍一下', '尺寸', '多大',
  '几号', '哪天', '多少钱', '多长', '多宽', '多高', '哪些', '有什么要求',
  '几点', '几点开门', '几点关门', '几点开始', '几点结束',
  '申请条件', '具体规则', '评审流程', '能否', '要不要', '该不该', '是不是',
  '好不好', '怎么样', '多久', '几人间', '几个人', '几人', '几天',
  '急不急', '允不允许', '会不会', '够不够', '容不容易',
  '哪栋楼', '哪一栋', '叫什么',
  // Entity-intent questions (clubs, procedures, departments): "做什么/门槛/
  // 联系方式/怎么加入" are questions even without a trailing 吗/呢 marker.
  '是做什么的', '做什么的', '是干嘛的', '干嘛的', '主要做什么', '是干什么的',
  '干什么的', '什么门槛', '加入门槛', '怎么加入', '怎样加入', '如何加入',
  '联系方式', '怎么联系', '怎么报名', '什么要求', '招新', '报名方式',
  '什么时候招新', '怎么收费', '收不收费', '要不要收费', '在哪招', '在哪报名',
  // Food/recommendation intent: "有什么推荐/推荐吃什么/附近吃什么" are
  // questions even without a trailing 吗/呢 marker.
  '有什么', '有什么推荐', '推荐', '推荐吃什么', '吃什么', '去哪吃', '哪家',
  '有什么好吃的', '有什么吃的', '推荐一家', '评分高', '好吃吗', '附近吃什么',
  '附近有什么', '附近吃', '吃啥', '吃点啥', '吃点什么', '吃啥好', '吃什么好',
  '想吃', '想吃点', '想吃什么', '想吃啥', '吃点', '吃辣的', '辣的', '麻辣',
  '聚餐', '吃饭', '去吃', '换口味', '换换口味', '换个口味', '不辣', '不吃辣',
  '早饭', '午餐', '晚餐', '有哪些', '有哪家', '新开', '新开的', '最近开'
] as const

const QUESTION_ENDING_PATTERN = /[?？吗嘛呢么]$/u

const ASSISTANT_COMMAND_PATTERN = /(?:给(?:我)?(?:个|一份)?|发(?:我)?(?:个|一份)?|打开|进入|带我(?:去|看)?|帮我(?:查|找|看)?|查一下|找一下|看一下|看看|展示|跳转到).{0,20}(?:校园|学校|地图|平面图|导览图|校区图|入口|页面|路线|导航|流程|清单|宿舍|社团|成绩|教务|规则|奖学金)/u

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

const SECRET_EXTRACTION_PATTERN = /(?:告诉|给|发|显示|输出|泄露|查看|看看|获取|提供|交出).{0,12}(?:你的|系统|接口|后台|中转|服务)?(?:密钥|秘钥|api(?:key|密钥)|token|访问令牌|authorization)/iu
const SEXUAL_EXPLOITATION_PATTERN = /(?:幼女.{0,8}(?:视频|资源|裸照|色情|成人)|(?:未成年|儿童|小学生).{0,8}(?:色情|裸照|成人视频|性服务|性侵)|儿童色情)/iu
const TARGETED_ABUSE_PATTERN = /^.{1,24}(?:是|就是|真是|是不是)(?:个)?(?:傻逼|煞笔|蠢货|废物|贱人)(?:[?？!！。]|$)/iu

export function normalizeAssistantQuery(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

// Generic school-role references that resolve to a concrete person. The
// identity route searches for evidence about the SUBJECT NAME, so a bare
// role word (e.g. 「学校创始人」→「学校」) is too broad to retrieve a profile.
// These are the school's documented facts (see server/modules/assistant/
// assistant-knowledge.ts): 吴庆星 founded the Yang-En Foundation with 林惠,
// and 林惠 chairs the university's board.
const IDENTITY_SUBJECT_ALIASES: Readonly<Record<string, string>> = {
  创始人: '吴庆星',
  创办人: '吴庆星',
  校主: '吴庆星',
  学校创始人: '吴庆星',
  学校创办人: '吴庆星',
  仰恩大学创始人: '吴庆星',
  仰恩大学创办人: '吴庆星',
  仰恩基金会创始人: '吴庆星',
  仰恩基金会创办人: '吴庆星',
  董事长: '林惠',
  校董: '林惠',
  学校董事长: '林惠',
  举办者: '林惠',
  学校举办者: '林惠',
  仰恩大学董事长: '林惠'
}

// A school-role term that, when stripped of its trailing role word, leaves
// only a generic noun (「学校」「仰恩大学」) which cannot anchor an identity
// profile on its own.
const GENERIC_IDENTITY_TARGET_RE = /^(?:学校|本校|仰恩大学|仰恩学院|这所学校|我们学校|仰恩基金会)$/u

export function assistantIdentitySubject(value: string): string | null {
  const normalized = normalizeAssistantQuery(value)
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, '')
    .replace(/[?？。！!，,、；;]+$/u, '')
    .replace(/^(?:请问|问一下|麻烦问一下|请|麻烦)?(?:介绍一下|介绍|讲讲|说说|我想了解|想了解)/u, '')
    .replace(/^请问/u, '')

  // "谁创办了仰恩大学" / "仰恩大学是谁创办的" style founder questions,
  // which do not carry the subject name at all.
  const founderTarget = normalized.match(/^谁(?:创办|创立|创建|建立|发起|出资|投资)了?([^。！？?]{0,20})$/u)?.[1]
  if (founderTarget !== undefined && GENERIC_IDENTITY_TARGET_RE.test(founderTarget)) return '吴庆星'
  const foundedByTarget = normalized.match(/^([^。！？?]{2,20})是谁(?:创办|创立|创建|建立|发起|出资)的/u)?.[1]
  if (foundedByTarget && GENERIC_IDENTITY_TARGET_RE.test(foundedByTarget)) return '吴庆星'

  const match = normalized.match(/^(.{2,24}?)(?:是谁|是什么人|哪位|个人简介|简介|的?(?:身份(?:和|与)?(?:经历|生平|履历)?|经历|生平|履历))$/u)
  const rawSubject = match?.[1]?.trim()
  if (!rawSubject) return null
  // Resolve generic role references before stripping the trailing role word,
  // so 「学校创始人」 maps to 吴庆星 instead of degrading to 「学校」.
  const alias = IDENTITY_SUBJECT_ALIASES[rawSubject]
  if (alias) return alias
  const subject = rawSubject.replace(/(?:老师|教师|教授|老板|董事长|创始人|创办人)$/u, '')
  return subject.length >= 2 ? subject : null
}

// Self-referential conversational statements ("我喜欢在晚上学习效率更高",
// "我这人有什么学习习惯") are chat/memory material rather than search keywords.
// Without this they hit the 422 keyword-search redirect and can never be
// remembered or recalled by the session-memory layer.
const SELF_REFERENTIAL_PATTERN = /(?:我|俺|咱|本人)(?:.{0,16}?)(?:喜欢|觉得|认为|希望|想要|打算|习惯|爱|是|在|住|学|考|选|报|买|带|吃|用|玩|想|家|专业|班|宿舍)/u

export function isQuestionLike(value: string): boolean {
  const query = normalizeAssistantQuery(value).toLocaleLowerCase('zh-CN')
  if (query.length < 2) return false
  return Boolean(assistantIdentitySubject(query))
    || QUESTION_ENDING_PATTERN.test(query)
    || QUESTION_MARKERS.some(marker => query.includes(marker))
    || ASSISTANT_COMMAND_PATTERN.test(query)
    || SELF_REFERENTIAL_PATTERN.test(query)
}

export function containsPromptInjection(value: string): boolean {
  const query = normalizeAssistantQuery(value).toLocaleLowerCase('zh-CN').replace(/\s+/g, '')
  return PROMPT_INJECTION_MARKERS.some(marker => query.includes(marker.replace(/\s+/g, '')))
    || SECRET_EXTRACTION_PATTERN.test(query)
    || SEXUAL_EXPLOITATION_PATTERN.test(query)
    || TARGETED_ABUSE_PATTERN.test(query)
}

export function shouldRequestAssistantAnswer(value: string, localResultCount: number): boolean {
  const identityQuestion = Boolean(assistantIdentitySubject(value))
  return (localResultCount === 0 || identityQuestion)
    && isQuestionLike(value)
    && !containsPromptInjection(value)
}
