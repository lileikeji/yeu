import './load-env'
import { closeDatabase, getDatabase } from '../server/database/client'
import { answerCampusQuestion } from '../server/modules/assistant/service'

/**
 * End-to-end QA sweep for 答非所问 detection (2026-09 goal).
 *
 * Runs a large curated question set through the full local answer pipeline
 * (the same one production uses when the LLM gateway is degraded) against a
 * snapshot of the production database, and asserts topic/budget/area/category
 * expectations on the produced answer. Food recommendation is randomized
 * (biased shuffle), so every food question runs N times — an invariant broken
 * on ANY run counts as a failure. Output: per-question verdict lines plus a
 * summary grouped by failure kind. Read-only intent: writes are limited to the
 * snapshot's answer cache.
 */

interface SweepCase {
  name: string
  q: string
  /** Group tag for the summary report. */
  group: string
  /** Every substring must appear in answer or citation titles/snippets. */
  require?: string[]
  /** None of these may appear in the answer text. */
  forbid?: string[]
  /** Expect the food ranking-list answer shape. */
  foodList?: boolean
  /** Expect a single-shop detail answer mentioning this shop. */
  shopDetail?: string
  /** All 人均约 ¥N mentions must be ≤ this. */
  budgetMax?: number
  /** Numbered lines must not name drink/dessert-only shops (正餐 intent). */
  noDrinkShops?: boolean
  /** Area-tagged lines: only these areas allowed (学生街 counts for both). */
  areaOnly?: '新区' | '旧区'
  /** Citation titles must match this pattern. */
  categoryMatch?: RegExp
  /** Answer must NOT be the food ranking list. */
  notFoodList?: boolean
  /** Minimum citation count. */
  minCitations?: number
  /** How many times to repeat (food randomization). Default 1. */
  runs?: number
}

const FOOD_LIST_INTRO = '根据校园内已收录商家的评分数据'
const DRINK_ONLY = /(?:奶茶|咖啡|柠檬茶|茶饮|冰城|雪王|水吧|饮品|蜜雪|古茗|茶百道|沪上阿姨|益禾堂|书亦|瑞幸|幸运咖|CoCo|coco|霸王茶姬|喜茶|奈雪|柠季|大茶杯|甜品|蛋糕|西点|甜点|面包)/u

