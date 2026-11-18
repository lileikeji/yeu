// Positions and displacements are fractions of the portrait's width and height.
const zodiacActs = {
  mouse: {
    duration: 3.8, accent: 'scent',
    joints: [[0.49, 0.38, 0.34, 0.30], [0.80, 0.77, 0.19, 0.20]],
    poses: [[0, 0, 0, 0, 0], [0.16, -0.07, 0.02, 0.01, -0.03], [0.31, 0.09, -0.025, -0.07, -0.04], [0.41, 0.065, 0.015, -0.045, 0], [0.50, 0.10, -0.02, -0.06, -0.04], [0.65, 0, 0, 0, 0], [1, 0, 0, 0, 0]]
  },
  ox: {
    duration: 4.6, accent: 'dust',
    joints: [[0.51, 0.28, 0.34, 0.26], [0.40, 0.85, 0.19, 0.16]],
    poses: [[0, 0, 0, 0, 0], [0.19, 0, 0.065, 0.07, -0.025], [0.28, 0, 0.085, -0.045, 0.025], [0.38, 0.015, 0.08, 0.045, -0.03], [0.51, 0, -0.09, 0, 0], [0.72, 0, 0, 0, 0], [1, 0, 0, 0, 0]]
  },
  tiger: {
    duration: 4.2, accent: 'paw',
    joints: [[0.79, 0.59, 0.21, 0.21], [0.47, 0.44, 0.34, 0.32]],
    poses: [[0, 0, 0, 0, 0], [0.21, -0.055, 0.04, -0.015, 0.035], [0.36, 0.095, -0.095, 0.055, -0.04], [0.53, 0.07, -0.07, 0.045, -0.02], [0.67, 0, 0, 0, 0], [1, 0, 0, 0, 0]]
  },
  rabbit: {
    duration: 3.9, accent: 'hop',
    joints: [[0.37, 0.20, 0.13, 0.23], [0.58, 0.19, 0.14, 0.23], [0.51, 0.60, 0.58, 0.57]],
    poses: [[0, 0, 0, 0, 0, 0, 0], [0.14, -0.08, 0.02, 0.055, 0.02, 0, 0.035], [0.29, 0.035, -0.02, -0.015, -0.035, 0, -0.125], [0.42, -0.035, 0.025, 0.05, 0.04, 0, 0.025], [0.55, 0, -0.025, -0.02, -0.035, 0, -0.073], [0.69, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0]]
  },
  dragon: {
    duration: 4.9, accent: 'pearl',
    joints: [[0.51, 0.55, 0.62, 0.61], [0.80, 0.74, 0.22, 0.22]],
    poses: [[0, 0, 0, 0, 0], [0.20, -0.06, -0.05, 0.02, 0.035], [0.38, -0.015, -0.12, 0.04, 0.03], [0.56, 0.075, -0.07, -0.07, -0.02], [0.73, 0.04, 0.01, -0.015, 0.035], [0.88, 0, 0, 0, 0], [1, 0, 0, 0, 0]]
  },
  snake: {
    duration: 4.4, accent: 'tongue',
    joints: [[0.47, 0.36, 0.33, 0.28], [0.29, 0.82, 0.22, 0.20], [0.61, 0.63, 0.26, 0.28]],
    poses: [[0, 0, 0, 0, 0, 0, 0], [0.17, -0.035, 0.01, 0.075, 0.018, -0.025, 0.025], [0.35, 0.07, -0.035, -0.06, -0.03, 0.04, -0.02], [0.48, 0.05, -0.035, 0.065, -0.04, 0.03, 0], [0.61, 0.055, -0.035, -0.04, -0.025, 0, 0], [0.78, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0]]
  },
  horse: {
    duration: 4.1, accent: 'hoof',
    joints: [[0.51, 0.79, 0.30, 0.26], [0.51, 0.41, 0.32, 0.28], [0.79, 0.56, 0.20, 0.19]],
    poses: [[0, 0, 0, 0, 0, 0, 0], [0.16, -0.045, 0.025, -0.04, 0.015, -0.035, 0], [0.27, 0.08, -0.08, 0.025, -0.075, 0.035, -0.04], [0.39, -0.075, 0.018, 0.045, 0.01, -0.04, 0.035], [0.50, 0.08, -0.08, 0.065, -0.075, 0.03, -0.035], [0.66, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0]]
  },
  goat: {
    duration: 5.1, accent: 'leaf',
    joints: [[0.51, 0.52, 0.25, 0.21], [0.37, 0.27, 0.20, 0.18], [0.68, 0.27, 0.20, 0.18]],
    poses: [[0, 0, 0, 0, 0, 0, 0], [0.21, -0.025, 0.06, -0.015, 0.02, 0.025, 0.015], [0.32, 0.03, -0.025, 0, 0, -0.01, -0.015], [0.42, -0.015, 0.045, 0.02, 0.025, 0.02, 0], [0.53, 0.025, -0.022, -0.015, -0.012, -0.015, -0.01], [0.65, 0, 0.035, 0, 0.015, 0.02, 0.01], [0.79, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0]]
  },
  monkey: {
    duration: 4.7, accent: 'banana',
    joints: [[0.70, 0.63, 0.20, 0.25], [0.84, 0.65, 0.18, 0.28], [0.48, 0.43, 0.30, 0.28]],
    poses: [[0, 0, 0, 0, 0, 0, 0], [0.22, -0.015, 0.045, 0.045, 0.02, -0.025, 0.01], [0.40, 0.075, -0.135, -0.05, -0.075, 0.04, -0.06], [0.53, 0.065, -0.09, -0.05, -0.035, 0.025, -0.035], [0.66, -0.035, -0.065, 0.035, 0.025, 0.02, 0.015], [0.85, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0]]
  },
  rooster: {
    duration: 4.8, accent: 'crow',
    joints: [[0.40, 0.36, 0.35, 0.34], [0.72, 0.64, 0.24, 0.21]],
    poses: [[0, 0, 0, 0, 0], [0.18, -0.065, 0.16, 0.035, -0.03], [0.29, -0.015, 0.035, 0.015, 0.005], [0.39, -0.065, 0.16, 0.03, -0.04], [0.55, 0.01, -0.11, 0.025, 0.02], [0.67, 0, -0.095, 0.035, -0.025], [0.82, 0, 0, 0, 0], [1, 0, 0, 0, 0]]
  },
  dog: {
    duration: 4.1, accent: 'heart',
    joints: [[0.46, 0.39, 0.38, 0.33], [0.76, 0.68, 0.18, 0.23], [0.68, 0.36, 0.18, 0.22]],
    poses: [[0, 0, 0, 0, 0, 0, 0], [0.21, -0.065, 0.05, 0.07, -0.04, 0.045, 0.055], [0.32, -0.065, 0.05, -0.06, 0.04, 0.045, 0.065], [0.43, -0.065, 0.035, 0.065, -0.04, 0.045, 0.045], [0.54, -0.05, 0.035, -0.06, 0.035, 0.025, 0.035], [0.65, -0.035, 0.01, 0.065, -0.025, 0.01, 0.015], [0.79, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0]]
  },
  pig: {
    duration: 4.5, accent: 'bubble',
    joints: [[0.50, 0.33, 0.22, 0.17], [0.49, 0.63, 0.35, 0.29]],
    poses: [[0, 0, 0, 0, 0], [0.18, -0.04, -0.05, 0.01, 0.025], [0.29, 0.04, -0.065, -0.025, 0.035], [0.39, 0.015, 0.035, 0, 0.03], [0.51, 0.025, -0.035, 0.025, -0.045], [0.62, 0.01, 0.025, -0.01, 0.02], [0.79, 0, 0, 0, 0], [1, 0, 0, 0, 0]]
  }
}

