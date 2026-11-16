import type { Ref } from 'vue'

/**
 * 地图液态玻璃折射层。
 *
 * 用途：地图页的玻璃面板（顶部搜索条、底部卡片、右侧图层面板）原先靠
 * `backdrop-filter: blur()` 做毛玻璃，iOS Safari 上这类元素一多就掉帧，
 * 而且拿不到「边缘折射」的液态玻璃观感。这里改成一张覆盖在地图上的
 * WebGL2 canvas：把地图底图 canvas 当纹理采样，在每块玻璃的矩形里自己算
 * 圆角遮罩 + 边缘折射 + 雾化，玻璃元素本身只留文字和边框。
 *
 * 三个实测坑（改动着色器前先看这里）：
 * 1. 中心必须雾化、只在边缘折射。中心全透会让底图的地名、道路纹理直接
 *    压在面板文字下面，字看不清；
 * 2. 饱和度乘子必须 ≤ 0.7。底图大面积是绿色（校园绿化 + 农田），
 *    乘子一过 1 就开始发绿；
 * 3. GLSL 里 `half` 是保留字，变量别叫 half/half2/halfX，否则整段编译失败。
 *
 * SSR：模块顶层不碰 window / document，所有 DOM 访问都在 attach() 之后，
 * 并且用 import.meta.client 兜底，服务端渲染时所有方法都是空操作。
 */

/** 一次最多画多少块玻璃。地图页实测同屏 ≤ 8 块，16 够用且 uniform 数组不至于太大。 */
export const MAX_GLASS_QUADS = 16
/** 设备像素比上限。底图纹理每帧要重传一次，按 2 倍已经够清楚，再高在 4K 屏上明显掉帧。 */
export const MAX_GLASS_DEVICE_PIXEL_RATIO = 2
/** 小于 2 CSS px 的玻璃直接跳过：面板收起动画里会量到 0~1.5px 的残影矩形。 */
export const MIN_GLASS_SIZE_PX = 2
/** 全局折射强度默认值：实测 26 CSS 像素在 8 块玻璃同帧 6.5ms，再大边缘开始「漏边」。 */
export const DEFAULT_GLASS_STRENGTH = 26

/** 玻璃目标里只需要量尺寸，抽成结构类型后测试里不用真造 HTMLElement。 */
export interface GlassRectSource {
  getBoundingClientRect: () => { left: number, top: number, width: number, height: number }
}

export interface GlassTarget {
  element: HTMLElement
  /** 圆角，相对短边。0.5=胶囊，0.2 左右=圆角矩形 */
  radius: number
  /** 折射强度倍率，相对全局 strength */
  strengthMul: number
  /** 中心雾化强度 0..1。大面板给 0.8+，小元素给 0 */
  frost: number
  /** 亮边（水切面）倍率，默认 1；大面板给 0，边缘只留模糊与折射，不出白线 */
  rim?: number
}

export interface MapGlassOptions {
  /** 采样源：底图 canvas 或 img */
  source: () => HTMLCanvasElement | HTMLImageElement | null
  /** 玻璃元素集合；返回空数组等于不渲染 */
  targets: () => GlassTarget[]
  /** 全局折射强度，默认 26 */
  strength?: number
}

/** 归一化后的玻璃矩形（原点在左下，和 WebGL 的纹理坐标一致）。 */
export interface GlassQuad {
  /** 左下角 x */
  x: number
  /** 左下角 y */
  y: number
  /** 宽（归一化） */
  w: number
  /** 高（归一化） */
  h: number
  radius: number
  strengthMul: number
  frost: number
  rim: number
}

/** 容器在屏幕上的位置与尺寸（getBoundingClientRect 的原样裁剪）。 */
export interface GlassViewport {
  left: number
  top: number
  width: number
  height: number
}