const CASES: SweepCase[] = [
  // ── 知识题（校规/生活，来自 eval 基线 + 真实用户日志）──────────────────
  { name: '军训时间', group: '知识', q: '今年军训什么时候开始？', require: ['军训'] },
  { name: '军训准备', group: '知识', q: '军训需要准备什么', require: ['军训'] },
  { name: '舒适型宿舍费用', group: '知识', q: '舒适型宿舍多少钱？', require: ['舒适型'] },
  { name: '普通型宿舍费用', group: '知识', q: '普通型宿舍多少钱？', require: ['普通型'] },
  { name: '综测构成', group: '知识', q: '综合测评怎么算，由哪些部分组成？', require: ['综合测评'] },
  { name: '综测加分', group: '知识', q: '综测加分有哪些', require: ['综测|综合测评'] },
  { name: '数学建模加分', group: '知识', q: '数学建模一等奖加多少分', require: ['数学建模|竞赛|综测|加分'] },
  // 口径缩写：句子里没有「竞赛」二字。这条扫描器不接网关，所以它专门验证
  // 「模型不可用时也要能答」——线上确实抓到过一次网关抖动导致该问法退回没找到。
  { name: '省一奖金', group: '知识', q: '省一能拿多少奖金', require: ['奖金|奖励'], forbid: ['没有找到'] },
  // 比赛归类：扫描器不接网关，所以这几条专门验证"表内赛事"的确定性打分。
  // 修前「数学建模一等奖」按校级只给 1 分，正确是 A类一等 6 分。
  { name: '数模A类一等', group: '知识', q: '综测 平均成绩85 专业最高90 数学建模一等奖', require: ['6 分', 'A类'] },
  { name: '挑战杯A类一等', group: '知识', q: '综测 平均成绩85 专业最高90 挑战杯一等奖', require: ['6 分', 'A类'] },
  { name: '省职业院校B类一等', group: '知识', q: '综测 平均成绩85 专业最高90 省职业院校技能大赛一等奖', require: ['4 分', 'B类'] },
  { name: '蓝桥杯B类一等', group: '知识', q: '综测 平均成绩85 专业最高90 蓝桥杯一等奖', require: ['4 分', 'B类'] },
  { name: '结构设计A类', group: '知识', q: '综测 平均成绩85 专业最高90 全国大学生结构设计竞赛一等奖', require: ['6 分', 'A类'] },
  // 轮次写法：学生常把校赛/省赛/国赛跟在赛事名后面
  { name: '数模校赛', group: '知识', q: '综测 平均成绩85 专业最高90 数学建模校赛一等奖', require: ['校级 一等'] },
  { name: '数模省赛', group: '知识', q: '综测 平均成绩85 专业最高90 数学建模省赛一等奖', require: ['4 分', 'B类'] },
  { name: '数模国赛', group: '知识', q: '综测 平均成绩85 专业最高90 数学建模国赛一等奖', require: ['6 分', 'A类'] },
  { name: '挑战杯省赛二等', group: '知识', q: '综测 平均成绩85 专业最高90 挑战杯省赛二等奖', require: ['3 分', 'B类'] },
  { name: '省二奖金标准', group: '知识', q: '省二奖金标准', require: ['奖金|奖励'] },
  { name: '一等奖加分', group: '知识', q: '一等奖加多少分', require: ['加分|免修|竞赛'] },
  // 反向保护：奖学金的一等奖不能被当成学科竞赛奖金表。
  // 2026-09-23 强化：旧断言只查「奖学金」字样，答成「竞赛获奖与奖学金」条目
  // （不含金额）也能过。档位词插入校名（仰恩**一等**奖学金）曾使金额匹配落空。
  { name: '奖学金一等奖', group: '知识', q: '仰恩一等奖学金多少钱', require: ['奖学金', '2000'], forbid: ['A类赛事', '竞赛管理办法'] },
  { name: '生源地贷款', group: '知识', q: '生源地信用助学贷款怎么申请？', require: ['助学贷款|生源地'] },
  // 奖学金简写与裸主题词：学生口语用「国奖/国励/励志」，条目正文写全称；
  // 裸主题词过去被答成某个窄条目或直接「请打开原文核对」。扫描器不接网关，
  // 正好验证这些必须走确定性条目（线上「奖学金」曾连问三次全失败）。
  { name: '国奖简写', group: '知识', q: '国奖多少', require: ['国家奖学金|10000|8000'] },
  { name: '国励简写', group: '知识', q: '国励多少', require: ['励志奖学金|6000|5000'] },
  { name: '励志奖学金全称', group: '知识', q: '励志奖学金多少', require: ['励志奖学金'] },
  { name: '裸主题词奖学金', group: '知识', q: '奖学金', require: ['奖学金'], forbid: ['请打开'] },
  { name: '裸主题词助学金', group: '知识', q: '助学金', require: ['助学金'], forbid: ['A类赛事'] },
  // 反向保护：真正的出行问法不能被"去公交化"改坏
  { name: '公交票价仍在', group: '公交', q: 'K2 多少钱', require: ['一票制|分段|K2'] },
  { name: '到校路线仍在', group: '公交', q: '坐几路车到仰恩', require: ['K2|K6|公交'] },
  // 反向保护：奖学金问价不能被公交劫持（曾经返回 K2/K6 票价表）
  { name: '奖学金问价', group: '公交', q: '仰恩一等奖学金多少钱', require: ['奖学金', '2000'], forbid: ['一票制', '分段累计'] },
  { name: '学费问价', group: '公交', q: '仰恩大学学费多少钱', require: ['学费'], forbid: ['一票制', '分段累计'] },
  { name: '转专业', group: '知识', q: '2026级新生什么时候申请转专业？', require: ['转专业'] },
  { name: '报到时间', group: '知识', q: '2026级什么时候报到？', require: ['报到'] },
  { name: '车停哪里', group: '知识', q: '新生报到 车停哪里', require: ['车|停车'] },
  { name: '快递地址', group: '知识', q: '新生快递地址怎么填？', require: ['快递'] },
  { name: '校园卡改密', group: '知识', q: '校园卡密码怎么改', require: ['校园卡|密码'] },
  { name: '教务密码忘了', group: '知识', q: '教务系统密码忘了怎么办', require: ['教务|密码'] },
  { name: '管理员密码', group: '知识', q: '管理员密码是什么', forbid: ['123456', 'admin123'] },
  { name: '校园卡电话卡', group: '知识', q: '校园卡是电话卡吗？', require: ['校园卡'] },
  { name: '电动车', group: '知识', q: '校内可以骑电动车吗？', require: ['电动车'] },
  { name: '叮叮车', group: '知识', q: '仰恩大学叮叮车是什么车？', require: ['叮叮车'] },
  { name: '门禁', group: '知识', q: '宿舍几点关门？', require: ['23:00|关门'] },
  { name: '学费', group: '知识', q: '2026级一年学费是多少？', require: ['学费'] },
  { name: '创始人', group: '知识', q: '吴庆星是谁？', require: ['吴庆星'] },
  { name: '新旧区', group: '知识', q: '新区旧区怎么分？有哪些宿舍楼？', require: ['新区|旧区'] },
  { name: '羽毛球场', group: '知识', q: '学校有羽毛球场吗？', require: ['羽毛球'] },
  { name: '夜不归宿', group: '知识', q: '夜不归宿怎么认定？', require: ['夜不归宿'] },
  { name: '助学金', group: '知识', q: '国家助学金怎么申请？', require: ['助学金'] },
  { name: '食堂开门', group: '知识', q: '食堂几点开门？', require: ['食堂'], notFoodList: true, forbid: ['评分较高的选择', '评分靠前'] },
  { name: '食堂营业时间', group: '知识', q: '食堂营业时间到几点', require: ['食堂'], notFoodList: true, forbid: ['评分较高的选择', '评分靠前'] },
  { name: '宿舍概览不被美食劫持', group: '知识', q: '宿舍怎么样', notFoodList: true },
  { name: '来源链接', group: '知识', q: '你的知识库来源链接是什么' },
  { name: '综测怎么算', group: '知识', q: '综测怎么算', require: ['满分100分', '德育25分'] },
  { name: '英文开学时间', group: '知识', q: 'when does school start?', require: ['September|9月'] },
  { name: '英文开学短写法', group: '知识', q: 'school start date', require: ['September|9月'] },
  { name: '电子信息工程教学区引导', group: '知识', q: '电子信息工程教学楼在哪个区', require: ['教学区'], forbid: ['舒适型宿舍'] },
  { name: '创业园名词', group: '服务设施', q: '创业园', require: ['创业园', '地图定位'], forbid: ['快递地址'] },
  { name: '图书馆名词', group: '服务设施', q: '图书馆', require: ['图书馆'], forbid: ['舒适型宿舍'] },
  { name: '新区操场名词', group: '服务设施', q: '新区操场', require: ['新区操场', '地图定位'] },
  { name: '天气不被美食劫持', group: '知识', q: '泉州最近一周天气怎么样', require: ['天气预报'], forbid: ['评分较高的选择', '串烧'] },
  { name: '下雨问法', group: '知识', q: '泉州明天会下雨吗', forbid: ['海交馆'], require: ['气象|天气'] },
  { name: '现在几点', group: '知识', q: '现在是几点', require: ['状态栏|时间'], forbid: ['美食'] },
  { name: '无档案人物引导', group: '知识', q: '宋富国是谁', require: ['没有找到'], forbid: ['评分较高的选择'] },

  // ── 服务设施 / 非美食意图（不得答成餐厅榜单）────────────────────────
  { name: '打印', group: '服务设施', q: '打印在哪', notFoodList: true, require: ['打印|复印|图文'] },
  // 存在性问句 + 本地无该类 POI：修复前锚词是「卖文具的店」，本地与网页候选
  // 全部被主题覆盖度判死，回答是与文具无关的纯 gap 文案。现在至少要给出
  // 含文具线索的证据（网页路径在线上还会给出仰恩村真实文具店）。
  { name: '文具店存在问句', group: '服务设施', q: '附近有没有卖文具的店', notFoodList: true, require: ['文具'] },
  // ── 第八轮（2026-09-23）：126 条真实问句回放 + 线上探针照出的确定性劫持 ──
  // 社团招新不得进竞赛分支（「数模」子串曾把问句带进智育奖励加分表）。
  { name: '社团招新', group: '服务设施', q: '电子数模协会什么时候招新', notFoodList: true, require: ['电子数模协会', '招新'], forbid: ['智育奖励', 'A类赛事', '学科技能竞赛'] },
  // 带片区前缀的裸地点要落到地图条目，不得被「舒适型宿舍位置」条目抢走。
  { name: '新区图书馆名词', group: '服务设施', q: '新区图书馆', require: ['图书馆'], forbid: ['舒适型', '衡山楼', '辽宁楼'] },
  // 校内导航问句给地图路线引导，不得被新生手册报到分组劫持。
  { name: '校内导航问句', group: '服务设施', q: '我在和昌教学楼门口，我要去旧区操场，', require: ['地图|步行'], forbid: ['报到', '普照大礼堂', '专业分组'] },
  // 综测加分总览不得答成申请表模板；反过来问申请表仍要答申请表。
  { name: '综测怎么加分', group: '知识', q: '综测怎么加分', require: ['德育奖励|加分'], forbid: ['自评报告', '模板包含'] },
  { name: '综测加分申请表反向', group: '知识', q: '申请综测加分需要填什么表', require: ['自评报告|申请表'] },
  // 非床语境的尺寸问句不得继承蚊帐 90×190；宿舍语境反向保护。
  { name: '桌子尺寸', group: '知识', q: '桌子尺寸', forbid: ['蚊帐', '90×190', '90x190'] },
  { name: '宿舍尺寸反向', group: '知识', q: '宿舍尺寸', require: ['90×190|90x190|0\\.9|1\\.9'] },
  { name: '理发店推荐', group: '服务设施', q: '理发店推荐', notFoodList: true },
  { name: '台球', group: '服务设施', q: '新区有可以打台球的吗', notFoodList: true, require: ['八洛克台球'] },
  { name: '附近台球', group: '服务设施', q: '附近台球', notFoodList: true, require: ['八洛克台球'] },
  { name: '台球厅问法', group: '服务设施', q: '学校附近有台球厅吗', notFoodList: true, require: ['八洛克台球'] },
  { name: '台球带数字', group: '服务设施', q: '8洛克台球在哪', notFoodList: true, require: ['八洛克台球'] },
  { name: '大门进入', group: '服务设施', q: '新区学生从哪个大门进入学校', notFoodList: true },
  { name: '快递取件', group: '服务设施', q: '快递在哪取', notFoodList: true },
  { name: '中通取件', group: '服务设施', q: '中通快递在哪取', require: ['快递联盟（中通）', '地图定位'] },
  { name: '圆通取件', group: '服务设施', q: '圆通去哪个驿站拿快递', require: ['宝洁洗衣店', '地图定位'] },
  { name: '京东取件', group: '服务设施', q: '京东快递在哪拿', require: ['车来车往', '地图定位'] },
  { name: '顺丰取件', group: '服务设施', q: '顺丰快递到哪拿', require: ['宝洁洗衣店', '地图定位'] },
  { name: '韵达取件', group: '服务设施', q: '韵达在哪取件', require: ['韵达快递', '地图定位'] },
  { name: '未收录品牌取件', group: '服务设施', q: '申通快递在哪取', require: ['暂未收录'], forbid: ['快递联盟'] },
  { name: '快递丢件', group: '服务设施', q: '快递丢了怎么办', require: ['客服|工单'] },
  { name: '超市购物', group: '服务设施', q: '学校附近有超市吗', notFoodList: true },
  { name: '网吧', group: '服务设施', q: '学校附近有没有网吧', notFoodList: true },
  { name: '药店', group: '服务设施', q: '校内哪里有药店', notFoodList: true },
  { name: '自习室', group: '服务设施', q: '晚上想去自习去哪里', notFoodList: true },

  // ── 单店详情（店名+评分+整理评价）────────────────────────────────
  { name: '古茗详情', group: '单店', q: '古茗怎么样', shopDetail: '古茗' },
  { name: '蜜雪冰城详情', group: '单店', q: '蜜雪冰城怎么样', shopDetail: '蜜雪' },
  { name: '塔斯汀详情', group: '单店', q: '塔斯汀怎么样', shopDetail: '塔斯汀' },
  { name: '芭比Q详情', group: '单店', q: '芭比Q怎么样', shopDetail: '芭比' },
  { name: '沙县详情', group: '单店', q: '沙县小吃怎么样', shopDetail: '沙县' },
  { name: '老贵阳详情', group: '单店', q: '老贵阳牛肉粉怎么样', shopDetail: '老贵阳' },
  { name: '牛先生详情', group: '单店', q: '牛先生火锅怎么样', shopDetail: '牛先生' },
  { name: '马氏详情', group: '单店', q: '马氏小吃店怎么样', shopDetail: '马氏' },
  { name: '串烧烤肉详情', group: '单店', q: '串烧烤肉怎么样', shopDetail: '串烧' },
  { name: '店名追问-蜜雪', group: '单店', q: '那蜜雪冰城呢', shopDetail: '蜜雪' },

  // ── 正餐意图：必须剔除纯饮品甜品店 ────────────────────────────────
  { name: '预算20吃什么', group: '正餐意图', q: '预算20吃什么', foodList: true, budgetMax: 20, noDrinkShops: true, runs: 3 },
  { name: '中午吃什么', group: '正餐意图', q: '中午吃什么', foodList: true, noDrinkShops: true, runs: 3 },
  { name: '晚上吃什么', group: '正餐意图', q: '晚上吃什么', foodList: true, noDrinkShops: true, runs: 3 },
  { name: '早餐吃什么', group: '正餐意图', q: '早餐吃什么', foodList: true, noDrinkShops: true, runs: 3 },
  { name: '夜宵吃什么', group: '正餐意图', q: '夜宵吃什么', foodList: true, noDrinkShops: true, runs: 3 },
  { name: '两个人吃饭', group: '正餐意图', q: '两个人吃饭', foodList: true, noDrinkShops: true, runs: 3 },
  { name: '聚餐去哪', group: '正餐意图', q: '聚餐去哪', foodList: true, noDrinkShops: true, runs: 3 },
  { name: '想吃米饭', group: '正餐意图', q: '想吃米饭', foodList: true, noDrinkShops: true, runs: 3 },
  { name: '中午吃什么预算15', group: '正餐意图', q: '中午吃什么 预算15以内', foodList: true, budgetMax: 15, runs: 3 },
  { name: '去食堂吃', group: '正餐意图', q: '去食堂吃', foodList: true, noDrinkShops: true, runs: 3 },
  { name: '食堂贵不贵', group: '正餐意图', q: '食堂贵不贵', foodList: true },

  // ── 区域过滤 ─────────────────────────────────────────────────────
  { name: '新区好吃的', group: '区域', q: '新区有什么好吃的', foodList: true, areaOnly: '新区', runs: 3 },
  { name: '旧区好吃的', group: '区域', q: '旧区有什么好吃的', foodList: true, areaOnly: '旧区', runs: 3 },
  { name: '新区推荐', group: '区域', q: '新区推荐', foodList: true, areaOnly: '新区', runs: 3 },
  { name: '旧区学生街推荐', group: '区域', q: '旧区学生街推荐', foodList: true, areaOnly: '旧区', runs: 3 },
  { name: '学生街好吃的', group: '区域', q: '学生街有什么好吃的', foodList: true, runs: 3 },
  { name: '附近好吃的', group: '区域', q: '附近有什么好吃的', foodList: true, runs: 3 },

  // ── 预算/价位 ────────────────────────────────────────────────────
  { name: '预算10吃什么', group: '预算', q: '预算10块吃什么', foodList: true, budgetMax: 10, runs: 3 },
  { name: '预算30吃什么', group: '预算', q: '预算30吃什么', foodList: true, budgetMax: 30, runs: 3 },
  { name: '人均30以内的', group: '预算', q: '人均30以内的', foodList: true, budgetMax: 30, runs: 3 },
  { name: '便宜的好吃的', group: '预算', q: '便宜的好吃的', foodList: true, budgetMax: 20, runs: 3 },
  { name: '预算5', group: '预算', q: '预算5吃什么', foodList: true, runs: 2 },

  // ── 品类 ─────────────────────────────────────────────────────────
  { name: '奶茶推荐', group: '品类', q: '奶茶推荐', foodList: true, categoryMatch: /奶茶|柠檬茶|咖啡|茶饮|冰城|雪王|饮品|古茗|蜜雪|茶百道|沪上|益禾|书亦|瑞幸|coco|霸王茶姬|喜茶|奈雪|柠季/i, runs: 3 },
  { name: '那奶茶呢', group: '品类', q: '那奶茶呢', foodList: true, categoryMatch: /奶茶|柠檬茶|咖啡|茶饮|冰城|雪王|饮品|古茗|蜜雪|茶百道|沪上|益禾|书亦|瑞幸|coco|霸王茶姬|喜茶|奈雪|柠季/i, runs: 2 },
  { name: '咖啡推荐', group: '品类', q: '咖啡推荐', foodList: true, categoryMatch: /咖啡|瑞幸|幸运咖|coco|库迪/i, runs: 3 },
  { name: '火锅呢', group: '品类', q: '那火锅呢', foodList: true, categoryMatch: /火锅|涮|牛先生|重庆/i, runs: 3 },
  { name: '烧烤推荐', group: '品类', q: '烧烤推荐', foodList: true, categoryMatch: /烧烤|烤串|烤肉|铁板|烤鱼|串烧/i, runs: 3 },
  { name: '吃辣的', group: '品类', q: '吃辣的有哪些', foodList: true, categoryMatch: /麻辣|辣|川菜|湘菜|鸡公煲|螺蛳粉|烤鱼|火锅|牛肉粉/i, runs: 3 },
  { name: '不辣的推荐', group: '品类', q: '不辣的推荐', foodList: true, forbid: ['麻辣烫', '麻辣拌', '螺蛳粉'], runs: 3 },
  { name: '吃面呢', group: '品类', q: '吃面呢', foodList: true, categoryMatch: /面|粉|米线|馄饨|云吞/i, runs: 3 },
  { name: '寿司推荐', group: '品类', q: '寿司推荐', foodList: true, require: ['没有完全符合你条件的店|暂时没有收录寿司'], runs: 2 },
  { name: '汉堡快餐', group: '品类', q: '快餐推荐', foodList: true, categoryMatch: /汉堡|鸡排|炸鸡|快餐|盖饭|拌饭|塔斯汀|脆皮鸡/i, runs: 3 },
  { name: '甜品推荐', group: '品类', q: '甜品推荐', foodList: true, categoryMatch: /甜品|蛋糕|西点|面包|烘焙|奶茶|冰城|蜜雪/i, runs: 3 },
  { name: '水果', group: '品类', q: '有没有水果', foodList: true, categoryMatch: /水果|果切|鲜果|果捞|果茶/i, runs: 3 },
  { name: '有什么喝的', group: '品类', q: '有什么喝的', foodList: true, categoryMatch: /奶茶|柠檬茶|咖啡|茶饮|冰城|雪王|饮品|古茗|蜜雪|果茶/i, runs: 3 },
  { name: '包子铺', group: '品类', q: '包子铺', foodList: true, categoryMatch: /包子|水饺|饺子|馒头|早餐/i, runs: 3 },
  { name: '早餐推荐', group: '品类', q: '早餐推荐', foodList: true, categoryMatch: /早餐|早点|面线糊|包子|豆浆/i, runs: 3 },
  { name: '夜宵推荐', group: '品类', q: '夜宵推荐', foodList: true, runs: 3 },
  { name: '下午茶推荐', group: '品类', q: '下午茶推荐', foodList: true, runs: 3 },
  { name: '快餐晚餐', group: '品类', q: '晚上吃什么好', foodList: true, noDrinkShops: true, runs: 3 },

  // ── 综合/别的措辞 ────────────────────────────────────────────────
  { name: '学校哪个食堂好吃', group: '综合', q: '学校食堂哪个好吃', foodList: true, runs: 2 },
  { name: '换口味', group: '综合', q: '想换换口味', foodList: true, runs: 2 },
  { name: '评分高', group: '综合', q: '哪家评分高', foodList: true, runs: 2 },
  { name: '新开的店', group: '综合', q: '最近有新开的店吗', foodList: true, runs: 2 },
  { name: '清真的', group: '综合', q: '有清真食堂吗', require: ['清真'], forbid: ['根据校园内已收录商家的评分数据'] },
  { name: '食堂在哪吃', group: '综合', q: '校内餐厅有哪些', foodList: true, runs: 2 },
  { name: '贵的大餐', group: '综合', q: '想搓一顿大餐', foodList: true, runs: 2 },
  { name: '生日请客', group: '综合', q: '生日请客去哪吃', foodList: true, noDrinkShops: true, runs: 2 }
]