const zodiacCanvasSize = 96

function createZodiacRenderer() {
  const portraits = new Map()
  const staticMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const size = zodiacCanvasSize
  const source = document.createElement('canvas')
  source.width = source.height = size
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) return

  function prepare(key, img) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) return
    sourceContext.fillStyle = '#fdfcf8'
    sourceContext.fillRect(0, 0, size, size)
    sourceContext.drawImage(img, 0, 0, size, size)
    const pixels = sourceContext.getImageData(0, 0, size, size).data
    const frame = context.createImageData(size, size)
    const act = zodiacActs[key]
    const weights = act.joints.map(([x, y, radiusX, radiusY]) => {
      return Float32Array.from({ length: size * size }, (_, index) => {
        const u = (index % size / size - x) / radiusX
        const v = (Math.floor(index / size) / size - y) / radiusY
        const weight = Math.max(0, 1 - u * u - v * v)
        return weight * weight * (3 - 2 * weight)
      })
    })
    const portrait = { canvas, context, pixels, frame, act, weights }
    portraits.set(key, portrait)
    return portrait
  }

  function render(portrait, progress) {
    const { context, pixels, frame, act, weights } = portrait
    const next = act.poses.findIndex(pose => pose[0] > progress)
    const before = act.poses[next - 1]
    const after = act.poses[next]
    const t = (progress - before[0]) / (after[0] - before[0])
    const eased = t * t * (3 - 2 * t)
    const offsets = before.slice(1).map((value, index) => (value + (after[index + 1] - value) * eased) * size)
    const out = frame.data
    for (let i = 0; i < size * size; i++) {
      let x = i % size
      let y = Math.floor(i / size)
      for (let j = 0; j < weights.length; j++) {
        x -= weights[j][i] * offsets[j * 2]
        y -= weights[j][i] * offsets[j * 2 + 1]
      }
      x = Math.max(0, Math.min(size - 1.001, x))
      y = Math.max(0, Math.min(size - 1.001, y))
      const ix = Math.floor(x), iy = Math.floor(y)
      const a = (iy * size + ix) * 4, b = a + size * 4
      const fx = x - ix, fy = y - iy
      const dest = i * 4
      for (let channel = 0; channel < 3; channel++) {
        const top = pixels[a + channel] * (1 - fx) + pixels[a + 4 + channel] * fx
        const bottom = pixels[b + channel] * (1 - fx) + pixels[b + 4 + channel] * fx
        out[dest + channel] = top * (1 - fy) + bottom * fy
      }
      out[dest + 3] = 255
    }
    context.putImageData(frame, 0, 0)
    paintZodiacAccent(context, act.accent, progress)
  }

  let lastFrame = -Infinity
  let raf
  function tick(now) {
    raf = requestAnimationFrame(tick)
    if (now - lastFrame < 48) return
    lastFrame = now
    const rendered = new Set()
    for (const canvas of document.querySelectorAll('.zodiac-motion')) {
      if (!canvas.parentElement.offsetWidth) continue
      const key = canvas.dataset.zodiac
      const img = canvas.previousElementSibling.querySelector('img')
      if (!img.complete || !img.naturalWidth) continue
      const portrait = portraits.get(key) ?? prepare(key, img)
      const context = canvas.getContext('2d')
      if (!portrait || !context) continue
      if (!rendered.has(key)) {
        const phase = key.charCodeAt(0) / 19
        render(portrait, (now / 1000 / portrait.act.duration + phase) % 1)
        rendered.add(key)
      }
      context.drawImage(portrait.canvas, 0, 0)
      canvas.dataset.ready = ''
    }
  }
  function applyMotion() {
    cancelAnimationFrame(raf)
    if (!staticMotion.matches) raf = requestAnimationFrame(tick)
  }
  staticMotion.addEventListener('change', applyMotion)
  applyMotion()
}

