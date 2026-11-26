/*
 * 面板「从触发按钮长出来」的坐标计算（2026-11-23）。
 *
 * 纯 CSS 动效不知道按钮在哪，所以打开前把三件事写进面板的 CSS 变量：
 *   --pv-ox / --pv-oy  transform-origin，按钮中心在面板里的相对位置（百分比，超出即夹到边缘）
 *   --pv-tx / --pv-ty  起始位移，从按钮指向面板中心的一小段补偿（面板尺寸的 12%，上限 20px）
 * 动效本身在 app/assets/css/main.css 的 .pv-origin-enter-active / -leave-active 里。
 *
 * 触发按钮取不到（键盘触发、程序化打开）时回落到「底边中点向上长」，方向仍然合理。
 */

interface PanelOriginOptions {
  /** 面板与按钮是左右并列而不是上下时，把位移方向倒过来（例如顶部工具栏右侧的浮层）。 */
  horizontal?: boolean
}

const DEFAULT_ORIGIN = { ox: '50%', oy: '100%' }

function asElement(target: Element | null | undefined): HTMLElement | null {
  if (!target) return null
  return target instanceof HTMLElement ? target : null
}

/** 触发按钮在视口里的中心点。按钮会随面板收起而消失时，打开那一刻先把它记下来。 */
export function readTriggerPoint(trigger: Element | null | undefined): { x: number, y: number } | null {
  const triggerEl = asElement(trigger)
  if (!triggerEl) return null
  const rect = triggerEl.getBoundingClientRect()
  if (!rect.width && !rect.height) return null
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * 把触发按钮的几何写进面板的 CSS 变量。返回是否成功取到按钮。
 * 面板已在 DOM 里（enter 钩子里元素已挂载但还没播动效）时调用。
 */
export function markPanelOrigin(
  panel: Element | null | undefined,
  trigger: Element | null | undefined,
  options: PanelOriginOptions = {}
): boolean {
  return markPanelOriginFromPoint(panel, readTriggerPoint(trigger), options)
}

/**
 * 同上，但触发点是事先量好的视口坐标（按钮已经不在屏上、或面板一开它就要消失时用这个）。
 */
export function markPanelOriginFromPoint(
  panel: Element | null | undefined,
  point: { x: number, y: number } | null | undefined,
  options: PanelOriginOptions = {}
): boolean {
  const panelEl = asElement(panel)
  if (!panelEl) return false
  if (!point) {
    panelEl.style.setProperty('--pv-ox', DEFAULT_ORIGIN.ox)
    panelEl.style.setProperty('--pv-oy', DEFAULT_ORIGIN.oy)
    panelEl.style.removeProperty('--pv-tx')
    panelEl.style.removeProperty('--pv-ty')
    return false
  }

  const panelRect = panelEl.getBoundingClientRect()
  if (!panelRect.width || !panelRect.height) {
    // enter 钩子里元素刚插入，布局可能还没量出尺寸（实测 0×0）——下一帧再算，别让动效退回居中。
    if ((options as { retry?: number }).retry !== undefined) return false
    requestAnimationFrame(() => {
      if (panelEl.isConnected) markPanelOriginFromPoint(panelEl, point, { ...options, retry: 1 } as PanelOriginOptions)
    })
    return false
  }

  const triggerX = point.x
  const triggerY = point.y
  const ox = ((triggerX - panelRect.left) / panelRect.width) * 100
  const oy = ((triggerY - panelRect.top) / panelRect.height) * 100
  const clamp = (value: number) => Math.min(100, Math.max(0, value))

  // 起始位移：按钮中心相对面板中心的方向，缩到面板尺寸的 12%，最多 20px。
  const rawX = (triggerX - (panelRect.left + panelRect.width / 2)) * 0.24
  const rawY = (triggerY - (panelRect.top + panelRect.height / 2)) * 0.24
  const limit = 20
  const shrink = (value: number) => Math.round(Math.max(-limit, Math.min(limit, value)))
  const tx = options.horizontal ? shrink(rawX) : shrink(rawX) * 0.5
  const ty = shrink(rawY) * 0.5

  panelEl.style.setProperty('--pv-ox', `${clamp(ox).toFixed(1)}%`)
  panelEl.style.setProperty('--pv-oy', `${clamp(oy).toFixed(1)}%`)
  panelEl.style.setProperty('--pv-tx', `${tx}px`)
  panelEl.style.setProperty('--pv-ty', `${ty}px`)
  return true
}
