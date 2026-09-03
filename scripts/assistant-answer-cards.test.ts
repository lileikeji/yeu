import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseAssistantFoodAnswer,
  parseAssistantShopDetail
} from '../app/utils/assistant-answer-cards'

const FOOD_ANSWER = [
  '根据校园内已收录商家的评分数据（评分来自高德聚合，口碑摘录自大众点评用户评价整理），按你的需求，这几家口碑和评分都不错，供你参考（已按预算 ¥20 以内筛选）：',
  '',
  '1. [新区] 蜜雪冰城(仰恩大学新校区店)：4.3 分，人均约 ¥4（冰鲜柠檬水三块一大杯；出餐快、店员热情）〔地图定位〕',
  '2. [学生街] 太姥山正宗福鼎肉片：4.2 分，人均约 ¥14〔地图定位〕',
  '3. 马氏小吃店：4.2 分，人均约 ¥17（青椒炒牛肉下饭）〔地图定位〕',
  '',
  '实际口味因人而异。打开校园地图（学生街区域）点击对应商家，可查看评分详情和整理评价。'
].join('\n')

test('food answer parses into intro, ranked cards and tail', () => {
  const parsed = parseAssistantFoodAnswer(FOOD_ANSWER)
  assert.ok(parsed)
  assert.match(parsed.intro, /按你的需求/)
  assert.equal(parsed.items.length, 3)
  assert.deepEqual(parsed.items[0], {
    area: '新区',
    name: '蜜雪冰城(仰恩大学新校区店)',
    score: 4.3,
    cost: 4,
    tips: ['冰鲜柠檬水三块一大杯', '出餐快、店员热情']
  })
  assert.equal(parsed.items[1]!.area, '学生街')
  assert.equal(parsed.items[2]!.area, null)
  assert.equal(parsed.items[2]!.cost, 17)
  assert.doesNotMatch(parsed.tail, /地图定位/)
  assert.match(parsed.tail, /实际口味因人而异/)
})

test('food parser rejects answers without the ranked-list shape', () => {
  assert.equal(parseAssistantFoodAnswer('内置资料暂时没有找到可以确认这个问题的内容。'), null)
  assert.equal(parseAssistantFoodAnswer([
    '食堂要点如下：',
    '1. 北苑餐厅一楼有麻辣烫档口。',
    '2. 西苑餐厅二楼是自选菜。'
  ].join('\n')), null)
  // A single item is not a list — keep the plain-text renderer.
  assert.equal(parseAssistantFoodAnswer([
    '按你的需求，先看看这些评分靠前的选择：',
    '',
    '1. [新区] 蜜雪冰城(仰恩大学新校区店)：4.3 分，人均约 ¥4〔地图定位〕'
  ].join('\n')), null)
})

test('food parser keeps category-named relax intros', () => {
  const parsed = parseAssistantFoodAnswer([
    '根据校园内已收录商家的评分数据（评分来自高德聚合，口碑摘录自大众点评用户评价整理），校园周边暂时没有收录寿司类的商家，先看看这些评分靠前的选择：',
    '',
    '1. [学生街] 芭比Q(仰恩大学店)：4.5 分，人均约 ¥54〔地图定位〕',
    '2. [学生街] 古茗(仰恩大学店)：4.4 分，人均约 ¥16〔地图定位〕',
    '',
    '实际口味因人而异。'
  ].join('\n'))
  assert.ok(parsed)
  assert.match(parsed.intro, /暂时没有收录寿司类的商家/)
})

const SHOP_ANSWER = [
  '蜜雪冰城(仰恩大学新校区店)：高德评分 4.3 分，人均约 ¥4。〔地图定位〕',
  '',
  '整理自大众点评用户评价：',
  '【综合口碑】4.6 分：学生街的平价奶茶刚需店，人均三四块就能喝到。',
  '【招牌产品】4.5 分：冰鲜柠檬水三块一大杯，酸甜冰爽。',
  '',
  '以上为评价整理（非原文），实际口味因人而异，到店前可在地图卡片再核对。'
].join('\n')

test('shop detail parses header score, cost and review cards', () => {
  const parsed = parseAssistantShopDetail(SHOP_ANSWER)
  assert.ok(parsed)
  assert.equal(parsed.shopName, '蜜雪冰城(仰恩大学新校区店)')
  assert.equal(parsed.amapScore, 4.3)
  assert.equal(parsed.cost, 4)
  assert.equal(parsed.reviews.length, 2)
  assert.deepEqual(parsed.reviews[0], {
    tag: '综合口碑',
    score: 4.6,
    content: '学生街的平价奶茶刚需店，人均三四块就能喝到。'
  })
  assert.doesNotMatch(parsed.tail, /地图定位/)
  assert.match(parsed.tail, /以上为评价整理/)
})

test('shop detail parser rejects knowledge answers and broken shapes', () => {
  assert.equal(parseAssistantShopDetail('按学校校历：2026级新生9月5日至6日报到。'), null)
  assert.equal(parseAssistantShopDetail([
    '蜜雪冰城(仰恩大学新校区店)：高德评分 4.3 分，人均约 ¥4。〔地图定位〕',
    '',
    '整理自大众点评用户评价：',
    '这条评价格式坏掉了，没有标签和分数。'
  ].join('\n')), null)
})
