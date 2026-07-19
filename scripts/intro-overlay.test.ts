import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  buildYEU,
  getCampusMapLayout,
  insetWaterPolygon,
  interactiveWaterPolygons,
  isWaterPoint,
  pointInPolygon,
  WATER_EDGE_BUFFER,
  waterPolygons
} from '../app/utils/intro-overlay-geometry'
import {
  ASSEMBLY_SPRING,
  applyIntroParticleExplode,
  DAMPING,
  POINTER_JITTER,
  POINTER_RADIUS,
  POINTER_STRENGTH,
  POINTER_SWIRL,
  POINTER_VELOCITY_INFLUENCE,
  SPRING,
  stepIntroParticle,
  stepIntroParticleLeaving,
  stepMapMotion,
  type IntroParticle
} from '../app/utils/intro-overlay-physics'

const introSource = readFileSync(resolve('app/components/IntroOverlay.vue'), 'utf8')
const physicsSource = readFileSync(resolve('app/utils/intro-overlay-physics.ts'), 'utf8')
const geometrySource = readFileSync(resolve('app/utils/intro-overlay-geometry.ts'), 'utf8')
const homeSource = readFileSync(resolve('app/pages/index.vue'), 'utf8')
const defaultLayoutSource = readFileSync(resolve('app/layouts/default.vue'), 'utf8')

test('站点左上角使用工作区提供的完整品牌标识且不重复字标', () => {
  assert.doesNotMatch(defaultLayoutSource, />YEU<\/span>/)
  assert.match(defaultLayoutSource, /src="\/icons\/site-logo\.png"/)
  assert.match(defaultLayoutSource, /class="flex min-h-11 min-w-0 flex-1 items-center gap-2 sm:gap-3 md:flex-none"/)
  assert.match(defaultLayoutSource, /alt=""/)
  assert.match(defaultLayoutSource, /aria-hidden="true"/)
  assert.doesNotMatch(defaultLayoutSource, />仰恩新生指南<\/span>/)
  assert.doesNotMatch(defaultLayoutSource, /仰恩大学校标|yeu-logo/)
  assert.match(defaultLayoutSource, /class="h-9 w-auto max-w-\[9\.5rem\] shrink-0 object-contain object-left sm:max-w-none"/)
  assert.match(defaultLayoutSource, /inline-flex min-h-11[^\n]+focus:translate-y-0/)
})

