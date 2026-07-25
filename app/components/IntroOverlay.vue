<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  buildYEU,
  getCampusMapLayout as computeCampusMapLayout,
  imagePointToViewport as projectImagePointToViewport,
  interactiveWaterPolygons,
  isWaterPoint as hitTestWaterPoint
} from '~/utils/intro-overlay-geometry'
import type { CampusMapLayout } from '~/utils/intro-overlay-geometry'
import {
  applyIntroParticleExplode,
  dampPointerVelocity,
  FLY_IN_DURATION,
  GLOW_RADIUS,
  stepIntroParticle,
  stepIntroParticleLeaving,
  stepMapMotion
} from '~/utils/intro-overlay-physics'
import type {
  IntroParticle,
  IntroWaterRipple
} from '~/utils/intro-overlay-physics'

const props = withDefaults(defineProps<{
  force?: boolean
  autoCompleteMs?: number | null
}>(), {
  force: false,
  autoCompleteMs: null
})
const emit = defineEmits<{ complete: [] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const waterCanvasRef = ref<HTMLCanvasElement | null>(null)
const campusImageRef = ref<HTMLImageElement | null>(null)
const stageRef = ref<HTMLDivElement | null>(null)
const enterButtonRef = ref<HTMLButtonElement | null>(null)
const visible = ref(false)
const hasLoaded = ref(false)
const isLeaving = ref(false)
const reducedMotion = ref(false)
const guideActive = ref(false)
let animationFrameId: number | null = null
let completed = false
let particles: IntroParticle[] = []
const waterRipples: IntroWaterRipple[] = []
const pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false }
const waterPointer = { x: 0, y: 0, active: false }
const waterLens = { x: 0, y: 0, vx: 0, vy: 0, strength: 0 }
const mapMotion = { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0 }
const timerIds = new Set<number>()
const INTRO_INIT_RETRY_DELAY = 180
const INTRO_INIT_MAX_ATTEMPTS = 3
const INTRO_INIT_FALLBACK_DELAY = 2400

function schedule(callback: () => void, delay: number): void {
  const timerId = window.setTimeout(() => {
    timerIds.delete(timerId)
    callback()
  }, delay)
  timerIds.add(timerId)
}

function clearRuntime(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  for (const timerId of timerIds) {
    window.clearTimeout(timerId)
  }
  timerIds.clear()
}

function completeIntro() {
  if (completed) return
  completed = true
  visible.value = false
  clearRuntime()
  emit('complete')
}

function leaveIntro() {
  if (isLeaving.value || completed) return
  isLeaving.value = true

  // 粒子爆炸散开
  const cx = (canvasRef.value?.clientWidth ?? window.innerWidth) / 2
  const cy = (canvasRef.value?.clientHeight ?? window.innerHeight) / 2
  applyIntroParticleExplode(particles, cx, cy)

  schedule(completeIntro, reducedMotion.value ? 250 : 700)
}

function handlePointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch' || window.innerWidth < 768) {
    pointer.active = false
    waterPointer.active = false
    mapMotion.targetX = 0
    mapMotion.targetY = 0
    return
  }
  const canvas = canvasRef.value
  if (!canvas) return
  const bounds = canvas.getBoundingClientRect()
  const nextX = event.clientX - bounds.left
  const nextY = event.clientY - bounds.top
  if (pointer.active) {
    pointer.vx = (pointer.vx + (nextX - pointer.x) * 0.9) * 0.76
    pointer.vy = (pointer.vy + (nextY - pointer.y) * 0.9) * 0.76
  }
  pointer.x = nextX
  pointer.y = nextY
  pointer.active = true
  updateWaterPointer(pointer.x, pointer.y)
  mapMotion.targetX = ((event.clientX / window.innerWidth) - 0.5) * -14
  mapMotion.targetY = ((event.clientY / window.innerHeight) - 0.5) * -10
}

function handlePointerLeave() {
  pointer.active = false
  // keep residual velocity so nearby particles settle with damping trail
  waterPointer.active = false
  mapMotion.targetX = 0
  mapMotion.targetY = 0
}

