export const MAP_PLACE_CATEGORY_IDS = [
  'campus-building',
  'dorm',
  'food',
  'service',
  'express',
  'gate',
  'nearby'
] as const

export type MapPlaceCategory = typeof MAP_PLACE_CATEGORY_IDS[number]

const categoryByPlaceType: Readonly<Record<string, MapPlaceCategory>> = {
  'building': 'campus-building',
  'teaching-building': 'campus-building',
  'campus-building': 'campus-building',
  'library': 'campus-building',
  'dormitory': 'dorm',
  'dorm': 'dorm',
  'dining': 'food',
  'food': 'food',
  'service': 'service',
  'health-service': 'service',
  'transit-stop': 'service',
  'sports-ground': 'service',
  'event-venue': 'service',
  'express-service': 'express',
  'express': 'express',
  'gate': 'gate',
  'shop': 'nearby',
  'nearby': 'nearby'
}

export function mapCategoryFromPlaceType(
  type: string | null | undefined,
  scope: 'campus' | 'nearby'
): MapPlaceCategory {
  const normalizedType = type?.trim().toLocaleLowerCase('en-US') ?? ''
  return categoryByPlaceType[normalizedType]
    ?? (scope === 'nearby' ? 'nearby' : 'service')
}
