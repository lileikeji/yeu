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