/** 着色器里 `uRect` / `uParams` 的数组长度，必须和 GLSL 的 #define 一致。 */
const VERTEX_SHADER = `#version 300 es
precision highp float;

#define MAX_GLASS ${MAX_GLASS_QUADS}

uniform vec4 uRect[MAX_GLASS];
uniform vec4 uParams[MAX_GLASS];
uniform vec2 uRes;

layout(location = 0) in vec2 aCorner;

flat out vec4 vRect;
flat out vec4 vParams;

void main() {
  vec4 g = vec4(0.0);
  vec4 p = vec4(0.0);
  // 顶点着色器里按 gl_InstanceID 取自己那块玻璃的矩形；用等值循环代替动态下标，
  // 个别驱动/翻译层对 uniform 数组动态下标支持不一致，这里每实例只跑 4 个顶点，代价可忽略。
  for (int i = 0; i < MAX_GLASS; i++) {
    if (i == gl_InstanceID) {
      g = uRect[i];
      p = uParams[i];
    }
  }
  vRect = g;
  vParams = p;

  // 矩形外扩 2 设备像素：rim 亮边和抗锯齿要画到边界外那一半像素。
  vec2 pad = 2.0 / uRes;
  vec2 lo = g.xy - pad;
  vec2 hi = g.xy + g.zw + pad;
  vec2 pos = mix(lo, hi, aCorner);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
// 采样器显式给 highp：ES 3.00 里 sampler 默认是 lowp，移动端 GPU 上用 lowp 采样
// 底图会在缩放时出现块状色带。
precision highp sampler2D;

uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uStrength;
uniform float uDpr;

flat in vec4 vRect;
flat in vec4 vParams;

out vec4 outColor;

/**
 * 饱和度乘子。底图是大面积绿色，超过 0.7 就明显发绿（实测 0.85 时草地
 * 会把玻璃整体染成淡绿），所以固定在 0.7，等于轻微降饱和。
 */
const float SAT_MIX = 0.7;

/** 圆角矩形有符号距离：d < 0 在内部。 */
float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 sampleSrc(vec2 uv) {
  return texture(uTex, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
}

/**
 * 9 抽样模糊。步长固定 1.3 设备像素：这是实测出来的上限，
 * 再大（1.6 以上）面板下面的道路名会糊成一团、文字压不住底图。
 */
vec3 blur9(vec2 uv) {
  vec2 e = 1.3 / uRes;
  vec3 c = sampleSrc(uv) * 4.0;
  c += sampleSrc(uv + vec2(-e.x, 0.0)) * 2.0;
  c += sampleSrc(uv + vec2(e.x, 0.0)) * 2.0;
  c += sampleSrc(uv + vec2(0.0, -e.y)) * 2.0;
  c += sampleSrc(uv + vec2(0.0, e.y)) * 2.0;
  c += sampleSrc(uv + vec2(-e.x, -e.y));
  c += sampleSrc(uv + vec2(e.x, -e.y));
  c += sampleSrc(uv + vec2(-e.x, e.y));
  c += sampleSrc(uv + vec2(e.x, e.y));
  return c * (1.0 / 16.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;

  vec2 c = vRect.xy + vRect.zw * 0.5;   // 玻璃矩形中心（归一化）
  vec2 hs = vRect.zw * 0.5;             // 半尺寸
  vec2 px = (uv - c) * uRes;            // 像素空间坐标（原点在玻璃中心）
  vec2 bpx = max(hs * uRes, vec2(1e-3)); // 半尺寸的像素值

  float radius = clamp(vParams.x, 0.0, 0.5);
  float rpx = min(bpx.x, bpx.y) * radius * 2.0;
  // 圆角不能超过短边的一半，否则 SDF 退化成负半径、边缘出现毛刺。
  rpx = min(rpx, min(bpx.x, bpx.y));

  float d = sdRoundRect(px, bpx, rpx);
  // d 的单位是设备像素，±0.9 就是 1 物理像素宽的抗锯齿过渡带；写死在这里，
  // 不要按 dpr 再缩，否则 2 倍屏上过渡带只剩 0.45px，边缘会发硬、出现台阶。
  float inside = 1.0 - smoothstep(-0.9, 0.9, d);
  if (inside <= 0.002) discard;

  // 边缘折射带：占短边的 42%。这一比例决定「液态」观感——太窄像描边，太宽整块都在扭。
  float bandPx = min(bpx.x, bpx.y) * 0.55;
  float band = clamp(1.0 - smoothstep(0.0, bandPx, -d), 0.0, 1.0);
  vec2 dir = normalize(px / max(bpx, vec2(1e-3)) + vec2(1e-6));
  // 用 band*band 代替 pow(band, 2.0)：GLSL 的 pow 在底数为 0 时未定义，部分驱动会出 NaN。
  float k = band * band;

  float frost = clamp(vParams.z, 0.0, 1.0);
  // strength 按设备像素算（除以 uRes 得到 uv 偏移）。26 在 2 倍屏上等于 13 CSS px 的
  // 视觉位移，这个量级下边缘的「液态挤压」看得出来、又不至于把底图拉出明显断层。
  float strength = uStrength * vParams.y;
  vec2 off = -dir * k * strength / uRes;

  // 透镜放大：中心把底图放大，越靠边越接近 1:1，形成鼓面。只有边缘折射时，
  // 中间那块和背景完全对齐，肉眼只看到一层白纱——这就是"看不出折射"的根因。
  float lens = mix(1.0, 0.85, 1.0 - band);
  vec2 uvLens = c + (uv - c) * lens;

  // 边缘折射：R/G/B 三个通道按 1.020 / 1.000 / 0.982 偏移，做出色散。
  vec3 sharp;
  sharp.r = sampleSrc(uvLens + off * 1.020).r;
  sharp.g = sampleSrc(uvLens + off * 1.000).g;
  sharp.b = sampleSrc(uvLens + off * 0.982).b;

  // 中心只做轻微模糊：整块都折射会把底图纹理扭到文字下面。
  vec3 blurred = blur9(uvLens);
  vec3 col = mix(blurred, sharp, smoothstep(0.0, 0.55, band));

  // 雾化：往冷白方向提，越靠近中心越浓，边缘保持清晰。
  col = mix(col, vec3(0.97, 0.98, 1.0), frost * 0.5 * (1.0 - band));
  col = mix(vec3(luma(col)), col, SAT_MIX);

  // 上缘高光：假设光源在正上方，靠近上边 45% 范围内缓慢提亮。
  float topLit = smoothstep(bpx.y * 0.45, bpx.y, px.y);
  topLit *= 1.0 - smoothstep(0.0, 3.0 * uDpr, -d);
  col += vec3(1.0) * topLit * 0.18;

  // 2 CSS px 亮边 rim：紧贴边界内侧，液态玻璃的「水切面」。
  // vParams.w 是逐目标的 rim 倍率（默认 1）：大面板上这条 2px 亮边会变成一道白线，
  // 面板把倍率设 0，边缘只留模糊与折射。
  float rim = (1.0 - smoothstep(0.0, 2.0 * uDpr, -d)) * clamp(vParams.w, 0.0, 2.0);
  col += vec3(1.0) * rim * 0.35;

  // 16~34 CSS px 内侧 gloss：一道很软的内高光。12→16 淡入、34→40 淡出，
  // 中间 16~34 保持满强度；这个区间来自对比截图，整段收窄到 16px 以内就会像描边。
  float gloss = smoothstep(12.0 * uDpr, 16.0 * uDpr, -d)
              * (1.0 - smoothstep(34.0 * uDpr, 40.0 * uDpr, -d));
  gloss *= smoothstep(bpx.y * 0.2, bpx.y, px.y);
  col += vec3(0.85, 0.93, 1.0) * gloss * 0.10;

  // 厚度：内侧底部压一条暗弧，模拟玻璃下沿的折射堆积。
  float bottom = 1.0 - smoothstep(-0.95, -0.35, px.y / max(bpx.y, 1e-3));
  float thick = bottom * (1.0 - smoothstep(0.0, 10.0 * uDpr, -d));
  col *= 1.0 - thick * 0.16;

  // 中心透明度 0.14、大面板雾化后 0.92：frost 越大越不透明，文字越好读。
  float alpha = inside * mix(0.32, 0.92, frost);
  alpha += rim * 0.25 + topLit * 0.12 + gloss * 0.06;
  alpha = clamp(alpha, 0.0, 1.0);

  // CR-4：上下文按 premultipliedAlpha:true 创建，输出必须是预乘色，否则合成器会再乘一次 alpha。
  outColor = vec4(col * alpha, alpha);
}
`

