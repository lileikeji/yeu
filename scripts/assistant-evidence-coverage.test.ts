import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assistantQueryAnchors,
  evidenceCoversQuerySubject,
  filterWebEvidenceForQuery,
  rankCitationEvidence,
  studentRuleLocalAnswer
} from '../server/modules/assistant/service'
import type { ApiAssistantCitation } from '../shared/types/server'

/**
 * 2026-09-23 线上排查（答非所问专项）固化下来的三组回归：
 *
 * 1. presence 问句的锚词被方位词 + 动词外壳污染：「附近有没有卖文具的店」
 *    anchors 是 ["附近","卖文具的店"]，没有任何网页原文逐字包含「卖文具的店」，
 *    evidenceCoversQuerySubject 把仰恩村两家真实文具店的网页结果整批丢弃，
 *    用户只得到「没找到」。修复后锚词收敛为主题本身。
 * 2. 「仰恩一等奖学金多少钱」字面不含「仰恩奖学金」，金额匹配落空，
 *    答成「竞赛获奖与奖学金」条目（答非所问）。
 * 3. 反向保护：竞赛奖金问法不得被学生奖学金分支抢走。
 */

// 真实 MCP 抓取结果（2026-09-23，查询：泉州洛江马甲 仰恩大学 附近有没有卖文具的店）
const stationeryWebResults: ApiAssistantCitation[] = [
  {
    title: '洛江区马甲吴容辉文具店- 天眼查',
    url: 'https://www.tianyancha.com/company/3349723453',
    snippet: '福建省泉州市洛江区马甲镇仰恩村大新厝1号仰恩大学湖南楼605室. 附近企业. 国标行业：文具用品零售. 企业规模： 微型. 简介：洛江区马甲吴容辉文具店，成立于2019年，位于 ...',
    source: 'web'
  },
  {
    title: '洛江区马甲杜子宾文具店-启信宝',
    url: 'https://www.qixin.com/company/9ef29738-fee1-4ce8-a2be-d76a9944b58c',
    snippet: '地址：福建省泉州市洛江区马甲镇仰恩村大新厝1号仰恩大学网络信息中心楼查看详情附近企业. 简介：洛江区马甲杜子宾文具店成立于2019年04月15日，注册地址为福建省泉州市洛 ...',
    source: 'web'
  },
  {
    title: "Kaohsiung's independent stationery stores are amazing! I met a ...",
    url: 'https://www.youtube.com/watch?v=29x6J3yQPHc',
    snippet: '我沒想到身為文具控的我居然有一天被打敗我感覺我只是一個熱愛文具的人文具的世界也太深奧了吧看來我要繼續更精進才行。',
    source: 'web'
  },
  {
    title: '[PDF] 2025年泉州市洛江区市场监督管理局食品监管领域 ... - 洛江区人民政府',
    url: 'http://www.qzlj.gov.cn/zwgk/zfxxgkzl/bmzfxxgk/scjdglj/zfxxgkml/202512/P020251219346593635658.pdf',
    snippet: '泉州市洛江区万安京报道服装店. 福建省泉州市洛江区万安万福街66号. JY13505040056762. 符合. 泉州市洛江区马甲龙溪农家菜馆. 马甲镇新奄村龙溪33号. JY23615040022491.',
    source: 'web'
  },
  {
    title: '金榜文具(X304店) - 泉州市洛江区213省道与304县- 购物服务 - 高德地图',
    url: 'https://www.amap.com/place/B0HGKLJIUD',
    snippet: '金榜文具(X304店)是一家文化用品店，地址为泉州市洛江区213省道与304县道交叉口东320米。地理坐标：25.213552,118.611355。您可以通过Amap查看金榜文具(X304店)的精确 ...',
    source: 'web'
  },
  {
    title: '仰恩大学',
    url: 'https://web.yeu.edu.cn/',
    snippet: '数说仰恩 · 图书馆藏纸质文献. 150+. 万册 · 本科专业. 26. 个 · 学校占地面积. 2000+ 亩',
    source: 'web'
  }
]

test('presence query anchors drop scope words and verb/object shells', () => {
  assert.deepEqual(assistantQueryAnchors('附近有没有卖文具的店'), ['文具'])
  assert.deepEqual(assistantQueryAnchors('卖奶茶的店'), ['奶茶'])
  assert.deepEqual(assistantQueryAnchors('推荐个打印店'), ['打印'])
  // 主题型锚词不能被方位词剔除误伤：校园卡 是精确相等之外的复合词。
  assert.ok(assistantQueryAnchors('校园卡怎么充值').includes('校园卡'))
  // 无外壳的专名锚词保持原样（垃圾网页靠它继续被拒）。
  assert.deepEqual(assistantQueryAnchors('闲楼'), ['闲楼'])
})

test('stationery presence query keeps real nearby shops and drops unanchored noise', () => {
  const query = '附近有没有卖文具的店'
  const anchored = filterWebEvidenceForQuery(query, stationeryWebResults)
  // 地域锚定：高雄 YouTube 与无地域的首页被丢，泉州本地结果保留。
  const anchoredTitles = anchored.map(item => item.title)
  assert.ok(anchoredTitles.some(title => title.includes('吴容辉文具店')), 'real stationery shop must survive anchor filter')
  assert.ok(anchoredTitles.some(title => title.includes('金榜文具')), 'amap stationery POI must survive anchor filter')
  assert.ok(!anchoredTitles.some(title => title.includes('Kaohsiung')), 'unanchored foreign result must be dropped')

  const ranked = rankCitationEvidence(query, anchored, 8)
  const rankedTitles = ranked.map(item => item.title)
  // 修复前这里返回 []：锚词是「卖文具的店」，原文不可能逐字命中，三家店全部被丢。
  assert.ok(rankedTitles.some(title => title.includes('吴容辉文具店')), 'real shop must pass subject coverage')
  assert.ok(rankedTitles.some(title => title.includes('金榜文具')), 'amap POI must pass subject coverage')
  // 洛江区政府食品 PDF 虽有地域但与文具无关，主题覆盖应把它拒掉。
  assert.ok(!rankedTitles.some(title => title.includes('食品监管')), 'unrelated PDF must fail subject coverage')
})

test('garbage web results for unknown names stay rejected', () => {
  // 「闲楼」的搜索结果是校官网首页等不含该专名的页面：锚词保持原样，必须继续被拒。
  assert.equal(evidenceCoversQuerySubject('闲楼', {
    title: '仰恩大学',
    url: 'https://web.yeu.edu.cn/',
    snippet: '数说仰恩 · 图书馆藏纸质文献. 150+ 万册',
    source: 'web',
    text: '数说仰恩 · 图书馆藏纸质文献. 150+ 万册'
  }), false)
})

test('tiered scholarship amount query answers the amount, not the competition entry', () => {
  const answer = studentRuleLocalAnswer('仰恩一等奖学金多少钱', [])
  assert.ok(answer, 'tiered scholarship query must be handled deterministically')
  assert.match(answer!.answer, /一等2000元/)
  assert.ok(!answer!.answer.includes('竞赛管理办法'), 'must not fall into the competition-regulation entry')
})

test('competition bonus wording is not hijacked by the scholarship branch', () => {
  assert.equal(studentRuleLocalAnswer('省一能拿多少奖金', []), null)
  assert.equal(studentRuleLocalAnswer('数学建模省一等奖学金？', []), null, 'no fake scholarship name match without a real one')
})
