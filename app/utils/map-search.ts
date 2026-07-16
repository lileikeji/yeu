import type { MapArea } from '~~/map/core/types'
import type { PublicMapPlace } from '~/utils/public-catalog'

const categoryKeywords: Record<string, string> = {
  'campus-building': '教学 建筑 校内',
  'dorm': '宿舍 寝室 住宿 生活区',
  'food': '食堂 餐厅 吃饭 餐饮',
  'service': '服务 办事',
  'express': '快递 驿站 取件 寄件 包裹',
  'gate': '校门 入口 出入口',
  'nearby': '周边 商铺 洗衣'
}

const placeKeywords: Record<string, string> = {
  'preview-library': '借书 自习 阅读',
  'preview-network-information-center': '校园网 网络认证 wifi 信息化',
  'preview-new-campus-clinic': '看病 生病 医疗 药品',
  'preview-old-campus-clinic': '看病 生病 医疗 药品',
  'preview-yunda-express': '取件 寄件 包裹',
  'preview-express-alliance-zto': '取件 寄件 包裹 中通'
}

export function normalizeMapSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s（）()\-_/·,，。:：；;、]/g, '')
}

export function equivalentMapSearchTerms(value: string): string[] {
  const normalized = normalizeMapSearchText(value)
  if (!normalized) return []

  const terms = new Set([normalized])
  if (normalized.includes('教学楼')) {
    terms.add(normalized.replace(/教学楼/g, '楼'))
  }
  if (normalized.endsWith('楼') && !normalized.endsWith('教学楼')) {
    terms.add(normalized.replace(/楼$/, '教学楼'))
  }
  return [...terms]
}

export function placeMatchesQuery(place: PublicMapPlace, query: string): boolean {
  const terms = equivalentMapSearchTerms(query)
  if (!terms.length) return true
  const searchText = normalizeMapSearchText([
    place.name,
    place.searchText,
    categoryKeywords[place.category] ?? '',
    placeKeywords[place.id] ?? ''
  ].join(' '))
  return terms.some(term => searchText.includes(term))
}

export function areaMatchesQuery(area: MapArea, query: string): boolean {
  const terms = equivalentMapSearchTerms(query)
  if (!terms.length) return true
  const searchText = normalizeMapSearchText([
    area.name,
    area.description,
    area.areaSquareMeters === null ? '' : `${area.areaSquareMeters}平方米 面积`,
    area.perimeterMeters === null ? '' : `${area.perimeterMeters}米 周长`,
    '绘图区域 不规则边界'
  ].join(' '))
  return terms.some(term => searchText.includes(term))
}