/** 一套已编译好的 GL 资源；上下文丢失后整组丢弃重建。 */
interface GlassPipeline {
  gl: WebGL2RenderingContext
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  buffer: WebGLBuffer
  texture: WebGLTexture
  uRect: WebGLUniformLocation | null
  uParams: WebGLUniformLocation | null
  uRes: WebGLUniformLocation | null
  uStrength: WebGLUniformLocation | null
  uDpr: WebGLUniformLocation | null
  uTex: WebGLUniformLocation | null
}

/** 已挂载的状态。 */
interface GlassMount {
  container: HTMLElement
  canvas: HTMLCanvasElement
  /** attach 时容器原来是 static 的话，挂载后改成了 relative，卸载时还原。 */
  previousPosition: string
  positionPatched: boolean
  pipeline: GlassPipeline | null
  rects: Float32Array
  params: Float32Array
}

/** 设备像素比收敛到 [1, 2]：0、NaN、Infinity 一律按 1 处理。 */
export function resolveGlassPixelRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(value, MAX_GLASS_DEVICE_PIXEL_RATIO)
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * 把玻璃元素量成归一化矩形。
 *
 * 纯函数、不碰 WebGL，测试可以直接喂结构相同的假元素进来。三条规则：
 * - 宽或高小于 2 CSS px 直接跳过（收起动画里的残影矩形）；
 * - 完全在容器外的不画（地图平移时玻璃可能暂时离开视口）；
 * - y 要翻转：WebGL 原点在左下，CSS 的 top 是从上往下量。
 */