test('开场动画使用代码生成的 YEU 粒子坐标且不依赖运行时图片取样', () => {
  assert.doesNotMatch(introSource, /getImageData|new Image\s*\(/)
  assert.match(introSource, /buildYEU/)
  assert.match(introSource, /hasLoaded\.value = true/)
  assert.match(introSource, /intro-overlay-geometry/)
})

test('动画初始化失败会快速放行首页', () => {
  assert.match(introSource, /visible\.value = true[\s\S]{0,500}?await nextTick\(\)[\s\S]{0,80}?initializeAnimation\(\)/)
  assert.match(
    introSource,
    /schedule\(\(\) => \{\s*if \(!hasLoaded\.value\) \{[\s\S]{0,240}?completeIntro\(\)[\s\S]{0,80}?\}\s*\}, 800\)/
  )
  assert.match(introSource, /catch \{[\s\S]{0,200}?completeIntro\(\)/)
  assert.match(introSource, /onUnmounted\(clearRuntime\)/)
  assert.match(introSource, /prefers-reduced-motion: reduce/)
})

test('动画每次重新打开页面播放一次且可手动重播', () => {
  assert.doesNotMatch(introSource, /sessionStorage|INTRO_SESSION_KEY/)
  assert.match(homeSource, /useState\('yeu-guide-intro-played-this-visit'/)
  assert.match(homeSource, /!introPlayedThisVisit\.value/)
  assert.match(homeSource, /await nextTick\(\)/)
  assert.match(homeSource, /forceIntro\.value = true/)
  assert.match(homeSource, /:force="forceIntro"/)
  assert.match(homeSource, /route\.query\.intro === '1'/)
  assert.doesNotMatch(homeSource, /window\.location\.reload\(\)/)
})

test('减少动画设置使用短版粒子效果而不是完全跳过', () => {
  assert.match(introSource, /reducedMotion\.value = !props\.force/)
  assert.match(introSource, /flyInDuration = reducedMotion\.value \? 900 : FLY_IN_DURATION/)
  assert.match(introSource, /buildYEU\(width, height, lowPowerMode\)/)
})

test('动画完成后停留并且只在用户点击时进入首页', () => {
  assert.doesNotMatch(introSource, /maxDuration|global watchdog/)
  assert.doesNotMatch(introSource, /schedule\(\s*leaveIntro/)
  assert.match(introSource, /data-intro-enter/)
  assert.match(introSource, /@click="leaveIntro"/)
  assert.match(introSource, /if \(visible\.value\)/)
})

test('开场动画加载提示面向新生而不是暴露实现过程', () => {
  assert.match(introSource, /正在准备校园地图/)
  assert.doesNotMatch(introSource, /正在构建粒子星图/)
})

test('粒子聚合后保留鼠标推力和阻尼回归交互', () => {
  assert.match(introSource, /@pointermove="handlePointerMove"/)
  assert.match(physicsSource, /export const SPRING = 0\./)
  assert.match(physicsSource, /export const ASSEMBLY_SPRING = 0\.075/)
  assert.match(physicsSource, /export const DAMPING = 0\./)
  assert.match(physicsSource, /export const POINTER_RADIUS = 230/)
  assert.match(physicsSource, /export const POINTER_STRENGTH = 42/)
  assert.match(physicsSource, /export const POINTER_VELOCITY_INFLUENCE = 0\.95/)
  assert.match(physicsSource, /assembleProgress < 1 \? ASSEMBLY_SPRING : SPRING/)
  assert.match(physicsSource, /0\.3 \+ eased \* 0\.7/)
  assert.match(physicsSource, /assemblyDistance: Math\.hypot|assemblyDistance \* Math\.pow/)
  assert.match(physicsSource, /Math\.pow\(1 - assembleProgress, 1\.6\) \+ 6/)
  assert.match(physicsSource, /force = \(soft \* 0\.75 \+ proximity \* 0\.55\) \* POINTER_STRENGTH/)
  assert.match(physicsSource, /pointer\.vx \* proximity \* POINTER_VELOCITY_INFLUENCE/)
  assert.match(physicsSource, /export const POINTER_JITTER = 5\.2/)
  assert.match(physicsSource, /export const POINTER_SWIRL = 0\.42/)
  assert.match(physicsSource, /assembleProgress < 1/)
  assert.match(physicsSource, /Math\.sin\(time \* 17\.5 \+ p\.seed \* 3\.1\)/)
  assert.match(physicsSource, /p\.vx = \(p\.vx \+ fx\) \* DAMPING/)
  assert.match(introSource, /stepIntroParticle/)
  assert.equal(SPRING, 0.028)
  assert.equal(ASSEMBLY_SPRING, 0.075)
  assert.equal(DAMPING, 0.91)
  assert.equal(POINTER_RADIUS, 230)
  assert.equal(POINTER_STRENGTH, 42)
  assert.equal(POINTER_VELOCITY_INFLUENCE, 0.95)
  assert.equal(POINTER_JITTER, 5.2)
  assert.equal(POINTER_SWIRL, 0.42)
})

test('外围星空避开主体并保留分层漂移与交互', () => {
  assert.match(physicsSource, /layer: 'logo' \| 'ambient'/)
  assert.match(introSource, /bgCount = lowPowerMode \? 40 : 72/)
  assert.match(introSource, /exclusionHalfWidth/)
  assert.match(physicsSource, /ambientDrift = p\.layer === 'ambient'/)
  assert.match(physicsSource, /interactionRadius = p\.layer === 'ambient'/)
  assert.match(introSource, /const twinkle = p\.layer === 'ambient'/)
  assert.match(introSource, /ambientParticles/)
})

test('粒子渲染限制高分屏开销并避免每帧重画背景网格', () => {
  assert.match(introSource, /lowPowerMode \? 1 : Math\.min\(window\.devicePixelRatio \|\| 1, 1\.4\)/)
  assert.match(introSource, /lowPowerMode \? 1000 \/ 30 : 1000 \/ 45/)
  assert.match(introSource, /ctx\.clearRect\(0, 0, width, height\)/)
  assert.doesNotMatch(introSource, /ctx\.fillRect\(0, 0, width, height\)/)
  assert.match(introSource, /intro-map-grid/)
  assert.match(introSource, /class="intro-stage/)
  assert.match(introSource, /eased = 1 - Math\.pow\(1 - assembleProgress, \d\)/)
})

test('首页不因装饰动画而被隐藏或禁用', () => {
  assert.doesNotMatch(homeSource, /introActive/)
  assert.doesNotMatch(homeSource, /pointer-events-none[^\n]*intro/)
  assert.match(homeSource, /<div class="animate-spring-up">/)
})

test('开场动画失败静默降级且不向生产控制台写调试错误', () => {
  assert.match(introSource, /catch \{\s*completeIntro\(\)/)
  assert.doesNotMatch(introSource, /console\.(?:log|debug|info|warn|error)/)
})

test('开场动画使用选中的校园底图并提供路径、水波和阻尼视差', () => {
  assert.match(introSource, /\/images\/intro\/yeu-campus-hero\.webp/)
  assert.match(introSource, /width="1579"/)
  assert.match(introSource, /height="889"/)
  assert.match(introSource, /fetchpriority="high"/)
  assert.match(introSource, /intro-campus-map/)
  assert.match(introSource, /mapMotion\.targetX/)
  assert.match(introSource, /intro-route-left/)
  assert.match(introSource, /intro-route-right/)
  assert.match(introSource, /intro-ripple-field/)
  assert.match(introSource, /guideActive/)
  assert.match(introSource, /event\.pointerType === 'touch' \|\| window\.innerWidth < 768/)
  assert.match(introSource, /stepMapMotion\(mapMotion\)/)
})

test('校园水域支持带阻尼的鼠标流动尾迹与点击波纹', () => {
  assert.match(geometrySource, /export const waterPolygons/)
  assert.match(geometrySource, /export const WATER_EDGE_BUFFER = 0\.02/)
  assert.match(geometrySource, /export const interactiveWaterPolygons = waterPolygons\.map\(insetWaterPolygon\)/)
  assert.match(geometrySource, /export function isWaterPoint/)
  assert.match(geometrySource, /export function getCampusMapLayout/)
  assert.match(geometrySource, /const objectPositionX = isMobile \? 0\.52 : 0\.5/)
  assert.match(introSource, /function clipToWater/)
  assert.match(introSource, /function drawRefractedWater/)
  assert.match(introSource, /const cell = lowPowerMode/)
  assert.match(introSource, /waterLens\.vx = \(waterLens\.vx \+ \(waterPointer\.x - waterLens\.x\)/)
  assert.match(introSource, /ctx\.drawImage/)
  assert.match(introSource, /waterRipples\.push/)
  assert.match(introSource, /ctx\.ellipse\(ripple\.x, ripple\.y [+-]/)
  assert.match(introSource, /globalCompositeOperation = 'destination-in'/)
  assert.match(introSource, /globalCompositeOperation = 'soft-light'/)
  assert.match(introSource, /ring < 3/)
  assert.match(introSource, /ref="waterCanvasRef"/)
  assert.match(introSource, /@pointerdown="handleWaterClick"/)
  assert.equal(WATER_EDGE_BUFFER, 0.02)
  assert.ok(waterPolygons.length >= 4)
  assert.equal(interactiveWaterPolygons.length, waterPolygons.length)
})

test('开场动画壳只保留生命周期与渲染编排，纯逻辑在 utils', () => {
  assert.match(introSource, /from '~\/utils\/intro-overlay-geometry'/)
  assert.match(introSource, /from '~\/utils\/intro-overlay-physics'/)
  assert.match(introSource, /stepIntroParticleLeaving/)
  assert.match(introSource, /applyIntroParticleExplode/)
  assert.doesNotMatch(introSource, /function buildYEU\(/)
  assert.doesNotMatch(introSource, /function addSegment\(/)
  assert.doesNotMatch(introSource, /const SPRING =/)
  assert.doesNotMatch(introSource, /const waterPolygons/)
  assert.match(physicsSource, /export function stepIntroParticle/)
  assert.match(geometrySource, /export function buildYEU/)
})

test('buildYEU 生成桌面与低功耗坐标点且落在画布中心带', () => {
  const desktop = buildYEU(1280, 720, false)
  const lowPower = buildYEU(1280, 720, true)
  assert.ok(desktop.length > 80)
  assert.ok(lowPower.length > 60)
  assert.ok(lowPower.length < desktop.length)
  for (const point of desktop) {
    assert.ok(point.x > 1280 * 0.2 && point.x < 1280 * 0.8)
    assert.ok(point.y > 720 * 0.1 && point.y < 720 * 0.7)
  }
})

test('水域多边形命中与 inset 收缩可纯函数验证', () => {
  const square: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]]
  assert.equal(pointInPolygon(0.5, 0.5, square), true)
  assert.equal(pointInPolygon(1.5, 0.5, square), false)
  const inset = insetWaterPolygon(square)
  assert.equal(inset.length, 4)
  assert.ok(inset[0]![0]! > 0 && inset[0]![0]! < 0.1)
  const layout = getCampusMapLayout(1200, 800)
  assert.equal(layout.viewportWidth, 1200)
  assert.equal(layout.viewportHeight, 800)
  assert.ok(layout.mapScale > 1)
  const mobile = getCampusMapLayout(390, 844)
  assert.ok(mobile.mapScale > layout.mapScale)
  // a known interior water sample should hit on desktop-sized map
  const waterHit = isWaterPoint(layout.viewportWidth * 0.75, layout.viewportHeight * 0.28, layout)
  assert.equal(typeof waterHit, 'boolean')
})

test('粒子弹簧步进会向目标收敛，离开态会衰减透明度', () => {
  const particle: IntroParticle = {
    x: 0,
    y: 0,
    targetX: 100,
    targetY: 50,
    vx: 0,
    vy: 0,
    radius: 2,
    color: '#fff',
    alpha: 1,
    seed: 1,
    glow: 0.5,
    layer: 'logo',
    depth: 1,
    assemblyDistance: 120
  }
  const beforeX = particle.x
  stepIntroParticle(particle, {
    assembleProgress: 0.5,
    eased: 0.5,
    time: 1,
    pointer: { x: 0, y: 0, vx: 0, vy: 0, active: false }
  })
  assert.ok(particle.x > beforeX)
  assert.ok(particle.vx !== 0 || particle.vy !== 0)

  particle.alpha = 1
  particle.vx = 10
  particle.vy = 10
  stepIntroParticleLeaving(particle)
  assert.ok(particle.alpha < 1)

  applyIntroParticleExplode([particle], 0, 0, () => 0.5)
  assert.ok(Math.hypot(particle.vx, particle.vy) > 0)

  const motion = { x: 0, y: 0, vx: 0, vy: 0, targetX: 10, targetY: -8 }
  stepMapMotion(motion)
  assert.ok(motion.vx !== 0 || motion.vy !== 0)
})