// waterPolygons / interactiveWaterPolygons / WATER_EDGE_BUFFER come from intro-overlay-geometry

function getCampusMapLayout(): CampusMapLayout {
  return computeCampusMapLayout(window.innerWidth, window.innerHeight)
}

function imagePointToViewport(x: number, y: number, layout: CampusMapLayout): [number, number] {
  return projectImagePointToViewport(x, y, layout, mapMotion.x, mapMotion.y)
}

function isWaterPoint(x: number, y: number): boolean {
  return hitTestWaterPoint(x, y, getCampusMapLayout(), mapMotion.x, mapMotion.y)
}

function clipToWater(ctx: CanvasRenderingContext2D): void {
  const layout = getCampusMapLayout()
  ctx.beginPath()
  for (const polygon of interactiveWaterPolygons) {
    polygon.forEach(([x, y], index) => {
      const [viewportX, viewportY] = imagePointToViewport(x, y, layout)
      if (index === 0) ctx.moveTo(viewportX, viewportY)
      else ctx.lineTo(viewportX, viewportY)
    })
    ctx.closePath()
  }
  ctx.clip()
}

function updateWaterPointer(x: number, y: number): void {
  if (!isWaterPoint(x, y)) {
    waterPointer.active = false
    return
  }

  if (!waterPointer.active && waterLens.strength < 0.05) {
    waterLens.x = x
    waterLens.y = y
    waterLens.vx = 0
    waterLens.vy = 0
  }
  waterPointer.x = x
  waterPointer.y = y
  waterPointer.active = true
}

function handleWaterClick(event: PointerEvent): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const bounds = canvas.getBoundingClientRect()
  const x = event.clientX - bounds.left
  const y = event.clientY - bounds.top
  if (!isWaterPoint(x, y)) return
  waterRipples.push({ x, y, age: 0, duration: 2400 })
  if (waterRipples.length > 8) waterRipples.shift()
}