export function collectGlassQuads(
  targets: ReadonlyArray<Omit<GlassTarget, 'element'> & { element: GlassRectSource }>,
  viewport: GlassViewport
): GlassQuad[] {
  if (!(viewport.width > 0) || !(viewport.height > 0)) return []
  const quads: GlassQuad[] = []
  for (const target of targets) {
    if (quads.length >= MAX_GLASS_QUADS) break
    const rect = target.element.getBoundingClientRect()
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) continue
    if (rect.width < MIN_GLASS_SIZE_PX || rect.height < MIN_GLASS_SIZE_PX) continue
    const left = rect.left - viewport.left
    const top = rect.top - viewport.top
    // 完全在容器外：整块跳过，省一次全屏采样。
    if (left + rect.width <= 0 || top + rect.height <= 0) continue
    if (left >= viewport.width || top >= viewport.height) continue
    quads.push({
      x: left / viewport.width,
      y: 1 - (top + rect.height) / viewport.height,
      w: rect.width / viewport.width,
      h: rect.height / viewport.height,
      radius: clamp(target.radius, 0, 0.5),
      strengthMul: clamp(target.strengthMul, 0, 4),
      frost: clamp(target.frost, 0, 1),
      rim: clamp(target.rim ?? 1, 0, 2)
    })
  }
  return quads
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // eslint 里禁了 console，这里只能静默丢弃：调用方看 ready 一直是 false 就知道没起来。
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function buildPipeline(gl: WebGL2RenderingContext): GlassPipeline | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    return null
  }

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    return null
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }

  const vao = gl.createVertexArray()
  const buffer = gl.createBuffer()
  const texture = gl.createTexture()
  if (!vao || !buffer || !texture) {
    if (vao) gl.deleteVertexArray(vao)
    if (buffer) gl.deleteBuffer(buffer)
    if (texture) gl.deleteTexture(texture)
    gl.deleteProgram(program)
    return null
  }

  // 单位四边形：(0,0) (1,0) (0,1) (1,1)，TRIANGLE_STRIP 两个三角形。
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  // 底图是 DOM 来源（canvas / img），按左上角为第 0 行上传；翻转后 v=0 对应图像底部，
  // 正好和「归一化坐标原点在左下」对齐，着色器里就不用再倒一次。
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.bindTexture(gl.TEXTURE_2D, null)

  gl.useProgram(program)
  gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0)

  return {
    gl,
    program,
    vao,
    buffer,
    texture,
    uRect: gl.getUniformLocation(program, 'uRect[0]'),
    uParams: gl.getUniformLocation(program, 'uParams[0]'),
    uRes: gl.getUniformLocation(program, 'uRes'),
    uStrength: gl.getUniformLocation(program, 'uStrength'),
    uDpr: gl.getUniformLocation(program, 'uDpr'),
    uTex: gl.getUniformLocation(program, 'uTex')
  }
}

