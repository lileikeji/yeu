import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { amapImportedPlaces } from './src/map-source/data/seeds/amap-imported-places.ts'
import { campusMapReferencePlaces } from './src/map-source/data/seeds/preview-places.ts'
import { normalizeCampusCategory } from './src/map-source/shared/utils/campus-dorm-buildings.ts'
import { adventureGoal, adventurePoints } from './src/map-source/shared/utils/treasure-adventure.ts'
import { adventureBoundary, adventureRegion, isInsideAdventureCampus } from './src/map-source/shared/utils/adventure-campus.ts'
import { pointAtDistance } from './src/map-source/shared/utils/treasure-pilot.ts'
import { gcj02ToWgs84 } from './src/map-source/shared/utils/coordinate-convert.ts'
import { createAdventureStyle } from './src/map-source/map/providers/maplibre/adventure-style.ts'
import { bridgeRoute, pendingPlanNames, pilot, reviewLocations } from './location-review.mts'

const root = import.meta.dirname
const project = join(root, 'src/map-source')
const scratch = join(root, 'src/atlas')
const dir = join(project, 'public/adventure-map')
const libDir = join(root, 'vendor/maplibre-gl')
const artwork = join(root, 'artwork')
const publishedArtwork = join(root, '..', 'public', 'treasure-artwork')
const read = (file: string) => readFileSync(file, 'utf8')
const asset = (file: string, type: string) => `data:${type};base64,${readFileSync(file).toString('base64')}`
const safe = (content: unknown) => JSON.stringify(content).replace(/</g, '\\u003c')
const profile = JSON.parse(read(join(dir, 'terrain-profile.json')))
const style = createAdventureStyle('http://atlas.invalid')
delete style.glyphs
style.layers = style.layers.filter(layer => layer.id !== 'lake-names')
const tileData: Record<string, string> = {}
function addTiles(folder: string) {
  for (const z of readdirSync(folder)) {
    if (!/^\d+$/.test(z)) continue
    for (const x of readdirSync(join(folder, z))) {
      for (const y of readdirSync(join(folder, z, x))) {
        const path = join(folder, z, x, y)
        const key = [basename(folder), z, x, y].join('/')
        tileData[key] = readFileSync(path).toString('base64')
      }
    }
  }
}
const elevationSource = style.sources.elevation
if (elevationSource?.type !== 'raster-dem') throw new Error('Missing elevation source')
elevationSource.tiles = elevationSource.tiles?.map(path => path.replace('http://atlas.invalid/adventure-map/', 'atlas://'))
addTiles(join(dir, 'terrain'))
style.sources.boundary = {
  type: 'geojson', data: adventureBoundary as never,
  attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>'
}
style.sources.positionZone = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
style.layers.push(
  { id: 'campus-boundary-under', type: 'line', source: 'boundary', paint: { 'line-width': 3.5, 'line-color': '#334f42', 'line-opacity': 0.7 } },
  { id: 'campus-boundary', type: 'line', source: 'boundary', paint: { 'line-width': 1.4, 'line-color': '#fae3ad', 'line-dasharray': [2, 1.5] } },
  { id: 'claim-zone-fill', type: 'fill', source: 'positionZone', paint: { 'fill-color': '#e5a73b', 'fill-opacity': 0.24 } },
  { id: 'claim-zone-edge', type: 'line', source: 'positionZone', paint: { 'line-color': '#b77924', 'line-width': 2 } }
)