function drawRefractedWater(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  time: number,
  lowPowerMode: boolean
): void {
  const layout = getCampusMapLayout()
  const [imageX, imageY] = imagePointToViewport(0, 0, layout)
  const [imageRight, imageBottom] = imagePointToViewport(1, 1, layout)
  const radius = lowPowerMode ? 68 : 88
  const cell = lowPowerMode ? 16 : 11
  const half = radius
  const motionEnergy = Math.min(1, Math.hypot(waterLens.vx, waterLens.vy) / 7.5)
  const strength = waterLens.strength
  const flowX = waterLens.vx
  const flowY = waterLens.vy

  ctx.save()
  clipToWater(ctx)
  // Keep campus tones; only mild regrading so water stays photographic.
  ctx.filter = 'saturate(0.9) contrast(1.02) brightness(0.7)'
  ctx.globalAlpha = 0.78

  for (let y = -half; y < half; y += cell) {
    for (let x = -half; x < half; x += cell) {
      const sampleX = waterLens.x + x + cell * 0.5
      const sampleY = waterLens.y + y + cell * 0.5
      const dx = sampleX - waterLens.x
      const dy = sampleY - waterLens.y
      const dist = Math.hypot(dx, dy)
      if (dist > radius) continue
      const falloff = Math.pow(1 - dist / radius, 1.35)

      // Local surface waves (varies in 2D, avoids stripy fake banding).
      const wave = Math.sin(sampleX * 0.055 + time * 2.05) * Math.cos(sampleY * 0.048 - time * 1.55) * 1.15
        + Math.sin((sampleX + sampleY) * 0.034 - time * 2.7) * 0.7
        + Math.cos(sampleX * 0.02 - sampleY * 0.03 + time * 1.1) * 0.4

      // Mouse wake: drag along velocity + slight perpendicular swirl.
      const wake = falloff * (0.75 + motionEnergy * 1.6)
      let offsetX = flowX * 0.2 * wake + wave * (1.1 + motionEnergy) * falloff
      let offsetY = flowY * 0.14 * wake + wave * 0.55 * falloff
      offsetX += -dy * 0.012 * motionEnergy * falloff
      offsetY += dx * 0.01 * motionEnergy * falloff

      // Gentle depression under the cursor center.
      offsetX += (dx / (dist || 1)) * falloff * (1.8 + motionEnergy * 1.4)
      offsetY += (dy / (dist || 1)) * falloff * (1.2 + motionEnergy)

      // Expanding click rings warp the surface pixels.
      for (const ripple of waterRipples) {
        const progress = Math.min(1, ripple.age / ripple.duration)
        if (progress <= 0 || progress >= 1) continue
        const rdx = sampleX - ripple.x
        const rdy = sampleY - ripple.y
        const rdist = Math.hypot(rdx, rdy) || 1
        const waveR = 6 + progress * 132
        const band = 14 + progress * 12
        const ringDist = Math.abs(rdist - waveR)
        if (ringDist >= band) continue
        const envelope = Math.cos((ringDist / band) * Math.PI * 0.5)
        const life = Math.sin(progress * Math.PI)
        const amp = envelope * life * (7.4 - progress * 2.8) * (0.55 + falloff * 0.45)
        offsetX += (rdx / rdist) * amp
        offsetY += (rdy / rdist) * amp * 0.72
      }

      offsetX *= strength
      offsetY *= strength

      const tileW = cell + 1.5
      const tileH = cell + 1.5
      const tileX = waterLens.x + x
      const tileY = waterLens.y + y
      ctx.save()
      ctx.beginPath()
      ctx.rect(tileX, tileY, tileW, tileH)
      ctx.clip()
      ctx.drawImage(
        image,
        imageX + offsetX,
        imageY + offsetY,
        imageRight - imageX,
        imageBottom - imageY
      )
      ctx.restore()
    }
  }

  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-atop'

  // Subtle depth only — avoid a dark circular sticker.
  const shade = ctx.createRadialGradient(
    waterLens.x,
    waterLens.y,
    radius * 0.05,
    waterLens.x,
    waterLens.y,
    radius
  )
  shade.addColorStop(0, `rgba(6, 34, 28, ${0.05 * strength * (0.4 + motionEnergy * 0.6)})`)
  shade.addColorStop(0.55, `rgba(4, 30, 24, ${0.08 * strength})`)
  shade.addColorStop(1, 'rgba(3, 24, 17, 0)')
  ctx.globalAlpha = 1
  ctx.fillStyle = shade
  ctx.fillRect(waterLens.x - radius, waterLens.y - radius, radius * 2, radius * 2)

  // Soft moving specular, photographic rather than neon.
  ctx.globalCompositeOperation = 'soft-light'
  const glintX = waterLens.x - radius * 0.16 + flowX * 1.2
  const glintY = waterLens.y - radius * 0.2 + flowY * 0.8
  const glint = ctx.createRadialGradient(glintX, glintY, 0, waterLens.x, waterLens.y, radius * 0.95)
  glint.addColorStop(0, `rgba(220, 240, 234, ${0.025 * strength * (0.45 + motionEnergy * 0.55)})`)
  glint.addColorStop(0.4, `rgba(150, 195, 180, ${0.01 * strength})`)
  glint.addColorStop(1, 'rgba(20, 40, 32, 0)')
  ctx.fillStyle = glint
  ctx.fillRect(waterLens.x - radius, waterLens.y - radius, radius * 2, radius * 2)

  ctx.restore()

  // Feather lens edge into the rest of the water.
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  const feather = ctx.createRadialGradient(
    waterLens.x,
    waterLens.y,
    radius * 0.18,
    waterLens.x,
    waterLens.y,
    radius
  )
  feather.addColorStop(0, `rgba(0, 0, 0, ${0.55 * strength})`)
  feather.addColorStop(0.55, `rgba(0, 0, 0, ${0.32 * strength})`)
  feather.addColorStop(0.82, `rgba(0, 0, 0, ${0.09 * strength})`)
  feather.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = feather
  ctx.fillRect(waterLens.x - radius, waterLens.y - radius, radius * 2, radius * 2)
  ctx.restore()
}

