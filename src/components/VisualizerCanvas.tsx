import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { AudioEngine, Visualizer } from 'neiro-visualizer'
import type { Frame, VisualizerMode } from 'neiro-visualizer'

type Props = {
  engineRef: RefObject<AudioEngine | null>
  mode: VisualizerMode
  hue: number
  active: boolean
}

/** Stand-in data so the canvas still breathes before any audio is loaded. */
function idleFrame(frame: Frame, t: number): Frame {
  for (let i = 0; i < frame.freq.length; i++) {
    const fall = Math.exp(-i / 90)
    const sway = 0.5 + 0.5 * Math.sin(t * 1.6 + i * 0.06)
    frame.freq[i] = Math.round(70 * fall * sway)
  }
  for (let i = 0; i < frame.wave.length; i++) {
    const x = i / frame.wave.length
    frame.wave[i] = 128 + Math.sin(x * Math.PI * 4 + t * 1.4) * 16 * Math.sin(t * 0.7 + x * 3)
  }
  frame.level = 0.05
  frame.active = false
  return frame
}

export function VisualizerCanvas({ engineRef, mode, hue, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({ mode, hue, active })
  stateRef.current = { mode, hue, active }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const visualizer = new Visualizer()
    const idle: Frame = {
      freq: new Uint8Array(1024),
      wave: new Uint8Array(2048).fill(128),
      level: 0,
      active: false,
    }

    let raf = 0
    let width = 0
    let height = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const start = performance.now()
    const render = (now: number) => {
      raf = requestAnimationFrame(render)
      const engine = engineRef.current
      const { mode: m, hue: h, active: playing } = stateRef.current
      let frame: Frame
      if (engine && playing) {
        const level = engine.sample()
        frame = { freq: engine.freq, wave: engine.wave, level, active: true }
      } else {
        frame = idleFrame(idle, (now - start) / 1000)
      }
      visualizer.draw(ctx, width, height, m, h, frame)
    }
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [engineRef])

  return <canvas ref={canvasRef} className="block h-full w-full" />
}
