/**
 * 地图自绘 SVG 图标集（校车头/尾、宿舍小房子、聚合角标）。
 *
 * 全部是本地内联 SVG：不引第三方图标库、不抄开源项目的图形，
 * 只用矩形/多边形/圆这几样基本形拼出可辨认的剪影，缩到 22px 仍分得清。
 */

export type MarkerIconKind = 'bus-front' | 'bus-rear' | 'dorm'

interface IconOptions {
  /** 主色（车身/屋身）。 */
  color?: string
  /** 像素尺寸，默认 26。 */
  size?: number
}

const BUS_BODY = '#f4f7f2'
const BUS_TRIM = '#0f766e'

function svgWrap(size: number, body: string, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" role="img" aria-label="${title}">${body}</svg>`
}

/** 校车车头：正面看过去，挡风玻璃 + 两个大灯 + 保险杠。 */
function busFront(color: string, size: number): string {
  return svgWrap(size, `
    <rect x="5" y="4" width="22" height="24" rx="6" fill="${BUS_BODY}" stroke="${color}" stroke-width="2"/>
    <rect x="8" y="7" width="16" height="9" rx="2.5" fill="#bfdbfe" stroke="${color}" stroke-width="1.2"/>
    <rect x="8" y="7" width="7" height="9" rx="2.5" fill="#e0f2fe"/>
    <circle cx="10" cy="21" r="2.1" fill="#facc15" stroke="${color}" stroke-width="1"/>
    <circle cx="22" cy="21" r="2.1" fill="#facc15" stroke="${color}" stroke-width="1"/>
    <rect x="7" y="25" width="18" height="2.6" rx="1.3" fill="${color}" opacity=".85"/>
    <rect x="12" y="15.5" width="8" height="2.4" rx="1.2" fill="${color}" opacity=".35"/>
  `, '校车车头')
}

/** 校车车尾：背面视角，后窗 + 两个红色尾灯 + 车牌位。 */
function busRear(color: string, size: number): string {
  return svgWrap(size, `
    <rect x="5" y="4" width="22" height="24" rx="6" fill="${BUS_BODY}" stroke="${color}" stroke-width="2"/>
    <rect x="8" y="7" width="16" height="8" rx="2.5" fill="#e2e8f0" stroke="${color}" stroke-width="1.2"/>
    <rect x="8.5" y="17" width="15" height="4.6" rx="1" fill="#f8fafc" stroke="${color}" stroke-width="1"/>
    <circle cx="10" cy="21.4" r="1.9" fill="#dc2626"/>
    <circle cx="22" cy="21.4" r="1.9" fill="#dc2626"/>
    <rect x="7" y="25" width="18" height="2.6" rx="1.3" fill="${color}" opacity=".85"/>
    <rect x="12" y="24.2" width="8" height="1.2" rx="0.6" fill="${color}" opacity=".45"/>
  `, '校车车尾')
}

/** 宿舍：坡屋顶小房子 + 门 + 窗。 */
function dorm(color: string, size: number): string {
  return svgWrap(size, `
    <path d="M16 4.5 28 13.2H4Z" fill="${color}" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="7" y="13" width="18" height="14.5" rx="2" fill="#ffffff" stroke="${color}" stroke-width="2"/>
    <rect x="13.4" y="19.4" width="5.2" height="8.1" rx="1" fill="${color}" opacity=".8"/>
    <rect x="9.6" y="15.4" width="3.4" height="3.4" rx="0.8" fill="#bae6fd" stroke="${color}" stroke-width="1"/>
    <rect x="19" y="15.4" width="3.4" height="3.4" rx="0.8" fill="#bae6fd" stroke="${color}" stroke-width="1"/>
  `, '宿舍')
}

/** 聚合角标里的小剪影：宿舍/校车各一个，24px 内仍能认出轮廓。 */
function clusterGlyph(kind: 'dorm' | 'bus'): string {
  if (kind === 'bus') {
    return `<svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="5" width="20" height="22" rx="5" fill="#fff" opacity=".92"/><rect x="9.5" y="8" width="13" height="7" rx="2" fill="#0f766e" opacity=".55"/><circle cx="11.5" cy="21" r="1.7" fill="#0f766e"/><circle cx="20.5" cy="21" r="1.7" fill="#0f766e"/></svg>`
  }
  return `<svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5 28 13.5H4Z" fill="#fff" opacity=".95"/><rect x="8" y="13.5" width="16" height="13" rx="1.5" fill="#fff" opacity=".92"/><rect x="13.4" y="19.5" width="5.2" height="7" rx="1" fill="#0f766e" opacity=".55"/></svg>`
}

