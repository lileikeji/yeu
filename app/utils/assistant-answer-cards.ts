/**
 * Parse structured assistant answers (food recommendation lists and
 * single-shop review details) into typed cards so the search page can render
 * them as real cards instead of a wall of pre-formatted text. Pure functions
 * only — the page decides how (or whether) to use the parsed shape and always
 * keeps the raw answer as fallback.
 */

export interface AssistantAnswerFoodItem {
  /** 新区 / 旧区 / 学生街, or null when the shop name carries no marker. */
  area: string | null
  name: string
  score: number | null
  cost: number | null
  tips: string[]
}

export interface AssistantAnswerFoodList {
  intro: string
  items: AssistantAnswerFoodItem[]
  tail: string
}

export interface AssistantShopReviewCard {
  tag: string
  score: number | null
  content: string
}

export interface AssistantShopDetail {
  shopName: string
  amapScore: number | null
  cost: number | null
  reviews: AssistantShopReviewCard[]
  tail: string
}

/** "1. [新区] 蜜雪冰城(仰恩大学新校区店)：4.3 分，人均约 ¥4（tip1；tip2）〔地图定位〕" */
const FOOD_ITEM = /^\s*\d+\.\s*(?:\[(新区|旧区|学生街)\]\s*)?(.+?)：(\d(?:\.\d)?)\s*分(?:，人均约\s*¥(\d+))?\s*(?:（(.*)）)?\s*(?:〔地图定位〕)?\s*$/u

export function parseAssistantFoodAnswer(answer: string): AssistantAnswerFoodList | null {
  const paragraphs = answer.split(/\n\n+/u)
  const itemParagraphIndex = paragraphs.findIndex(paragraph =>
    /^\s*\d+\.\s*/u.test(paragraph)
    && /^\s*\d+\.\s*(?:\[(?:新区|旧区|学生街)\]\s*)?[^：:]+：\d(?:\.\d)?\s*分/u.test(paragraph)
  )
  if (itemParagraphIndex < 0) return null

  const items: AssistantAnswerFoodItem[] = []
  for (const line of paragraphs[itemParagraphIndex]!.split('\n')) {
    const match = line.match(FOOD_ITEM)
    if (!match) return null
    const tips = (match[5] ?? '')
      .split(/[；;]/u)
      .map(tip => tip.trim())
      .filter(Boolean)
    items.push({
      area: match[1] ?? null,
      name: match[2]!.trim(),
      score: Number(match[3]),
      cost: match[4] ? Number(match[4]) : null,
      tips
    })
  }
  if (items.length < 2) return null

  return {
    intro: paragraphs.slice(0, itemParagraphIndex).join('\n\n').replace(/〔地图定位〕/gu, ''),
    items,
    tail: paragraphs.slice(itemParagraphIndex + 1).join('\n\n').replace(/〔地图定位〕/gu, '')
  }
}

/** "【口味】4.6 分：评价正文" */
const SHOP_REVIEW_LINE = /^【(.+?)】(?:([0-5](?:\.\d)?)\s*分)?[：:]\s*(.+)$/u

export function parseAssistantShopDetail(answer: string): AssistantShopDetail | null {
  const paragraphs = answer.split(/\n\n+/u)
  if (paragraphs.length < 2) return null
  const header = paragraphs[0]!.match(/^([^\n：:]+?)：高德评分\s*(\d(?:\.\d)?)\s*分(?:，人均约\s*¥(\d+))?\s*。\s*(?:〔地图定位〕)?$/u)
  if (!header) return null
  const reviewIntroIndex = paragraphs.findIndex(paragraph => paragraph.startsWith('整理自大众点评用户评价：'))
  if (reviewIntroIndex < 0) return null

  // Production joins cards with blank lines (separate paragraph); tolerate the
  // compact variant where the cards follow the intro line inside the same
  // paragraph.
  const inlineLines = paragraphs[reviewIntroIndex]!.split('\n').slice(1)
  const hasInlineReviews = inlineLines.some(line => line.trim())
  const reviewLines = hasInlineReviews
    ? inlineLines
    : (paragraphs[reviewIntroIndex + 1] ?? '').split('\n')
  const reviews: AssistantShopReviewCard[] = []
  for (const line of reviewLines) {
    if (!line.trim()) continue
    const match = line.match(SHOP_REVIEW_LINE)
    if (!match) return null
    reviews.push({
      tag: match[1]!,
      score: match[2] ? Number(match[2]) : null,
      content: match[3]!.trim()
    })
  }
  if (reviews.length === 0) return null

  const tailStart = hasInlineReviews ? reviewIntroIndex + 1 : reviewIntroIndex + 2
  return {
    shopName: header[1]!.trim(),
    amapScore: Number(header[2]),
    cost: header[3] ? Number(header[3]) : null,
    reviews,
    tail: paragraphs.slice(tailStart).join('\n\n').replace(/〔地图定位〕/gu, '')
  }
}