type Plate = { file: string, bounds: [number, number, number, number], minZoom: number, fullZoom: number }
const plates: Plate[] = JSON.parse(read(join(artwork, 'bounds.json')))
mkdirSync(publishedArtwork, { recursive: true })
const artworkIds = plates.map(({ file, bounds: [west, south, east, north], minZoom, fullZoom }, index) => {
  const id = `painting-${index}`
  copyFileSync(join(artwork, file), join(publishedArtwork, file))
  style.sources[id] = { type: 'image', url: `/treasure-artwork/${file}`,
    coordinates: [[west, north], [east, north], [east, south], [west, south]] }
  const insertion = style.layers.findIndex(layer => layer.id === 'campus-boundary-under')
  style.layers.splice(insertion, 0, { id, type: 'raster', source: id, minzoom: minZoom,
    paint: { 'raster-fade-duration': 0, 'raster-opacity': fullZoom === minZoom
      ? 1
      : ['interpolate', ['linear'], ['zoom'], minZoom, 0, fullZoom, 1] } })
  return id
})
const mapLayers = new Set([...artworkIds, 'campus-boundary', 'claim-zone-fill', 'claim-zone-edge'])
style.layers = [
  { id: 'ink-background', type: 'background', paint: { 'background-color': '#1a2b25' } },
  ...style.layers.filter(layer => mapLayers.has(layer.id))
]
const boundaryLayer = style.layers.find(layer => layer.id === 'campus-boundary')!
boundaryLayer.paint = { 'line-width': 1, 'line-color': '#f4d9a2', 'line-opacity': 0.45, 'line-dasharray': [2, 2] }
style.layers.find(layer => layer.id === 'claim-zone-fill')!.paint = { 'fill-color': '#f1d293', 'fill-opacity': 0.16 }
style.layers.find(layer => layer.id === 'claim-zone-edge')!.paint = { 'line-color': '#ffe3a2', 'line-width': 1.7, 'line-dasharray': [2, 1.5] }
style.sources.bridgeRoute = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
style.layers.push(
  { id: 'bridge-route-border', type: 'line', source: 'bridgeRoute', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#493924', 'line-width': 6 } },
  { id: 'bridge-route-line', type: 'line', source: 'bridgeRoute', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffda88', 'line-width': 3.5 } }
)
// MapLibre initializes image sources even when no layer renders them.
const usedSources = new Set(['elevation', ...artworkIds, 'boundary', 'positionZone', 'bridgeRoute'])
for (const id of Object.keys(style.sources)) {
  if (!usedSources.has(id)) delete style.sources[id]
}

// Six old-campus dorms still have a generic building category in the map import.
const additionalDormNames = new Set(['泰山楼', '嵩山楼', '黄山楼', '华山楼', '珠海楼', '北海楼'])
const historyMuseumLocation = {
  description: '第二教学区图书馆一楼',
  source: 'https://news.yeu.edu.cn/2023/0621/c704a39166/page.htm'
}
const library = amapImportedPlaces.find(place => place.name.trim() === '图书馆')
if (!library) throw new Error('Missing library reference point for the history museum')
const pins = amapImportedPlaces.map((place) => {
  const title = place.name.trim()
  // The university confirms the building and floor. Use the building pin as a reference.
  const location = title === '校史馆' ? historyMuseumLocation : undefined
  const referencePlace = location ? library : place
  const converted = gcj02ToWgs84(referencePlace.sourcePoint.lng, referencePlace.sourcePoint.lat)
  const point = { lng: converted.longitude, lat: converted.latitude, crs: 'WGS84' as const }
  const reference = campusMapReferencePlaces.find(item => item.name === title || item.aliases?.includes(title))
  const category = normalizeCampusCategory(title, place.category)
  const isDorm = category === 'dorm' || reference?.category === 'dorm'
    || additionalDormNames.has(title) || /宿舍|学生公寓/.test(title)
  const group = isDorm
    ? '宿舍'
    : location
      ? '校园地标'
      : title === '南洋楼'
        ? '行政与公共建筑'
        : /行政楼|保卫处|医务所|礼堂|报告厅|创业园|网络信息中心|校史馆|文体中心/.test(title)
          ? '行政与公共建筑'
          : /图书馆|教学楼/.test(title) || category === 'campus-building'
            ? '教学与图书馆'
            : category === 'food' && /餐厅|食堂/.test(title) ? '餐厅' : '校园地标'
  const plan = title === '和昌教学楼'
    ? '37'
    : title === '共和教学楼'
      ? '18'
      : reference?.mapNumber
  return {
    id: place.id, name: title, group, point: [point.lng, point.lat], region: adventureRegion(point),
    kind: isDorm ? 'dorm' : group === '校园地标' ? 'landmark' : 'waypoint',
    elevation: profile.pointHeights[referencePlace.id],
    inCampus: isInsideAdventureCampus(point), plan, location
  }
})
const trialAnswers: Record<string, string> = {
  'yangen': '仰恩', 'track': '新区', 'square': '碑林', 'puzhao': '普照',
  'jilong': '吉龙', 'stadium': '基金会', 'beiyuan': '北苑', 'xiangxian': '祥贤',
  'library': 'cat', 'history': '湖边舞池', 'hechang-new': '和昌',
  'yongkang': '永康', 'dongyuan': '东苑', 'auditorium': '大礼堂', 'finish': '文体中心'
}
const trialClues: Record<string, string> = {
  history: '沿新区湖边找到露天舞池，路牌上写着「湖边舞池」。',
  yongkang: '在旧区找「永康球场」，神瞳就在球场旁。'
}
const zodiac = {
  mouse: '鼠', ox: '牛', tiger: '虎', rabbit: '兔', dragon: '龙', snake: '蛇',
  horse: '马', goat: '羊', monkey: '猴', rooster: '鸡', dog: '狗', pig: '猪'
} as const
const guests = {
  'frog': { name: '奶蛙', symbol: '蛙' },
  'egg': { name: '奶蛋', symbol: '蛋' },
  'dragon-motion': { name: '动态奶龙', symbol: '龙' }
} as const
const classroomGuests = { phoebe: '菲比', guga: '企鹅咕嘎', doro: 'Doro', whale: 'DeepSeek 鲸鱼娘' } as const
type Character = keyof typeof zodiac | keyof typeof guests | keyof typeof classroomGuests
const standeeCharacters: Partial<Record<string, Character>> = {
  'yangen': 'frog', 'track': 'mouse', 'square': 'rooster', 'puzhao': 'ox',
  'jilong': 'dragon', 'stadium': 'horse', 'beiyuan': 'goat', 'xiangxian': 'pig',
  'naiwa-xiyuan': 'egg', 'naiwa-old-admin': 'dragon-motion', 'finish': 'frog',
  'zodiac-gonghe': 'tiger', 'zodiac-history': 'rabbit', 'zodiac-bridge': 'snake',
  'zodiac-park': 'monkey', 'zodiac-network': 'dog'
}
const badge = (label: string, color: string) => 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88"><circle cx="44" cy="44" r="38" fill="${color}" stroke="#f9dfa4" stroke-width="3"/><circle cx="44" cy="44" r="31" fill="none" stroke="#f9dfa4" stroke-opacity=".55"/><text x="44" y="47" fill="#fff3d5" text-anchor="middle" dominant-baseline="central" font-family="serif" font-size="34">${label}</text></svg>`
).toString('base64')
const characters = Object.fromEntries([
  ...Object.entries(zodiac).map(([key, animal]) => [key, {
    name: `奶${animal}`, animal, still: badge(animal, '#36584c')
  }]),
  ...Object.entries(guests).map(([key, { name, symbol }]) => [key, {
    name, still: badge(symbol, '#735036')
  }]),
  ...Object.entries(classroomGuests).map(([key, name]) => {
    const badgeImage = badge(name[0]!, '#695273')
    const hasArtwork = key === 'guga' || key === 'whale'
    return [key, {
      name,
      still: hasArtwork ? asset(join(scratch, `${key}-guest-still.webp`), 'image/webp') : badgeImage,
      reveal: hasArtwork ? asset(join(scratch, `${key}-guest-action.webp`), 'image/webp') : badgeImage
    }]
  })
])
const activity = adventurePoints.map((entry) => {
  if (!trialAnswers[entry.id]) throw new Error(`Missing demo answer for ${entry.id}`)
  const character = standeeCharacters[entry.id]
  const name = character ? entry.name.replace(/(?:宝箱|补给箱)$/, `${characters[character].name}立牌`) : entry.name
  return {
    ...entry, name, character, alias: entry.name, point: [entry.point.lng, entry.point.lat],
    clue: trialClues[entry.id] ?? entry.clue, answer: trialAnswers[entry.id]
  }
})
type BonusPoint = {
  id: string
  kind: 'chest' | 'taffy'
  name: string
  landmark: string
  clue: string
  question: string
  answer?: string
}
const paradeDemo = 'zodiac-bridge'
const newEntries: BonusPoint[] = [
  { id: 'naiwa-xiyuan', kind: 'chest', name: '西苑奶蛋立牌', landmark: '西苑餐厅',
    clue: '到新区西苑餐厅附近找抱着星星的奶蛋。', question: '餐厅名字开头的两个字是什么？', answer: '西苑' },
  { id: 'naiwa-old-admin', kind: 'chest', name: '旧区行政楼动态奶龙立牌', landmark: '旧区行政楼',
    clue: '沿旧区行政楼附近的步道找奶龙。', question: '这栋行政楼在新区还是旧区？', answer: '旧区' },
  { id: 'zodiac-gonghe', kind: 'chest', name: '共和奶虎立牌', landmark: '共和教学楼',
    clue: '去共和教学楼外找额头有「王」字的小奶虎。', question: '这栋教学楼名称的前两个字是什么？', answer: '共和' },
  { id: 'zodiac-history', kind: 'chest', name: '校史馆奶兔立牌', landmark: '校史馆',
    clue: '到第二教学区图书馆附近找竖起长耳朵的奶兔。校史馆在图书馆一楼。', question: '展示学校历史的场馆叫什么？', answer: '校史馆' },
  { id: paradeDemo, kind: 'chest', name: '彩虹桥奶蛇立牌', landmark: '彩虹桥',
    clue: '奶龙派你去彩虹桥附近找一条不会过桥的蛇。它把暗号藏在尾巴旁。', question: '奶蛇尾巴旁的两个字是什么？' },
  { id: 'zodiac-park', kind: 'chest', name: '创业园奶猴立牌', landmark: '创业园',
    clue: '去创业园附近找尾巴卷起来的奶猴。', question: '这个园区的名字是什么？', answer: '创业园' },
  { id: 'zodiac-network', kind: 'chest', name: '信息中心奶狗立牌', landmark: '网络信息中心',
    clue: '沿网络信息中心附近的校内步道找长耳奶狗。', question: '网络□□中心，中间两个字是什么？', answer: '信息' },
  { id: 'taffy-new-admin', kind: 'taffy', name: '塔菲宝箱 · 四叶草', landmark: '新区行政楼',
    clue: '新区有一栋办理校务的楼。找找附近的四叶草。', question: '宝箱上的幸运草有几片叶子？', answer: '四' },
  { id: 'taffy-zequan', kind: 'taffy', name: '塔菲宝箱 · 粉色暗号', landmark: '泽钏教学楼',
    clue: '在新区找楼名里带「钏」字的教学楼。', question: '塔菲的头发是什么颜色？', answer: '粉色' },
  { id: 'taffy-nanyang', kind: 'taffy', name: '塔菲宝箱 · 金色瞳孔', landmark: '南洋楼',
    clue: '旧区有一栋以「南」字开头、名字里有「洋」的楼。', question: '塔菲的眼睛是什么颜色？', answer: '金色' }
]
const demoEntries = newEntries.map((entry) => {
  const pin = pins.find(candidate => candidate.name === entry.landmark)
  if (!pin) throw new Error(`Missing campus landmark for ${entry.id}`)
  const [lng, lat] = pin.point
  const center = { lng: lng!, lat: lat!, crs: 'WGS84' as const }
  const wholeRadiusInside = (point: typeof center) => isInsideAdventureCampus(point)
    && Array.from({ length: 72 }, (_, index) => index * 5).every(bearing => isInsideAdventureCampus(pointAtDistance(point, 21, bearing)))
  // Pick a nearby campus-side reference when the POI is too close to the boundary.
  const candidates = [center, ...[15, 30, 45].flatMap(distance =>
    [0, 90, 180, 270, 45, 135, 225, 315].map(bearing => pointAtDistance(center, distance, bearing)))]
  const point = candidates.find(wholeRadiusInside)
  if (!point || adventureRegion(point) !== pin.region) throw new Error(`No nearby campus-safe point for ${entry.id}`)
  console.log(entry.name, pin.region, point.lng === center.lng && point.lat === center.lat ? 'at POI' : 'near POI')
  return { ...entry, character: standeeCharacters[entry.id], region: pin.region, point: [point.lng, point.lat] }
})
// Approximate indoor preview markers checked against the map's building footprints.
const classroomLocations = [
  { id: 'classroom-phoebe', character: 'phoebe', landmark: '新区和昌教学楼', room: '一层大厅', point: [118.59914316, 25.10911895],
    clue: '去新区找与旧区同名的教学楼。一层大厅有一块画着浅蓝蝴蝶结的立牌。', answer: '海风', glyph: '✦' },
  { id: 'classroom-guga', character: 'guga', landmark: '普照教学楼', room: '一层门厅', point: [118.60162516, 25.11004208],
    clue: '新区有栋教学楼的名字和阳光有关。一层门厅里藏着一块画有饼干的立牌。', answer: '饼干', glyph: '●' },
  { id: 'classroom-doro', character: 'doro', landmark: '吉龙教学楼', room: '一层大厅', point: [118.61117874, 25.11435470],
    clue: '在旧区找名字里带「龙」的教学楼。留意一层大厅画着橘子的立牌。', answer: '橘子', glyph: '◆' },
  { id: 'classroom-whale', character: 'whale', landmark: '和昌教学楼', room: '一层走廊', point: [118.61207327, 25.11766932],
    clue: '旧区也有一栋与新区同名的教学楼。一层走廊里找带蓝色水花的立牌。', answer: '白饭', glyph: '≈' }
] as const
const classroomEntries = classroomLocations.map((entry) => {
  const [lng, lat] = entry.point
  const point = { lng, lat, crs: 'WGS84' as const }
  if (!isInsideAdventureCampus(point)) throw new Error(`Classroom point outside campus: ${entry.id}`)
  return { ...entry, kind: 'classroom', name: `${classroomGuests[entry.character]}隐藏立牌`,
    region: adventureRegion(point), question: '输入模拟立牌上的两个字。' }
})
const originalActivity = [...activity, ...demoEntries, ...classroomEntries]
const allActivity = reviewLocations(originalActivity)
const reviewedPins = reviewLocations(pins)
const ordinary = allActivity.filter(entry => entry.kind === 'chest')
if (ordinary.length !== 15 || new Set(ordinary.map(entry => entry.character)).size !== 15) {
  throw new Error('Expected one ordinary standee for each of the 15 characters')
}
for (const entry of allActivity) {
  if ((entry.kind === 'chest' || entry.kind === 'finish') && !entry.character) throw new Error(`Missing character for ${entry.id}`)
}
const icons = Object.fromEntries(['chest', 'oculus', 'oculus-done', 'waypoint'].map(key => [
  key, asset(join(project, 'public/images/adventure', `${key}.svg`), 'image/svg+xml')
]))
const libraryCode = read(join(libDir, 'maplibre-gl.iife.js'))
const workerCode = read(join(libDir, 'maplibre-gl-worker.mjs')).replace(/^\/\/# sourceMappingURL=.*$/gm, '')
const taffy = Object.fromEntries([
  ['taffy-new-admin', '叶', '#386052'],
  ['taffy-zequan', '粉', '#825368'],
  ['taffy-nanyang', '金', '#8c653a']
].map(([id, symbol, color]) => [id, {
  still: badge(symbol!, color!)
}]))
const data = { style, tileData, pins: reviewedPins, activity: allActivity,
  goal: adventureGoal, icons, taffy, characters, paradeDemo, elevation: profile.campusRange,
  artworkIds, artBounds: plates[0]!.bounds, pilot, bridgeRoute, pendingPlanNames }
const rendered = read(join(scratch, 'shell.html'))
  .replace('@@STYLE@@', () => read(join(libDir, 'maplibre-gl.css')).replace(/\/\*# sourceMappingURL=.*?\*\//g, '') + read(join(scratch, 'style.css')))
  .replace('@@DATA@@', () => safe(data))
  .replace('@@WORKER@@', () => safe(workerCode))
  .replace('@@LIBRARY@@', () => libraryCode.replace(/<\/script/gi, '<\\/script'))
  .replace('@@SCRIPT@@', () => ['zodiac-motion.js', 'bridge-pilot.js', 'atlas.js'].map(file => read(join(scratch, file))).join('\n\n').replace(/<\/script/gi, '<\\/script'))
  .replaceAll('@@FALLBACK@@', () => `/treasure-artwork/${plates[0]!.file}`)
  .replace('@@LICENSE@@', () => read(join(libDir, 'LICENSE.txt')).replace(/-->/g, '—>'))
  .replace('@@ASSET_NOTICES@@', () => read(join(scratch, 'asset-notices.txt')).replace(/-->/g, '—>'))
mkdirSync(join(root, 'outputs'), { recursive: true })
const target = join(root, '..', 'server', 'assets', 'treasure', 'atlas.html')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, rendered)
console.log(target, (Buffer.byteLength(rendered) / 1024 / 1024).toFixed(2), 'MB', 'pins', Object.groupBy(pins, p => p.kind) && Object.fromEntries(Object.entries(Object.groupBy(pins, p => p.kind)).map(([k, v]) => [k, v!.length])))
const labels: Record<string, string> = { chest: '角色立牌', oculus: '神瞳', finish: '终点', taffy: '塔菲', classroom: '教学楼隐藏款', waypoint: '传送锚点', landmark: '地标', dorm: '宿舍搜索' }
const originalPoints = new Map([...originalActivity, ...pins].map(entry => [entry.id, entry.point]))
const formatPoint = (point: readonly number[]) => point.map(value => value.toFixed(7)).join(', ')
const rows = [...allActivity, ...reviewedPins].map((entry) => {
  const coordinate = formatPoint(entry.point)
  const was = formatPoint(originalPoints.get(entry.id)!)
  return `| ${entry.name} | ${entry.region === 'new' ? '新区' : '旧区'} · ${labels[entry.kind]} | ${coordinate} | ${coordinate === was ? '沿用' : was} | ${entry.review.evidence} | ${entry.review.detail} |`
})
writeFileSync(join(root, 'outputs', '点位校验.md'), [
  '# 仰恩大学校园寻宝点位校验',
  '',
  '逐点检查 29 个活动点、23 个传送锚点、18 个地标及 35 个宿舍搜索点。表中为 WGS84 经纬度；宿舍继续只在搜索后显示。以 2026-11-17 获取的卫星影像检查原导入点与建筑或地物的相对位置，航片实际拍摄日期依瓦片而异。校方平面图确认名称或相对位置，室内点和立牌均为试玩布点。',
  '',
  '校图单列的永福楼、永安楼、顺安楼、共和楼和旧区图书馆继续保留在搜索的待补提示中，等能识别具体楼栋的现场资料。旧区图书馆与现有试点图书馆为不同校图地物。',
  '',
  '[仰恩大学平面示意图](https://www.yeu.edu.cn/2022/1024/c1344a51789/page.htm) · [校史馆位置公告](https://news.yeu.edu.cn/2023/0621/c704a39166/page.htm) · [Esri World Imagery](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer)',
  '',
  '| 名称 | 区域和类别 | 校验后经纬度 | 校验前经纬度 | 依据 | 校验结果 |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows,
  ''
].join('\n'))