/** 取一个图标的 SVG 字符串（用于 marker 的 innerHTML）。 */
export function markerSvg(kind: MarkerIconKind, options: IconOptions = {}): string {
  const size = options.size ?? 26
  const color = options.color ?? BUS_TRIM
  if (kind === 'bus-front') return busFront(color, size)
  if (kind === 'bus-rear') return busRear(color, size)
  return dorm(options.color ?? '#2d6f8e', size)
}

/** 车头/车尾：车头朝观察者（往南/西南开）用车头，往北/东北开用车尾。 */
export function busFacing(angleDeg: number | undefined): 'bus-front' | 'bus-rear' {
  if (typeof angleDeg !== 'number' || !Number.isFinite(angleDeg)) return 'bus-front'
  const normalized = ((angleDeg % 360) + 360) % 360
  return normalized > 90 && normalized < 270 ? 'bus-rear' : 'bus-front'
}

export { clusterGlyph }

/**
 * 建筑类图标：不同类别给不同屋顶/立面，一眼能分出是教学楼、食堂还是校门。
 * 全部 32×32 内联 SVG，缩到 30px 还能认出轮廓。
 */
export type BuildingKind =
  | 'campus-building'
  | 'dorm'
  | 'food'
  | 'service'
  | 'express'
  | 'gate'
  | 'nearby'

interface BuildingOptions {
  color?: string
  size?: number
}

/** 教学楼：三层窗带 + 平顶 + 顶部旗杆。 */
function teaching(color: string, size: number): string {
  return svgWrap(size, `
    <rect x="6" y="10" width="20" height="18" rx="2" fill="#fff" stroke="${color}" stroke-width="2"/>
    <rect x="4.5" y="8.5" width="23" height="3.4" rx="1.2" fill="${color}"/>
    <g fill="${color}" opacity=".55">
      <rect x="9" y="14" width="3.4" height="3"/><rect x="14.3" y="14" width="3.4" height="3"/><rect x="19.6" y="14" width="3.4" height="3"/>
      <rect x="9" y="19" width="3.4" height="3"/><rect x="14.3" y="19" width="3.4" height="3"/><rect x="19.6" y="19" width="3.4" height="3"/>
    </g>
    <rect x="13.6" y="24" width="4.8" height="4" rx="0.8" fill="${color}" opacity=".8"/>
    <path d="M16 8.5V4.6" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M16 4.6l4 1.5-4 1.5z" fill="${color}" opacity=".85"/>
  `, '教学楼')
}

/** 服务/行政：横向长条办公楼 + 玻璃入口，和教学楼的竖排窗区分开。 */
function service(color: string, size: number): string {
  return svgWrap(size, `
    <rect x="3.6" y="12.6" width="24.8" height="13.6" rx="2" fill="#fff" stroke="${color}" stroke-width="2"/>
    <rect x="3.6" y="9.4" width="24.8" height="3.6" rx="1.2" fill="${color}"/>
    <g fill="${color}" opacity=".5">
      <rect x="5.6" y="15.4" width="5.6" height="2.2" rx="0.6"/>
      <rect x="13.2" y="15.4" width="5.6" height="2.2" rx="0.6"/>
      <rect x="20.8" y="15.4" width="5.6" height="2.2" rx="0.6"/>
      <rect x="5.6" y="19.2" width="5.6" height="2.2" rx="0.6"/>
      <rect x="20.8" y="19.2" width="5.6" height="2.2" rx="0.6"/>
    </g>
    <rect x="13" y="18.6" width="6" height="7.6" rx="1" fill="#bae6fd" stroke="${color}" stroke-width="1.2"/>
    <path d="M16 18.6v7.6" stroke="${color}" stroke-width="1"/>
  `, '服务')
}

/** 食堂：带条纹雨棚的矮楼。 */
function food(color: string, size: number): string {
  return svgWrap(size, `
    <rect x="6" y="13" width="20" height="15" rx="2" fill="#fff" stroke="${color}" stroke-width="2"/>
    <path d="M4.8 13 16 6.6 27.2 13z" fill="${color}" opacity=".9"/>
    <g fill="${color}" opacity=".55">
      <rect x="8.4" y="17" width="4.4" height="4.6" rx="0.8"/>
      <rect x="15" y="17" width="4.4" height="4.6" rx="0.8"/>
      <rect x="21.2" y="17" width="2.6" height="4.6" rx="0.8"/>
    </g>
    <rect x="13.6" y="23.4" width="4.8" height="4.6" rx="0.8" fill="${color}" opacity=".8"/>
  `, '餐饮')
}