function paintZodiacAccent(ctx, accent, progress) {
  const timing = {
    scent: [0.24, 0.62], dust: [0.20, 0.57], paw: [0.31, 0.58], hop: [0.38, 0.70],
    pearl: [0.16, 0.87], tongue: [0.29, 0.66], hoof: [0.22, 0.59], leaf: [0.19, 0.74],
    banana: [0.19, 0.72], crow: [0.51, 0.82], heart: [0.31, 0.75], bubble: [0.29, 0.76]
  }
  const [start, end] = timing[accent]
  if (progress < start || progress >= end) return
  const t = (progress - start) / (end - start)
  ctx.save()
  ctx.scale(zodiacCanvasSize / 100, zodiacCanvasSize / 100)
  ctx.globalAlpha = Math.min(1, t * 9, (1 - t) * 7)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  function oval(x, y, w, h, fill) {
    ctx.beginPath()
    ctx.ellipse(x, y, w, h, 0, 0, 2 * Math.PI)
    ctx.fillStyle = fill
    ctx.fill()
  }

  function stroke(color, width, path) {
    ctx.beginPath()
    path(ctx)
    ctx.lineWidth = width
    ctx.strokeStyle = color
    ctx.stroke()
  }

  switch (accent) {
    case 'scent':
      for (let i = 0; i < 2; i++) stroke('#55937e', 1.8, (p) => {
        const x = 66 + i * 7 + t * 3, y = 39 + i * 5 - t * 9
        p.moveTo(x, y + 7)
        p.quadraticCurveTo(x + 8, y + 3, x + 2, y)
      })
      break
    case 'dust':
    case 'hop':
    case 'hoof':
      for (let i = 0; i < 3; i++) oval(30 + i * 10 - t * 9, 83 - i * 2 - t * 6, 2 + i, 1.7 + i * 0.5, '#b99163')
      break
    case 'paw':
      oval(69, 44, 4.7, 4, '#e28e77')
      for (const [x, y] of [[62, 39], [67, 36], [73, 37], [77, 41]]) oval(x, y, 2.2, 2.2, '#e28e77')
      break
    case 'pearl': {
      const angle = 2 * Math.PI * t
      const x = 52 + 28 * Math.cos(angle), y = 49 + 21 * Math.sin(angle)
      oval(x, y, 5.7, 5.7, '#8da9cf')
      oval(x, y, 4.3, 4.3, '#d4ebff')
      oval(x - 1.5, y - 1.6, 1.5, 1.5, '#fff')
      break
    }
    case 'tongue': {
      const length = 6 + Math.sin(t * 5 * Math.PI) * 3
      stroke('#df6b85', 2.2, (p) => {
        p.moveTo(53, 44)
        p.quadraticCurveTo(59, 44, 53 + length, 47)
        p.lineTo(56 + length, 45)
        p.moveTo(53 + length, 47)
        p.lineTo(55 + length, 50)
      })
      break
    }
    case 'leaf': {
      const x = 61 - t * 8, y = 53 + Math.sin(t * 6 * Math.PI) * 2
      stroke('#55794c', 1.5, (p) => { p.moveTo(x - 5, y + 3); p.lineTo(x + 5, y - 4) })
      oval(x + 4, y - 3, 5 * (1 - t) + 1, 3 * (1 - t) + 1, '#83a45d')
      break
    }
    case 'banana': {
      const y = 51 - 29 * Math.sin(Math.PI * t)
      stroke('#997029', 5.6, (p) => { p.moveTo(65, y - 4); p.quadraticCurveTo(70, y + 8, 79, y - 1) })
      stroke('#f9c848', 3.7, (p) => { p.moveTo(65, y - 4); p.quadraticCurveTo(70, y + 8, 79, y - 1) })
      break
    }
    case 'crow':
      for (let i = 0; i < 3; i++) stroke('#c48042', 2, (p) => {
        p.moveTo(57 + i * 3, 37 + i * 5)
        p.lineTo(62 + i * 5, 30 + i * 7)
      })
      break
    case 'heart':
      ctx.fillStyle = '#d78089'
      ctx.beginPath()
      ctx.moveTo(72, 35 - t * 11)
      ctx.bezierCurveTo(55, 28 - t * 11, 67, 20 - t * 11, 72, 27 - t * 11)
      ctx.bezierCurveTo(78, 20 - t * 11, 89, 28 - t * 11, 72, 35 - t * 11)
      ctx.fill()
      break
    case 'bubble':
      for (let i = 0; i < 3; i++) {
        const x = 56 + t * 16 + i * 6, y = 40 - t * (12 + i * 5)
        const radius = (2 + i * 0.8) * (0.6 + t)
        oval(x, y, radius, radius, '#83b7bb')
        oval(x - 0.5, y - 0.5, radius * 0.65, radius * 0.65, '#e0f4f2')
      }
      break
  }
  ctx.restore()
}