function renderWaterInteraction(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  deltaMs: number,
  time: number,
  lowPowerMode: boolean
): void {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  const frameScale = deltaMs / (1000 / 45)
  if (waterPointer.active) {
    waterLens.vx = (waterLens.vx + (waterPointer.x - waterLens.x) * 0.22) * Math.pow(0.7, frameScale)
    waterLens.vy = (waterLens.vy + (waterPointer.y - waterLens.y) * 0.22) * Math.pow(0.7, frameScale)
    waterLens.strength += (1 - waterLens.strength) * Math.min(1, 0.24 * frameScale)
  } else {
    waterLens.vx *= Math.pow(0.82, frameScale)
    waterLens.vy *= Math.pow(0.82, frameScale)
    waterLens.strength *= Math.pow(0.9, frameScale)
  }
  waterLens.x += waterLens.vx * frameScale
  waterLens.y += waterLens.vy * frameScale

  if (waterLens.strength > 0.015 && image.complete && image.naturalWidth > 0) {
    drawRefractedWater(ctx, image, time, lowPowerMode)
  }

  ctx.save()
  clipToWater(ctx)
  for (let i = waterRipples.length - 1; i >= 0; i--) {
    const ripple = waterRipples[i]!
    ripple.age += deltaMs
    const progress = ripple.age / ripple.duration
    if (progress >= 1) {
      waterRipples.splice(i, 1)
      continue
    }

    // Very soft contact flash — main feel comes from refraction warp.
    if (progress < 0.2) {
      const bloom = Math.sin((progress / 0.2) * Math.PI) * 0.055
      const bloomRadius = 8 + progress * 34
      const bloomGrad = ctx.createRadialGradient(ripple.x, ripple.y, 0, ripple.x, ripple.y, bloomRadius)
      bloomGrad.addColorStop(0, `rgba(210, 236, 226, ${bloom})`)
      bloomGrad.addColorStop(1, 'rgba(20, 50, 40, 0)')
      ctx.fillStyle = bloomGrad
      ctx.beginPath()
      ctx.ellipse(ripple.x, ripple.y, bloomRadius, bloomRadius * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    for (let ring = 0; ring < 3; ring++) {
      const delay = ring * 0.12
      const delayedProgress = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)))
      if (delayedProgress <= 0) continue
      const ease = 1 - Math.pow(1 - delayedProgress, 1.35)
      const radius = 6 + ease * (126 - ring * 12)
      const alpha = Math.sin(delayedProgress * Math.PI) * (0.09 - ring * 0.02)
      const aspect = 0.36 + (1 - delayedProgress) * 0.05

      ctx.beginPath()
      ctx.ellipse(ripple.x, ripple.y + 0.8, radius, radius * aspect, 0, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(8, 42, 34, ${alpha * 0.55})`
      ctx.lineWidth = 1.05 - ring * 0.15
      ctx.stroke()

      ctx.beginPath()
      ctx.ellipse(ripple.x, ripple.y - 0.6, radius * 0.97, radius * aspect * 0.95, 0, Math.PI, Math.PI * 2)
      ctx.strokeStyle = `rgba(236, 248, 243, ${alpha * 0.7})`
      ctx.lineWidth = 0.65 - ring * 0.1
      ctx.stroke()
    }
  }

  ctx.restore()
}

// buildYEU comes from intro-overlay-geometry

function initializeAnimation() {
  const canvas = canvasRef.value
  if (!canvas) throw new Error('Intro canvas is unavailable.')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Intro canvas context is unavailable.')
  const waterCanvas = waterCanvasRef.value
  const waterCtx = waterCanvas?.getContext('2d') ?? null
  const campusImage = campusImageRef.value

  const width = window.innerWidth
  const height = window.innerHeight
  const lowPowerMode = reducedMotion.value
    || window.matchMedia('(max-width: 767px)').matches
    || (navigator.hardwareConcurrency ?? 4) <= 4
  const dpr = lowPowerMode ? 1 : Math.min(window.devicePixelRatio || 1, 1.4)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (waterCanvas && waterCtx) {
    waterCanvas.width = Math.round(width * dpr)
    waterCanvas.height = Math.round(height * dpr)
    waterCanvas.style.width = `${width}px`
    waterCanvas.style.height = `${height}px`
    waterCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const cx = width / 2
  const cy = height / 2
  const letterPoints = buildYEU(width, height, lowPowerMode)

  // 配色：交替仰恩绿 / 暖金 / 翡翠绿
  const colors = ['#7dc79b', '#ffbd6e', '#b2dfc2', '#ffefd4', '#5eb88a']

  particles = letterPoints.map((pt, i) => {
    // 从屏幕外围的随机角度飞入
    const angle = (i / letterPoints.length) * Math.PI * 6 + Math.random() * 1.2
    const dist = Math.max(width, height) * (0.5 + Math.random() * 0.4)
    const spawnX = cx + Math.cos(angle) * dist
    const spawnY = cy + Math.sin(angle) * dist
    return {
      x: spawnX,
      y: spawnY,
      targetX: pt.x,
      targetY: pt.y,
      vx: 0,
      vy: 0,
      radius: 1.6 + Math.random() * 0.8,
      color: colors[i % colors.length]!,
      alpha: 0.6 + Math.random() * 0.4,
      seed: Math.random() * 100,
      glow: 0.3 + Math.random() * 0.7,
      layer: 'logo',
      depth: 1,
      assemblyDistance: Math.hypot(pt.x - spawnX, pt.y - spawnY)
    }
  })

  // 外围环境星层：避开中央标志和文案，让主体始终清晰。
  const bgCount = lowPowerMode ? 40 : 72
  const exclusionHalfWidth = Math.min(width * 0.3, 360)
  const exclusionTop = cy - 210
  const exclusionBottom = cy + 220
  for (let i = 0; i < bgCount; i++) {
    let px = 0
    let py = 0
    do {
      px = 24 + Math.random() * Math.max(1, width - 48)
      py = 24 + Math.random() * Math.max(1, height - 48)
    } while (
      px > cx - exclusionHalfWidth
      && px < cx + exclusionHalfWidth
      && py > exclusionTop
      && py < exclusionBottom
    )
    const depth = 0.35 + Math.random() * 0.65
    particles.push({
      x: px,
      y: py,
      targetX: px,
      targetY: py,
      vx: 0,
      vy: 0,
      radius: 0.55 + depth * 0.95,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      alpha: 0.16 + depth * 0.32,
      seed: Math.random() * 100,
      glow: 0.12 + depth * 0.32,
      layer: 'ambient',
      depth,
      assemblyDistance: 0
    })
  }
  const ambientParticles = particles.slice(particles.length - bgCount)

  hasLoaded.value = true
  const startedAt = performance.now()
  const frameInterval = lowPowerMode ? 1000 / 30 : 1000 / 45
  const flyInDuration = reducedMotion.value ? 900 : FLY_IN_DURATION
  let previousFrame = 0

  function render(timestamp: number) {
    if (!ctx || !canvas) return
    if (timestamp - previousFrame < frameInterval) {
      animationFrameId = requestAnimationFrame(render)
      return
    }
    const deltaMs = previousFrame ? Math.min(64, timestamp - previousFrame) : frameInterval
    previousFrame = timestamp
    const elapsed = timestamp - startedAt
    const time = timestamp * 0.001

    ctx.clearRect(0, 0, width, height)

    stepMapMotion(mapMotion)
    stageRef.value?.style.setProperty('--map-x', `${mapMotion.x.toFixed(2)}px`)
    stageRef.value?.style.setProperty('--map-y', `${mapMotion.y.toFixed(2)}px`)

    // 雷达波纹
    const waveTime = (timestamp * 0.0008) % 3.0
    const waveR = waveTime * 140
    const waveAlpha = Math.max(0, 0.12 - (waveR / 420) * 0.12)
    ctx.strokeStyle = `rgba(125, 199, 155, ${waveAlpha})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy - 30, waveR, 0, Math.PI * 2)
    ctx.stroke()

    if (waterCtx && campusImage) {
      renderWaterInteraction(waterCtx, campusImage, deltaMs, time, lowPowerMode)
    }

    // 聚合进度（前 2 秒飞入聚合）
    const assembleProgress = Math.min(1, elapsed / flyInDuration)
    const eased = 1 - Math.pow(1 - assembleProgress, 3)

    for (const p of particles) {
      if (isLeaving.value) {
        // 爆炸阶段
        stepIntroParticleLeaving(p)
      } else {
        stepIntroParticle(p, {
          assembleProgress,
          eased,
          time,
          pointer
        })
      }

      // 绘制粒子（带光晕）
      const twinkle = p.layer === 'ambient'
        ? 0.68 + Math.sin(time * (0.7 + p.depth * 0.8) + p.seed) * 0.28
        : 1
      const drawAlpha = p.alpha * Math.min(1, elapsed / 500) * twinkle
      if (p.glow > 0.3) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius + GLOW_RADIUS * p.glow, 0, Math.PI * 2)
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius + GLOW_RADIUS * p.glow)
        gradient.addColorStop(0, p.color)
        gradient.addColorStop(1, 'transparent')
        ctx.fillStyle = gradient
        ctx.globalAlpha = drawAlpha * 0.25
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.globalAlpha = drawAlpha
      ctx.fill()
    }

    ctx.globalAlpha = 1
    dampPointerVelocity(pointer)

    // 连线效果：距离较近的粒子之间画半透明连线（反重力风格）
    if (assembleProgress > 0.6 && !isLeaving.value) {
      ctx.strokeStyle = 'rgba(125, 199, 155, 0.06)'
      ctx.lineWidth = lowPowerMode ? 0.8 : 0.4
      const lineParticles = particles.slice(0, particles.length - bgCount)
      for (let i = 0; i < lineParticles.length; i++) {
        for (let j = i + 1; j < Math.min(i + 6, lineParticles.length); j++) {
          const a = lineParticles[i]!
          const b = lineParticles[j]!
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 35) {
            const alpha = (1 - dist / 35) * (lowPowerMode ? 0.34 : 0.15)
            ctx.strokeStyle = `rgba(125, 199, 155, ${alpha})`
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      // 外围星座连线仅连接相邻的少量星点，保持稀疏和空间层次。
      ctx.lineWidth = 0.45
      for (let i = 0; i < ambientParticles.length; i++) {
        for (let j = i + 1; j < Math.min(i + 4, ambientParticles.length); j++) {
          const a = ambientParticles[i]!
          const b = ambientParticles[j]!
          const dx = a.x - b.x
          const dy = a.y - b.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance < 150) {
            const alpha = (1 - distance / 150) * 0.055 * Math.min(a.depth, b.depth)
            ctx.strokeStyle = `rgba(178, 223, 194, ${alpha})`
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }
    }

    if (visible.value) {
      animationFrameId = requestAnimationFrame(render)
    }
  }

  animationFrameId = requestAnimationFrame(render)
}

function startAnimation(attempt = 1): void {
  try {
    initializeAnimation()
    void nextTick(() => enterButtonRef.value?.focus({ preventScroll: true }))
  } catch {
    if (attempt < INTRO_INIT_MAX_ATTEMPTS) {
      schedule(() => startAnimation(attempt + 1), INTRO_INIT_RETRY_DELAY)
      return
    }
    completeIntro()
  }
}

onMounted(async () => {
  visible.value = true
  reducedMotion.value = !props.force
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  schedule(() => {
    if (!hasLoaded.value) {
      completeIntro()
    }
  }, INTRO_INIT_FALLBACK_DELAY)
  await nextTick()
  startAnimation()
  if (props.autoCompleteMs && props.autoCompleteMs > 0) {
    schedule(() => {
      guideActive.value = true
    }, Math.max(0, props.autoCompleteMs - 900))
    schedule(leaveIntro, props.autoCompleteMs)
  }
})

onUnmounted(clearRuntime)
</script>

<template>
  <Transition name="intro-fade">
    <div
      v-if="visible"
      ref="stageRef"
      class="intro-stage fixed inset-0 z-[9999] overflow-hidden bg-[#062219] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="仰恩新生指南开场动画"
    >
      <div
        class="intro-campus-map absolute inset-0"
        aria-hidden="true"
      >
        <img
          ref="campusImageRef"
          src="/images/intro/yeu-campus-hero.webp"
          alt=""
          width="1579"
          height="889"
          decoding="async"
          fetchpriority="high"
          class="intro-campus-image h-full w-full object-cover"
        >
        <div class="intro-campus-tone absolute inset-0" />
      </div>

      <!-- 经纬网格背景（CSS 层） -->
      <div class="intro-map-grid absolute inset-0" />

      <canvas
        ref="waterCanvasRef"
        class="pointer-events-none absolute inset-0 z-[1] block"
        aria-hidden="true"
      />

      <svg
        class="intro-route-map absolute inset-0 z-[2] h-full w-full"
        :class="{ 'is-active': guideActive }"
        viewBox="0 0 1000 560"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          class="intro-route intro-route-left"
          d="M 486 454 C 445 447, 414 425, 392 392 S 340 326, 292 294 S 224 257, 178 220"
        />
        <path
          class="intro-route intro-route-right"
          d="M 534 454 C 575 446, 608 420, 635 392 S 704 350, 758 354 S 830 370, 878 396"
        />
      </svg>

      <!-- Canvas 粒子渲染层 -->
      <canvas
        ref="canvasRef"
        class="absolute inset-0 z-[3] block touch-none"
        aria-hidden="true"
        @pointermove="handlePointerMove"
        @pointerdown="handleWaterClick"
        @pointerleave="handlePointerLeave"
        @pointercancel="handlePointerLeave"
      />

      <!-- 底部固定文字 & 按钮 -->
      <div class="pointer-events-none relative z-10 flex h-full flex-col items-center justify-center text-center">
        <div
          v-if="hasLoaded"
          class="intro-copy absolute left-6 right-6 flex flex-col items-center transition-all duration-700"
          :class="isLeaving ? 'opacity-0 translate-y-6 scale-95' : 'opacity-100'"
        >
          <p class="text-xs font-semibold uppercase tracking-normal text-[#b2dfc2] opacity-80">
            Yang-En University
          </p>
          <h2 class="mt-2 text-xl font-bold tracking-normal text-[#ffefd4]">
            仰恩新生指南
          </h2>
          <p class="mt-2 max-w-[280px] text-xs leading-relaxed text-[#7dc79b]/80">
            从校园地图开始，找到你的大学生活
          </p>
          <button
            ref="enterButtonRef"
            data-intro-enter
            class="pointer-events-auto mt-6 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[#7dc79b]/40 bg-[#104830]/70 px-6 text-sm font-semibold text-[#ffefd4] backdrop-blur transition-all duration-300 hover:border-[#b2dfc2] hover:bg-[#125a3a] hover:shadow-[0_0_24px_rgba(125,199,155,0.25)] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffbd6e]"
            @pointerenter="guideActive = true"
            @pointerleave="guideActive = false"
            @focus="guideActive = true"
            @blur="guideActive = false"
            @click="leaveIntro"
          >
            进入指南
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4"
            />
          </button>
          <div
            class="intro-ripple-field"
            :class="{ 'is-active': guideActive }"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </div>
        </div>

        <!-- 预备加载指示器 -->
        <div
          v-else
          class="flex flex-col items-center gap-3 text-[#b2dfc2]"
          role="status"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-7 animate-spin"
          />
          <span class="text-xs">正在准备校园地图...</span>
        </div>
      </div>

      <!-- 右上角跳过按钮 -->
      <button
        class="absolute right-4 top-4 z-20 min-h-11 cursor-pointer px-3 text-xs text-[#d8efe0]/60 transition hover:text-white focus-visible:outline-2 focus-visible:outline-[#ffbd6e]"
        aria-label="跳过动画"
        @click="leaveIntro"
      >
        跳过 ➜
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.intro-campus-map {
  inset: -18px;
  transform: translate3d(var(--map-x, 0), var(--map-y, 0), 0) scale(1.035);
  transition: filter 600ms ease, opacity 600ms ease;
  will-change: transform;
}

.intro-campus-image {
  filter: saturate(0.88) contrast(1.03) brightness(0.86);
}

.intro-campus-tone {
  background:
    radial-gradient(circle at 50% 38%, rgba(3, 28, 20, 0.46), rgba(3, 28, 20, 0.12) 35%, transparent 58%),
    linear-gradient(180deg, rgba(3, 24, 17, 0.24), rgba(3, 24, 17, 0.52));
  box-shadow: inset 0 0 180px rgba(0, 14, 10, 0.42);
}

.intro-map-grid {
  opacity: 0.72;
  background:
    radial-gradient(circle at 50% 52%, transparent 0 32%, rgba(3, 25, 18, 0.14) 57%, rgba(2, 16, 12, 0.48) 100%),
    linear-gradient(180deg, rgba(6, 34, 25, 0.1), rgba(6, 34, 25, 0.28));
}

.intro-route-map {
  z-index: 1;
  pointer-events: none;
  filter: drop-shadow(0 0 5px rgba(255, 239, 212, 0.3));
}

.intro-route {
  fill: none;
  stroke: rgba(255, 239, 212, 0.66);
  stroke-width: 0.72;
  stroke-linecap: round;
  stroke-dasharray: 4 17;
  stroke-dashoffset: 120;
  opacity: 0;
  transition: opacity 450ms ease;
}

.intro-route-map.is-active .intro-route {
  opacity: 0.42;
  animation: intro-route-flow 3.4s linear infinite;
}

.intro-route-right {
  animation-delay: 180ms;
}

.intro-copy {
  top: calc(50% + 125px);
}

.intro-ripple-field {
  pointer-events: none;
  position: absolute;
  left: 50%;
  top: calc(100% + 2px);
  width: 210px;
  height: 82px;
  transform: translate(-50%, -50%);
}

.intro-ripple-field span {
  position: absolute;
  inset: 50% auto auto 50%;
  width: 36px;
  height: 14px;
  border: 1px solid rgba(255, 239, 212, 0.62);
  border-radius: 50%;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.6);
}

