import type { Frame, VisualizerMode } from './types'

type Particle = { angle: number; radius: number; speed: number; size: number; band: number }

const BAR_COUNT = 64

/**
 * Canvas renderer for every visualiser mode. Holds the smoothing / peak / particle
 * state between frames so motion stays continuous across re-renders.
 */
export class Visualizer {
  private bands = new Float32Array(BAR_COUNT)
  private peaks = new Float32Array(BAR_COUNT)
  private particles: Particle[] = []
  private rotation = 0
  private time = 0

  constructor() {
    for (let i = 0; i < 90; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 0.25 + Math.random() * 0.7,
        speed: 0.0015 + Math.random() * 0.004,
        size: 1 + Math.random() * 2.5,
        band: Math.floor(Math.random() * BAR_COUNT),
      })
    }
  }

  /** Log-spaced buckets — linear FFT bins put almost everything in the first inch. */
  private computeBands(freq: Uint8Array): void {
    const usable = Math.floor(freq.length * 0.62)
    const min = 2
    const ratio = usable / min
    for (let i = 0; i < BAR_COUNT; i++) {
      const lo = Math.round(min * Math.pow(ratio, i / BAR_COUNT))
      const hi = Math.max(lo + 1, Math.round(min * Math.pow(ratio, (i + 1) / BAR_COUNT)))
      let sum = 0
      for (let b = lo; b < hi; b++) sum += freq[b]
      const value = sum / (hi - lo) / 255
      // Slight high-frequency lift so the right-hand side of the graph stays alive.
      const tilted = Math.min(1, value * (1 + (i / BAR_COUNT) * 0.9))
      this.bands[i] += (tilted - this.bands[i]) * 0.35
      this.peaks[i] = Math.max(this.peaks[i] - 0.006, this.bands[i])
    }
  }

  private bassEnergy(): number {
    let sum = 0
    for (let i = 0; i < 8; i++) sum += this.bands[i]
    return sum / 8
  }

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    mode: VisualizerMode,
    hue: number,
    frame: Frame,
  ): void {
    this.time += 1 / 60
    this.computeBands(frame.freq)

    ctx.clearRect(0, 0, width, height)
    const backdrop = ctx.createLinearGradient(0, 0, 0, height)
    backdrop.addColorStop(0, `hsl(${hue} 40% 6% / 0.9)`)
    backdrop.addColorStop(1, 'hsl(0 0% 4% / 0.95)')
    ctx.fillStyle = backdrop
    ctx.fillRect(0, 0, width, height)

    switch (mode) {
      case 'bars':
        this.drawBars(ctx, width, height, hue)
        break
      case 'wave':
        this.drawWave(ctx, width, height, hue, frame)
        break
      case 'radial':
        this.drawRadial(ctx, width, height, hue, frame)
        break
      case 'orbit':
        this.drawOrbit(ctx, width, height, hue, frame)
        break
    }
  }

  private drawBars(ctx: CanvasRenderingContext2D, width: number, height: number, hue: number): void {
    const gap = Math.max(1, width / BAR_COUNT / 6)
    const barWidth = (width - gap * (BAR_COUNT - 1)) / BAR_COUNT
    // The canvas can be laid out at a sliver of a pixel before the first resize
    // settles, which leaves no room for bars at all.
    if (barWidth <= 0) return
    const baseline = height * 0.78
    const maxHeight = baseline * 0.94

    ctx.save()
    ctx.shadowBlur = 22
    for (let i = 0; i < BAR_COUNT; i++) {
      const value = this.bands[i]
      const barHeight = Math.max(2, value * maxHeight)
      const x = i * (barWidth + gap)
      const shade = hue + (i / BAR_COUNT) * 70
      const gradient = ctx.createLinearGradient(0, baseline - barHeight, 0, baseline)
      gradient.addColorStop(0, `hsl(${shade} 100% 72%)`)
      gradient.addColorStop(1, `hsl(${shade + 20} 90% 45%)`)

      ctx.shadowColor = `hsl(${shade} 100% 55% / 0.75)`
      ctx.fillStyle = gradient
      roundRect(ctx, x, baseline - barHeight, barWidth, barHeight, Math.min(barWidth / 2, 4))
      ctx.fill()

      // Reflection below the baseline.
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.18
      const mirror = ctx.createLinearGradient(0, baseline, 0, baseline + barHeight * 0.5)
      mirror.addColorStop(0, `hsl(${shade} 100% 60%)`)
      mirror.addColorStop(1, 'transparent')
      ctx.fillStyle = mirror
      ctx.fillRect(x, baseline + 1, barWidth, barHeight * 0.5)
      ctx.globalAlpha = 1
      ctx.shadowBlur = 22

      // Peak cap.
      const peakY = baseline - Math.max(2, this.peaks[i] * maxHeight) - 3
      ctx.fillStyle = `hsl(${shade} 100% 88%)`
      ctx.fillRect(x, peakY, barWidth, 2)
    }
    ctx.restore()
  }

  private drawWave(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    hue: number,
    frame: Frame,
  ): void {
    const mid = height / 2
    const amplitude = height * 0.4 * (0.3 + frame.level * 2.4)
    const wave = frame.wave

    // Trigger on a rising zero crossing so the scope holds still instead of skating.
    const span = Math.min(wave.length, 1024)
    let start = 0
    for (let i = 1; i < wave.length - span; i++) {
      if (wave[i - 1] < 128 && wave[i] >= 128) {
        start = i
        break
      }
    }
    const points = Math.max(180, Math.round(width / 2))

    const trace = (offset: number, alpha: number, lineWidth: number, shade: number) => {
      ctx.beginPath()
      for (let p = 0; p <= points; p++) {
        const x = (p / points) * width
        const sample = (wave[start + Math.round((p / points) * (span - 1))] - 128) / 128
        const y = mid + sample * amplitude + offset
        if (p === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.globalAlpha = alpha
      ctx.lineWidth = lineWidth
      ctx.strokeStyle = `hsl(${shade} 100% 65%)`
      ctx.shadowColor = `hsl(${shade} 100% 55%)`
      ctx.shadowBlur = 24
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    ctx.save()
    ctx.lineJoin = 'round'
    trace(14, 0.25, 2, hue + 60)
    trace(-14, 0.25, 2, hue - 40)
    trace(0, 1, 3, hue)

    // Spectrum ribbon along the bottom edge for a sense of frequency content.
    ctx.shadowBlur = 0
    ctx.beginPath()
    ctx.moveTo(0, height)
    for (let i = 0; i < BAR_COUNT; i++) {
      const x = (i / (BAR_COUNT - 1)) * width
      ctx.lineTo(x, height - this.bands[i] * height * 0.3)
    }
    ctx.lineTo(width, height)
    ctx.closePath()
    const fill = ctx.createLinearGradient(0, height * 0.6, 0, height)
    fill.addColorStop(0, `hsl(${hue} 100% 60% / 0.35)`)
    fill.addColorStop(1, `hsl(${hue} 100% 60% / 0.02)`)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.restore()
  }

  private drawRadial(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    hue: number,
    frame: Frame,
  ): void {
    const cx = width / 2
    const cy = height / 2
    const bass = this.bassEnergy()
    const inner = Math.min(width, height) * (0.16 + bass * 0.05)
    const reach = Math.min(width, height) * 0.3
    this.rotation += 0.0025 + bass * 0.01

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(this.rotation)

    const spokes = BAR_COUNT * 2
    ctx.lineCap = 'round'
    ctx.shadowBlur = 18
    for (let i = 0; i < spokes; i++) {
      const band = i < BAR_COUNT ? i : spokes - 1 - i // mirrored for symmetry
      const value = this.bands[band]
      const angle = (i / spokes) * Math.PI * 2
      const length = 6 + value * reach
      const shade = hue + band * 1.6
      ctx.strokeStyle = `hsl(${shade} 100% ${52 + value * 30}%)`
      ctx.shadowColor = `hsl(${shade} 100% 55% / 0.8)`
      ctx.lineWidth = Math.max(1.5, (Math.PI * 2 * inner) / spokes - 2)
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
      ctx.lineTo(Math.cos(angle) * (inner + length), Math.sin(angle) * (inner + length))
      ctx.stroke()
    }
    ctx.restore()

    // Pulsing core.
    const pulse = inner * (0.82 + frame.level * 0.5)
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulse)
    glow.addColorStop(0, `hsl(${hue} 100% 80% / ${0.35 + bass * 0.4})`)
    glow.addColorStop(1, `hsl(${hue} 100% 50% / 0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `hsl(${hue} 100% 70% / 0.6)`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, inner - 4, 0, Math.PI * 2)
    ctx.stroke()
  }

  private drawOrbit(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    hue: number,
    frame: Frame,
  ): void {
    const cx = width / 2
    const cy = height / 2
    const scale = Math.min(width, height) * 0.46
    const bass = this.bassEnergy()

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const p of this.particles) {
      p.angle += p.speed * (1 + bass * 6)
      const energy = this.bands[p.band]
      const radius = scale * p.radius * (1 + energy * 0.45)
      const x = cx + Math.cos(p.angle) * radius
      const y = cy + Math.sin(p.angle) * radius * 0.62
      const size = p.size * (1 + energy * 3.2)
      const shade = hue + p.band * 1.4

      ctx.fillStyle = `hsl(${shade} 100% ${60 + energy * 30}% / ${0.25 + energy * 0.7})`
      ctx.shadowColor = `hsl(${shade} 100% 60%)`
      ctx.shadowBlur = 14
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }

    // Core blob whose radius follows the waveform.
    ctx.beginPath()
    const points = 120
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2
      const sample = (frame.wave[Math.floor((i / points) * frame.wave.length)] - 128) / 128
      const radius = scale * (0.18 + bass * 0.12) * (1 + sample * 0.55)
      const x = cx + Math.cos(angle) * radius
      const y = cy + Math.sin(angle) * radius
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.strokeStyle = `hsl(${hue} 100% 75% / 0.9)`
    ctx.lineWidth = 2
    ctx.shadowColor = `hsl(${hue} 100% 60%)`
    ctx.shadowBlur = 26
    ctx.stroke()
    ctx.fillStyle = `hsl(${hue} 100% 60% / 0.12)`
    ctx.fill()
    ctx.restore()
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}
