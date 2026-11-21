export interface CurvePoint {
  x: number
  y: number
}

/**
 * 一条曲线，不是折线。
 *
 * 折线把两个从未采样过的点用直线连起来，每一个转角都在撒一个数据里没有的谎；
 * 顺带还长得像 1998 年的销售图表。Catmull-Rom 转成三次贝塞尔：曲线精确穿过每个读数，
 * 控制点由左右邻居算出，既不发明形状，也不会冲到数据没有的高度。
 */
export function catmullRomPath(points: CurvePoint[]): string {
  if (points.length === 0) return ''
  let d = `M${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p0 = points[i - 1] ?? p1
    const p3 = points[i + 2] ?? p2
    /* 邻居跨度的六分之一是 Catmull-Rom 的标准张力：再紧就出角，再松就打圈 */
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += ` C${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

/** 数值序列 → 绘图坐标。宽高直接给像素，SVG 不再拉伸，线宽才是真的像素宽 */
export function toCurvePoints(values: number[], max: number, height = 40, width = 100): CurvePoint[] {
  if (values.length === 0) return []
  const span = values.length > 1 ? values.length - 1 : 1
  return values.map((value, index) => ({
    x: (index / span) * width,
    y: height - (value / Math.max(1, max)) * height
  }))
}