.intro-ripple-field.is-active span {
  animation: intro-water-ripple 2.4s cubic-bezier(0.2, 0.7, 0.2, 1) infinite;
}

.intro-ripple-field span:nth-child(2) {
  animation-delay: 700ms;
}

.intro-ripple-field span:nth-child(3) {
  animation-delay: 1400ms;
}

@keyframes intro-route-flow {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes intro-water-ripple {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.55);
  }
  18% {
    opacity: 0.64;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(4.5);
  }
}

.intro-fade-enter-active,
.intro-fade-leave-active {
  transition: opacity 0.6s cubic-bezier(0.25, 1, 0.3, 1);
}

.intro-fade-enter-from,
.intro-fade-leave-to {
  opacity: 0;
}

@media (max-width: 767px) {
  .intro-campus-map {
    inset: -12px;
    transform: translate3d(var(--map-x, 0), var(--map-y, 0), 0) scale(1.06);
  }

  .intro-campus-image {
    object-position: 52% center;
  }

  .intro-campus-tone {
    background:
      radial-gradient(circle at 50% 39%, rgba(3, 28, 20, 0.62), rgba(3, 28, 20, 0.2) 38%, transparent 64%),
      linear-gradient(180deg, rgba(3, 24, 17, 0.28), rgba(3, 24, 17, 0.56));
  }

  .intro-copy {
    top: calc(50% + 95px);
  }

  .intro-route-map {
    opacity: 0.72;
  }
}

@media (prefers-reduced-motion: reduce) {
  .intro-campus-map {
    transform: scale(1.035);
  }

  .intro-route-map.is-active .intro-route,
  .intro-ripple-field.is-active span {
    animation: none;
  }
}
</style>
