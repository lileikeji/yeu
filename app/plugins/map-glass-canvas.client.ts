/**
 * 让高德 JSAPI 的 WebGL 画布保留绘制缓冲。
 *
 * 液态玻璃要把底图当作纹理重新采样，而 `texImage2D(canvas)` 只在画布
 * `preserveDrawingBuffer: true` 时拿得到内容——否则跨帧读回全是 0（实测
 * `[0,0,0,0]`），玻璃里只剩一层白雾，看上去「完全没有折射」。
 *
 * 高德没有暴露这个选项，只能在它创建上下文之前改 `getContext`：
 * 仅在地图页（`.map-workspace` 已挂载）对 webgl/webgl2 请求补上该属性，
 * 其它页面、其它 canvas 一律原样透传。
 */
export default defineNuxtPlugin(() => {
  if (typeof HTMLCanvasElement === 'undefined') return

  const original = HTMLCanvasElement.prototype.getContext

  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    attributes?: Record<string, unknown>
  ) {
    if ((type === 'webgl2' || type === 'webgl') && document.querySelector('.map-workspace')) {
      attributes = { ...(attributes ?? {}), preserveDrawingBuffer: true }
    }
    return original.call(this, type as never, attributes as never)
  } as typeof HTMLCanvasElement.prototype.getContext
})