function destroyPipeline(pipeline: GlassPipeline): void {
  const { gl } = pipeline
  gl.deleteProgram(pipeline.program)
  gl.deleteVertexArray(pipeline.vao)
  gl.deleteBuffer(pipeline.buffer)
  gl.deleteTexture(pipeline.texture)
}

function resolveSourceSize(source: HTMLCanvasElement | HTMLImageElement): { width: number, height: number } {
  // img 用 naturalWidth：未加载完时 width/height 是 0，拿它当尺寸会白白跳过整帧。
  if ('naturalWidth' in source) return { width: source.naturalWidth, height: source.naturalHeight }
  return { width: source.width, height: source.height }
}

/** 纹理按 0.5x 降采样：底图 canvas 是 dpr2 的全屏尺寸，整张上传一次要搬 4 倍像素；
 *  玻璃只做低频弯折，半分辨率肉眼看不出差别，上传量直接降到 1/4。 */
const GLASS_UPLOAD_SCALE = 0.5
/** 上传限频 30Hz：底图只在用户平移缩放时才变，稳态下 60Hz 重传同一张纹理纯属白烧 GPU。 */
const GLASS_UPLOAD_INTERVAL_MS = 33

let downscaleCanvas: HTMLCanvasElement | null = null
let downscaleContext: CanvasRenderingContext2D | null = null

function uploadSource(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  source: HTMLCanvasElement | HTMLImageElement
): boolean {
  const size = resolveSourceSize(source)
  if (!(size.width >= 1) || !(size.height >= 1)) return false
  const targetWidth = Math.max(1, Math.round(size.width * GLASS_UPLOAD_SCALE))
  const targetHeight = Math.max(1, Math.round(size.height * GLASS_UPLOAD_SCALE))
  if (!downscaleCanvas) downscaleCanvas = document.createElement('canvas')
  if (!downscaleContext) downscaleContext = downscaleCanvas.getContext('2d')
  if (!downscaleContext) return false
  if (downscaleCanvas.width !== targetWidth || downscaleCanvas.height !== targetHeight) {
    downscaleCanvas.width = targetWidth
    downscaleCanvas.height = targetHeight
  }
  gl.bindTexture(gl.TEXTURE_2D, texture)
  try {
    // CR-2：中转画布复用，source-over 是叠加不是替换，先擦干净再画，纹理才等于当前帧。
    downscaleContext.clearRect(0, 0, targetWidth, targetHeight)
    downscaleContext.drawImage(source, 0, 0, targetWidth, targetHeight)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, downscaleCanvas)
  } catch {
    // 跨域污染时 drawImage / texImage2D 会抛 DOMException；本帧不画，下一帧继续试。
    return false
  }
  return true
}