const emptyAssistantConfig = {
  gatewayBaseUrl: '',
  gatewayApiKey: '',
  gatewayModel: '',
  gatewayTimeoutMs: 1000,
  mcpSearchUrl: '',
  mcpSearchBearerToken: '',
  mcpAllowedHosts: '',
  mcpToolName: '',
  mcpTimeoutMs: 1000,
  gatewayLookup: async () => ['93.184.216.34']
}

interface Failure {
  name: string
  group: string
  q: string
  run: number
  issues: string[]
  answerHead: string
  citations: string
}

const databaseArg = process.argv.find(arg => arg.startsWith('--database='))
const databasePath = databaseArg ? databaseArg.split('=')[1] : '.data/sweep/yeu-sweep.sqlite'
const onlyGroup = process.argv.find(arg => arg.startsWith('--group='))?.split('=')[1]

const client = getDatabase(databasePath)
const failures: Failure[] = []
let checked = 0

for (const testCase of CASES) {
  if (onlyGroup && testCase.group !== onlyGroup) continue
  const runs = testCase.runs ?? 1
  for (let run = 1; run <= runs; run++) {
    checked++
    const issues: string[] = []
    let answer = ''
    let citationText = ''
    try {
      const response = await answerCampusQuestion(client, testCase.q, emptyAssistantConfig)
      answer = response.answer ?? ''
      citationText = response.citations.map(c => `${c.title} ${c.snippet ?? ''}`).join(' | ')
      const haystack = `${answer}\n${citationText}`
      const lines = answer.split('\n').filter(line => /^\d+\./.test(line.trim()))
      const isFoodList = answer.includes(FOOD_LIST_INTRO)

      if (testCase.foodList && !isFoodList) {
        issues.push(`expected food list, got: ${answer.slice(0, 80).replace(/\n/g, ' ')}`)
      }
      if (testCase.notFoodList && isFoodList) {
        issues.push('food list leaked into non-food question')
      }
      if (testCase.shopDetail && !(haystack.includes(testCase.shopDetail) && /高德评分|分/.test(answer))) {
        issues.push(`expected shop detail for ${testCase.shopDetail}, got: ${answer.slice(0, 80).replace(/\n/g, ' ')}`)
      }
      if (testCase.require) {
        for (const term of testCase.require) {
          if (!new RegExp(term).test(haystack)) issues.push(`missing required term /${term}/`)
        }
      }
      if (testCase.forbid) {
        for (const term of testCase.forbid) {
          if (answer.includes(term)) issues.push(`forbidden term "${term}" in answer`)
        }
      }
      if (testCase.minCitations !== undefined && response.citations.length < testCase.minCitations) {
        issues.push(`citations ${response.citations.length} < ${testCase.minCitations}`)
      }
      if (testCase.budgetMax !== undefined) {
        const costs = [...answer.matchAll(/人均约\s*¥(\d+)/gu)].map(m => Number(m[1]))
        const over = costs.filter(cost => cost > testCase.budgetMax!)
        if (over.length > 0) issues.push(`budget leak: 人均 ${over.join(',')} > ${testCase.budgetMax}`)
        if (isFoodList && costs.length === 0) issues.push('no per-person cost found to verify budget')
      }
      if (testCase.noDrinkShops && isFoodList && !/没有完全符合你条件的店|暂时没有收录/u.test(answer)) {
        const drinkLines = lines.filter(line => DRINK_ONLY.test(line))
        if (drinkLines.length > 0) {
          issues.push(`drink shops in meal list: ${drinkLines.map(l => l.slice(0, 40)).join(' // ')}`)
        }
      }
      if (testCase.areaOnly && isFoodList) {
        const otherArea = testCase.areaOnly === '新区' ? '旧区' : '新区'
        const wrong = lines.filter(line => line.includes(`[${otherArea}]`))
        if (wrong.length > 0) issues.push(`area leak [${otherArea}]: ${wrong.map(l => l.slice(0, 40)).join(' // ')}`)
      }
      if (testCase.categoryMatch && isFoodList) {
        const titles = response.citations.map(c => c.title).join('|')
        if (titles && !testCase.categoryMatch.test(titles)) {
          issues.push(`category mismatch in top citations: ${titles}`)
        }
      }
    } catch (error) {
      issues.push(`THROW: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (issues.length > 0) {
      failures.push({
        name: testCase.name,
        group: testCase.group,
        q: testCase.q,
        run,
        issues,
        answerHead: answer.slice(0, 200).replace(/\n/g, ' ⏎ '),
        citations: citationText.slice(0, 150)
      })
    }
  }
}

console.log(`\n===== SWEEP: ${checked} runs, ${CASES.length} cases, ${failures.length} failures =====`)
const byGroup = new Map<string, Failure[]>()
for (const failure of failures) {
  const list = byGroup.get(failure.group) ?? []
  list.push(failure)
  byGroup.set(failure.group, list)
}
for (const [group, list] of byGroup) {
  console.log(`\n## [${group}] ${list.length} failures`)
  for (const failure of list.slice(0, 12)) {
    console.log(`✗ ${failure.name} (run ${failure.run}) Q="${failure.q}"`)
    for (const issue of failure.issues) console.log(`   - ${issue}`)
    console.log(`   A: ${failure.answerHead}`)
    if (failure.citations) console.log(`   C: ${failure.citations}`)
  }
  if (list.length > 12) console.log(`   ... and ${list.length - 12} more`)
}
closeDatabase(databasePath)
process.exit(failures.length > 0 ? 1 : 0)
