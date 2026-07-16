export interface IntroParticle {
  x: number
  y: number
  targetX: number
  targetY: number
  vx: number
  vy: number
  radius: number
  color: string
  alpha: number
  seed: number
  glow: number
  layer: 'logo' | 'ambient'
  depth: number
  assemblyDistance: number
}

export interface IntroWaterRipple {
  x: number
  y: number
  age: number
  duration: number
}

export interface IntroPointerState {
  x: number
  y: number
  vx: number
  vy: number
  active: boolean
}

export interface IntroMapMotion {
  x: number
  y: number
  vx: number
  vy: number
  targetX: number
  targetY: number
}

// 物理参数 — 精心调校的阻尼弹簧系统
export const SPRING = 0.028 // 弹簧系数，柔和拉力
export const ASSEMBLY_SPRING = 0.075 // 入场阶段需要更强拉力，确保远处粒子按时形成字标
export const DAMPING = 0.91 // 阻尼系数，值越高拖尾越长
export const POINTER_RADIUS = 230 // 鼠标影响半径
export const POINTER_STRENGTH = 42 // 鼠标推力强度
export const POINTER_VELOCITY_INFLUENCE = 0.95 // 将鼠标移动速度传递给邻近粒子
export const POINTER_JITTER = 5.2 // 指针附近高频抖动
export const POINTER_SWIRL = 0.42 // 切向旋涡，增加阻尼手感
export const BREATHE_AMP = 0.5 // 呼吸微动振幅
export const GLOW_RADIUS = 4 // 粒子光晕半径
export const FLY_IN_DURATION = 2600
export const MAP_MOTION_SPRING = 0.028
export const MAP_MOTION_DAMPING = 0.9

export function stepMapMotion(mapMotion: IntroMapMotion): void {
  mapMotion.vx = (mapMotion.vx + (mapMotion.targetX - mapMotion.x) * MAP_MOTION_SPRING) * MAP_MOTION_DAMPING
  mapMotion.vy = (mapMotion.vy + (mapMotion.targetY - mapMotion.y) * MAP_MOTION_SPRING) * MAP_MOTION_DAMPING
  mapMotion.x += mapMotion.vx
  mapMotion.y += mapMotion.vy
}

export function applyIntroParticleExplode(
  particles: IntroParticle[],
  cx: number,
  cy: number,
  random: () => number = Math.random
): void {
  for (const p of particles) {
    const dx = p.x - cx
    const dy = p.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    p.vx = (dx / dist) * (12 + random() * 18)
    p.vy = (dy / dist) * (12 + random() * 18)
  }
}

export function stepIntroParticleLeaving(p: IntroParticle): void {
  p.vx *= 0.96
  p.vy *= 0.96
  p.x += p.vx
  p.y += p.vy
  p.alpha = Math.max(0, p.alpha - 0.02)
}

export function stepIntroParticle(
  p: IntroParticle,
  options: {
    assembleProgress: number
    eased: number
    time: number
    pointer: IntroPointerState
  }
): void {
  const { assembleProgress, eased, time, pointer } = options

  // 计算目标（聚合动画中，目标随进度插值）
  const ambientDrift = p.layer === 'ambient' ? 7 + p.depth * 8 : 0
  const tx = p.targetX + Math.sin(time * 0.24 + p.seed) * ambientDrift
  const ty = p.targetY + Math.cos(time * 0.19 + p.seed * 1.3) * ambientDrift * 0.7

  // 入场时先用较强拉力把远处粒子带回；成形后恢复柔和弹簧和阻尼手感。
  const spring = p.layer === 'logo' && assembleProgress < 1 ? ASSEMBLY_SPRING : SPRING
  const assemblyPull = p.layer === 'logo' ? 0.3 + eased * 0.7 : 1
  let fx = (tx - p.x) * spring * assemblyPull
  let fy = (ty - p.y) * spring * assemblyPull

  // 呼吸微动
  fx += Math.sin(time * 1.2 + p.seed) * BREATHE_AMP * 0.06
  fy += Math.cos(time * 0.9 + p.seed * 1.3) * BREATHE_AMP * 0.06

  // 鼠标阻尼斥力交互 —— 始终生效！
  if (pointer.active || Math.hypot(pointer.vx, pointer.vy) > 0.08) {
    const dx = p.x - pointer.x
    const dy = p.y - pointer.y
    const dist = Math.hypot(dx, dy) || 1

    const interactionRadius = p.layer === 'ambient'
      ? POINTER_RADIUS * (1.2 + p.depth * 0.55)
      : POINTER_RADIUS
    if (dist < interactionRadius) {
      const proximity = (interactionRadius - dist) / interactionRadius
      const layerStrength = p.layer === 'ambient' ? 0.85 + p.depth * 0.65 : 1.15
      const soft = proximity * proximity
      // Reduce home spring while pushed so particles can travel farther.
      const springEase = 1 - proximity * 0.75
      fx = (tx - p.x) * spring * assemblyPull * springEase
      fy = (ty - p.y) * spring * assemblyPull * springEase
      const force = (soft * 0.75 + proximity * 0.55) * POINTER_STRENGTH * layerStrength
      fx += (dx / dist) * force
      fy += (dy / dist) * force
      fx += (-dy / dist) * force * POINTER_SWIRL
      fy += (dx / dist) * force * POINTER_SWIRL
      fx += pointer.vx * proximity * POINTER_VELOCITY_INFLUENCE * layerStrength
      fy += pointer.vy * proximity * POINTER_VELOCITY_INFLUENCE * layerStrength
      const jitter = soft * POINTER_JITTER * layerStrength
      fx += Math.sin(time * 17.5 + p.seed * 3.1) * jitter
      fy += Math.cos(time * 15.2 + p.seed * 2.4) * jitter
    }
  }

  p.vx = (p.vx + fx) * DAMPING
  p.vy = (p.vy + fy) * DAMPING
  const speed = Math.hypot(p.vx, p.vy)
  const maxSpeed = p.layer === 'ambient' ? 24 : 20
  if (speed > maxSpeed) {
    p.vx = (p.vx / speed) * maxSpeed
    p.vy = (p.vy / speed) * maxSpeed
  }
  p.x += p.vx
  p.y += p.vy

  // Only clamp during assembly; after form, free damping interaction.
  if (p.layer === 'logo' && assembleProgress < 1) {
    const remainingX = p.x - tx
    const remainingY = p.y - ty
    const remainingDistance = Math.hypot(remainingX, remainingY) || 1
    const maxRemainingDistance = p.assemblyDistance * Math.pow(1 - assembleProgress, 1.6) + 6
    if (remainingDistance > maxRemainingDistance) {
      const clampRatio = maxRemainingDistance / remainingDistance
      p.x = tx + remainingX * clampRatio
      p.y = ty + remainingY * clampRatio
      p.vx *= 0.72
      p.vy *= 0.72
    }
  }
}

export function dampPointerVelocity(pointer: IntroPointerState): void {
  pointer.vx *= 0.9
  pointer.vy *= 0.9
}