export function useMapGlassRefraction(options: MapGlassOptions): {
  attach: (container: HTMLElement) => void
  start: () => void
  stop: () => void
  /** 过渡动画期间只冻结底图纹理上传（四边形照常重画）：面板在动，底图没动。 */
  setUploadFrozen: (value: boolean) => void
  readonly ready: Ref<boolean>
  readonly fps: Ref<number>
} {
  const ready = ref(false)
  const fps = ref(0)

  let mount: GlassMount | null = null
  let rafId: number | null = null
  /** 上下文丢失时记住「本来在跑」，恢复后自动接上。 */
  let resumeAfterRestore = false
  let frameCount = 0
  let fpsWindowStart = 0
  /** 纹理是否已经传过一次；没有的话第一帧必须无条件上传。 */
  let textureUploaded = false
  let lastUploadAt = 0

  const strength = clamp(
    typeof options.strength === 'number' ? options.strength : DEFAULT_GLASS_STRENGTH,
    0,
    120
  )

  /** 过渡期只冻结底图纹理上传（四边形照常重画）：面板在动、底图没动。 */
  let uploadFrozen = false

  function setUploadFrozen(value: boolean): void {
    uploadFrozen = value
  }

  function renderFrame(): void {
    if (!mount) return
    const { container, canvas } = mount
    const bounds = container.getBoundingClientRect()
    if (!(bounds.width > 0) || !(bounds.height > 0)) return

    const dpr = resolveGlassPixelRatio(globalThis.devicePixelRatio ?? 1)
    const pixelWidth = Math.max(1, Math.round(bounds.width * dpr))
    const pixelHeight = Math.max(1, Math.round(bounds.height * dpr))
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }

    const pipeline = mount.pipeline
    if (!pipeline) return
    const { gl } = pipeline
    gl.viewport(0, 0, pixelWidth, pixelHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // T-024：过渡期只清屏不画。面板高度每帧在变，四边形与底图纹理都要重算，
    // 正好是掉帧最狠的一段；这段交给 CSS 白纱兜底，transitionend 后接回来。
    // source 拿不到（地图还没就绪）就先清成透明，等下一帧。
    const source = options.source()
    if (!source) {
      // CR-3：源不可用时不能继续声称折射可用，否则页面拿不到 backdrop-filter 回落；F25：画布也要擦干净，别挂着上一帧发白玻璃。
      ready.value = false
      gl.clear(gl.COLOR_BUFFER_BIT)
      return
    }

    const targets = options.targets()
    if (targets.length === 0) {
      // CR-5：没有 target 就没有要画的玻璃，不上传整张底图，顺手把状态收干净。
      ready.value = false
      gl.clear(gl.COLOR_BUFFER_BIT)
      return
    }

    // 上传限频：底图只在平移缩放时才变，稳态 60Hz 重传同一张纹理是白烧 GPU。
    const now = globalThis.performance?.now?.() ?? 0
    if (!textureUploaded || (!uploadFrozen && now - lastUploadAt >= GLASS_UPLOAD_INTERVAL_MS)) {
      if (!uploadSource(gl, pipeline.texture, source)) return
      textureUploaded = true
      lastUploadAt = now
    }

    const quads = collectGlassQuads(targets, {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height
    })
    // 空数组 = 没有玻璃要画：已经 clear 过，直接返回，不提交 draw call。
    if (quads.length === 0) return

    for (let i = 0; i < quads.length; i += 1) {
      const quad = quads[i]
      if (!quad) continue
      const base = i * 4
      mount.rects[base] = quad.x
      mount.rects[base + 1] = quad.y
      mount.rects[base + 2] = quad.w
      mount.rects[base + 3] = quad.h
      mount.params[base] = quad.radius
      mount.params[base + 1] = quad.strengthMul
      mount.params[base + 2] = quad.frost
      mount.params[base + 3] = quad.rim
    }

    gl.useProgram(pipeline.program)
    gl.bindVertexArray(pipeline.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, pipeline.texture)
    gl.uniform1i(pipeline.uTex, 0)
    gl.uniform4fv(pipeline.uRect, mount.rects)
    gl.uniform4fv(pipeline.uParams, mount.params)
    gl.uniform2f(pipeline.uRes, pixelWidth, pixelHeight)
    gl.uniform1f(pipeline.uStrength, strength)
    gl.uniform1f(pipeline.uDpr, dpr)

    gl.enable(gl.BLEND)
    // 上下文按 premultipliedAlpha:true 创建、着色器输出预乘色，混合也必须按预乘来（否则颜色被二次衰减）。
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, quads.length)
    gl.bindVertexArray(null)
    ready.value = true
  }

  function loop(now: number): void {
    rafId = globalThis.requestAnimationFrame(loop)
    renderFrame()
    // FPS 数的是「循环实际跑起来的频率」，不是「成功画了几帧」：底图没就绪时
    // 每帧只 clear，但循环仍是 60Hz，报 0 会让人以为卡死。
    // 窗口取 500ms：再短单帧抖动就会把数字打到 30，看着像掉帧。
    frameCount += 1
    if (fpsWindowStart === 0) fpsWindowStart = now
    const elapsed = now - fpsWindowStart
    if (elapsed >= 500) {
      fps.value = Math.round((frameCount * 1000) / elapsed)
      frameCount = 0
      fpsWindowStart = now
    }
  }

  function stop(): void {
    // 停画 = 不需要运行：连「上下文恢复后继续」的意图一起清掉，否则 restored 会把循环拉回来。
    resumeAfterRestore = false
    if (rafId !== null) {
      globalThis.cancelAnimationFrame(rafId)
      rafId = null
    }
    frameCount = 0
    fpsWindowStart = 0
    fps.value = 0
    // 停画后不能继续声称折射可用：页面据此回落到 backdrop-filter，画布也要擦干净，别留上一帧。
    ready.value = false
    const gl = mount?.pipeline?.gl
    if (gl) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
  }

  function start(): void {
    // 非浏览器 / 没有 WebGL2 / 还没 attach：全部静默返回，不抛错。
    if (!import.meta.client) return
    if (!mount || !mount.pipeline) return
    if (rafId !== null) return
    fpsWindowStart = 0
    frameCount = 0
    // 重新启动时纹理可能已被换掉（上下文丢失后 pipeline 重建），第一帧必须无条件上传。
    textureUploaded = false
    rafId = globalThis.requestAnimationFrame(loop)
  }

  function handleContextLost(event: Event): void {
    // 不 preventDefault 的话浏览器不会尝试恢复上下文。
    event.preventDefault()
    const wasRunning = rafId !== null
    stop()
    resumeAfterRestore = wasRunning
    ready.value = false
    if (mount) mount.pipeline = null
  }

  function handleContextRestored(): void {
    if (!mount || !mount.canvas) return
    const gl = mount.canvas.getContext('webgl2') as WebGL2RenderingContext | null
    if (!gl) return
    const pipeline = buildPipeline(gl)
    if (!pipeline) return
    mount.pipeline = pipeline
    textureUploaded = false
    if (resumeAfterRestore) {
      resumeAfterRestore = false
      start()
    }
  }

  function detach(): void {
    stop()
    if (!mount) return
    mount.canvas.removeEventListener('webglcontextlost', handleContextLost)
    mount.canvas.removeEventListener('webglcontextrestored', handleContextRestored)
    if (mount.pipeline) destroyPipeline(mount.pipeline)
    mount.canvas.remove()
    if (mount.positionPatched) mount.container.style.position = mount.previousPosition
    mount = null
    ready.value = false
  }

  function attach(container: HTMLElement): void {
    if (!import.meta.client || typeof document === 'undefined') return
    if (mount && mount.container === container) return
    detach()

    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    // 盖在地图上但绝不能挡住手势：所有 pointer 事件穿透给下面的地图。
    canvas.style.pointerEvents = 'none'
    // 玻璃内容（文字、边框）由调用方的 DOM 层负责，这一层只画折射底。
    canvas.style.zIndex = '1'

    // absolute 定位要找最近的 positioned 祖先；容器是 static 时先临时改成 relative，
    // 否则 canvas 会跑到页面别的定位上下文里（常见症状：玻璃全画到左上角）。
    const previousPosition = globalThis.getComputedStyle(container).position
    const positionPatched = previousPosition === 'static'
    if (positionPatched) container.style.position = 'relative'

    container.appendChild(canvas)

    // 拿不到 WebGL2 就把 canvas 撤掉，ready 保持 false，调用方继续用 CSS 兜底。
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false
    }) as WebGL2RenderingContext | null
    if (!gl) {
      canvas.remove()
      if (positionPatched) container.style.position = previousPosition
      return
    }

    const pipeline = buildPipeline(gl)
    if (!pipeline) {
      canvas.remove()
      if (positionPatched) container.style.position = previousPosition
      return
    }

    mount = {
      container,
      canvas,
      previousPosition,
      positionPatched,
      pipeline,
      rects: new Float32Array(MAX_GLASS_QUADS * 4),
      params: new Float32Array(MAX_GLASS_QUADS * 4)
    }
    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)
  }

  if (import.meta.client && getCurrentScope()) {
    // 组件卸载时把 canvas、GL 资源、rAF 一起收掉；没有 effect scope（比如测试里直接调）就不注册。
    onScopeDispose(detach)
  }

  return { attach, start, stop, setUploadFrozen, ready, fps }
}