/** 快递：楼体 + 包裹。 */
function express(color: string, size: number): string {
  return svgWrap(size, `
    <rect x="5.5" y="12" width="21" height="16" rx="2" fill="#fff" stroke="${color}" stroke-width="2"/>
    <rect x="4.4" y="9.6" width="23.2" height="3.2" rx="1.1" fill="${color}"/>
    <path d="M12 20.4h8v5.6h-8z" fill="${color}" opacity=".18" stroke="${color}" stroke-width="1.2"/>
    <path d="M12 20.4h8M16 20.4v5.6" stroke="${color}" stroke-width="1.2"/>
  `, '快递')
}

/** 校门：两柱 + 门楣 + 缺口。 */
function gate(color: string, size: number): string {
  return svgWrap(size, `
    <rect x="4.6" y="9" width="22.8" height="3.2" rx="1" fill="${color}"/>
    <rect x="6.4" y="12.2" width="3.6" height="15" rx="1" fill="${color}" opacity=".9"/>
    <rect x="22" y="12.2" width="3.6" height="15" rx="1" fill="${color}" opacity=".9"/>
    <path d="M10 27.2v-9.4h12v9.4" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="2.6 2.2"/>
    <rect x="10.6" y="14" width="10.8" height="2" rx="1" fill="${color}" opacity=".45"/>
  `, '校门')
}

/** 周边店铺：雨棚 + 门面。 */
function shop(color: string, size: number): string {
  return svgWrap(size, `
    <rect x="6" y="12.4" width="20" height="15.6" rx="2" fill="#fff" stroke="${color}" stroke-width="2"/>
    <path d="M5.2 12.4 7 6.8h18l1.8 5.6z" fill="${color}" opacity=".9"/>
    <g stroke="#fff" stroke-width="1.1" opacity=".9">
      <path d="M9.4 7.4 8.6 12.2M14.2 7.4 13.8 12.2M19 7.4l.6 4.8M23.4 7.4l-.8 4.8"/>
    </g>
    <rect x="9" y="16.6" width="6.4" height="11.4" rx="0.8" fill="${color}" opacity=".22"/>
    <rect x="17.4" y="17" width="5.4" height="4.4" rx="0.8" fill="${color}" opacity=".35"/>
  `, '周边')
}

/** 取建筑图标：按类别选屋顶/立面。 */
export function buildingSvg(kind: BuildingKind, options: BuildingOptions = {}): string {
  const size = options.size ?? 34
  const color = options.color ?? '#176f46'
  if (kind === 'dorm') return dorm(color, size)
  if (kind === 'food') return food(color, size)
  if (kind === 'service') return service(color, size)
  if (kind === 'express') return express(color, size)
  if (kind === 'gate') return gate(color, size)
  if (kind === 'nearby') return shop(color, size)
  return teaching(color, size)
}

/**
 * 车：俯视一辆车——车头（挡风玻璃+大灯）朝上、车身带车窗与车轮，
 * 整体按 angleDeg（正北 0°，顺时针）旋转，跟着线路走向转。
 */
export function vehicleSvg(options: { color?: string, angleDeg?: number, size?: number } = {}): string {
  const size = options.size ?? 30
  const color = options.color ?? '#ea580c'
  const angle = typeof options.angleDeg === 'number' && Number.isFinite(options.angleDeg)
    ? ((options.angleDeg % 360) + 360) % 360
    : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" role="img" aria-label="校车">
    <g transform="rotate(${angle} 16 16)">
      <rect x="9.6" y="5.4" width="12.8" height="21.2" rx="4.4" fill="#fff" stroke="${color}" stroke-width="2"/>
      <path d="M10.4 8.6h11.2" stroke="${color}" stroke-width="0" />
      <rect x="11.2" y="7.4" width="9.6" height="4.4" rx="1.6" fill="#bfdbfe" stroke="${color}" stroke-width="1"/>
      <rect x="11.2" y="13.6" width="9.6" height="2.6" rx="1.2" fill="${color}" opacity=".28"/>
      <rect x="11.2" y="18.2" width="9.6" height="2.6" rx="1.2" fill="${color}" opacity=".28"/>
      <circle cx="10" cy="11.4" r="1.5" fill="#facc15"/>
      <circle cx="22" cy="11.4" r="1.5" fill="#facc15"/>
      <circle cx="10" cy="23" r="1.4" fill="#dc2626"/>
      <circle cx="22" cy="23" r="1.4" fill="#dc2626"/>
      <path d="M12.4 26.2h7.2" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
    </g>
  </svg>`
}
