/**
 * 触摸手势判定：区分「tap」与「滑动 / 多指」。
 *
 * 背景：amap provider 的 DOM 标点有自己的 `touchend` 监听（为了 `4023af0`：
 * tap 选中后不能让同一次点击冒泡到地图、否则选中立刻被清空）。但那段监听
 * 无条件调 `onClick`，手指滑过标点再抬起也会打开详情。maplibre 路径不受影响，
 * 因为它走 Canvas layer + `map.on('click')`，自带 `clickTolerance`。
 *
 * 这里把判定抽成纯函数，好在没有高德 Key 的环境里用 node:test 覆盖。
 */

/**
 * 位移阈值。手指按下时的抖动明显大于鼠标，maplibre 的 mouse `clickTolerance`
 * 是 3px，直接拿来会把手抖的正常 tap 误判成滑动；10px 在手机屏上约 0.5mm。
 */
export const TAP_MOVE_TOLERANCE_PX = 10

export interface TapPoint {
  x: number
  y: number
}

export interface TapGestureInput {
  /** touchstart 时记录的起点；null 表示没有可用起点（异常序列、或多指按下）。 */
  start: TapPoint | null
  /** touchend 时抬起点的坐标；null 表示 changedTouches 为空。 */
  end: TapPoint | null
  /** touchstart 时按下的手指数。>1 视为多指，不是 tap。 */
  startTouchCount: number
  /** touchend 时剩余的手指数（event.touches.length）。>0 表示还有其他手指在屏上。 */
  endTouchCount: number
}

/**
 * 返回 true 表示应当视为 tap（触发点击），false 表示滑动/多指，应忽略。
 *
 * 判定顺序（先决条件优先，避免用位移掩盖多指）：
 * 1. 多指（start 或 end 时手指数 > 1）→ 不是 tap。双指时 `touches[0]` 可能是
 *    任意一指，位移算出来没有意义。
 * 2. touchend 时仍有手指留在屏上（endTouchCount > 0）→ 不是 tap。
 * 3. 缺少起点或终点坐标 → 保守当 tap。这是异常序列（例如 touchstart 因被动
 *    监听被浏览器合并），保持改动前的旧行为比静默吞掉点击更安全。
 * 4. 位移超过阈值 → 不是 tap。
 * 5. 其余 → 是 tap。
 */
export function isTapGesture(input: TapGestureInput): boolean {
  if (input.startTouchCount > 1 || input.endTouchCount > 1) {
    return false
  }
  if (input.endTouchCount > 0) {
    return false
  }
  if (!input.start || !input.end) {
    return true
  }
  const dx = input.end.x - input.start.x
  const dy = input.end.y - input.start.y
  return Math.hypot(dx, dy) <= TAP_MOVE_TOLERANCE_PX
}

/** 从 Touch 读一个纯坐标，方便调用方少写重复代码。 */
export function tapPointOf(touch: { clientX: number, clientY: number }): TapPoint {
  return { x: touch.clientX, y: touch.clientY }
}

/**
 * 给一个 DOM 元素挂「只在真正 tap 时才触发」的触摸监听。
 *
 * 抽成函数是为了让浏览器测试能跑到**和 provider 完全相同的那份装配代码**，
 * 而不是另抄一份近似实现（本地没有高德 Key，amap 端到端跑不起来）。
 *
 * 行为约束（改动前就有的、不能丢的）：
 * - `touchstart` 只记录、绝不 `preventDefault`（拦了标点就彻底点不开）。
 * - 判定为 tap 时 `preventDefault + stopPropagation`，然后 `onClick()`
 *   （这是 `4023af0` 的修复：不让同一次 tap 冒泡到地图，否则选中立刻被清空）。
 * - 判定为滑动/多指时**什么都不做**，事件正常走完，地图照常收尾拖拽。
 */
export function attachTapGesture(
  element: HTMLElement,
  onClick: () => void
): void {
  let tapStart: TapPoint | null = null
  let tapStartTouchCount = 0

  element.addEventListener('touchstart', (event) => {
    const touchEvent = event as TouchEvent
    // 多指（pinch）时 touches[0] 可能是任意一指，位移没有意义：直接作废这次 tap。
    tapStartTouchCount = touchEvent.touches.length
    const touch = touchEvent.touches[0]
    tapStart = touchEvent.touches.length === 1 && touch ? tapPointOf(touch) : null
  }, { passive: true })

  // 手势被系统/滚动打断：清空起点，避免残留影响下一次。
  element.addEventListener('touchcancel', () => {
    tapStart = null
    tapStartTouchCount = 0
  }, { passive: true })

  element.addEventListener('touchend', (event) => {
    const touchEvent = event as TouchEvent
    const start = tapStart
    const startTouchCount = tapStartTouchCount
    tapStart = null
    tapStartTouchCount = 0
    const touch = touchEvent.changedTouches[0]
    const isTap = isTapGesture({
      start,
      end: touch ? tapPointOf(touch) : null,
      startTouchCount,
      endTouchCount: touchEvent.touches.length
    })
    if (!isTap) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onClick()
  }, { passive: false })
}
