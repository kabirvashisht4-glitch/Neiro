export const EQ_BANDS = [60, 250, 1000, 4000, 12000] as const

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0],
  Bass: [7, 4, 0, -1, -2],
  Vocal: [-3, 0, 4, 3, 0],
  Treble: [-2, -1, 0, 4, 7],
  Lounge: [4, 1, -2, 1, 4],
}

/**
 * Graph:  <audio> -> [5-band EQ] -> analyser -> output gain -> destination
 *         microphone ------------> analyser
 *
 * The analyser sits before the output gain so the microphone can be visualised
 * with the speakers muted (no feedback loop), and so the bars react to the EQ.
 */
export class AudioEngine {
  readonly ctx: AudioContext
  readonly analyser: AnalyserNode
  readonly filters: BiquadFilterNode[]
  readonly output: GainNode
  readonly freq: Uint8Array<ArrayBuffer>
  readonly wave: Uint8Array<ArrayBuffer>

  private element: MediaElementAudioSourceNode | null = null
  private mic: MediaStreamAudioSourceNode | null = null
  private micStream: MediaStream | null = null
  private volume = 1

  constructor() {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctor()

    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.78
    this.freq = new Uint8Array(this.analyser.frequencyBinCount)
    this.wave = new Uint8Array(this.analyser.fftSize)

    this.output = this.ctx.createGain()
    this.output.gain.value = this.volume

    this.filters = EQ_BANDS.map((frequency, i) => {
      const filter = this.ctx.createBiquadFilter()
      filter.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      filter.frequency.value = frequency
      filter.Q.value = 1
      filter.gain.value = 0
      return filter
    })

    for (let i = 0; i < this.filters.length - 1; i++) this.filters[i].connect(this.filters[i + 1])
    this.filters[this.filters.length - 1].connect(this.analyser)
    this.analyser.connect(this.output)
    this.output.connect(this.ctx.destination)
  }

  /** Safe to call repeatedly — an element may only be wired into the graph once. */
  attach(element: HTMLAudioElement): void {
    if (this.element) return
    this.element = this.ctx.createMediaElementSource(element)
    this.element.connect(this.filters[0])
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  setVolume(value: number): void {
    this.volume = value
    if (!this.mic) this.output.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01)
  }

  setEq(index: number, gainDb: number): void {
    const filter = this.filters[index]
    if (filter) filter.gain.setTargetAtTime(gainDb, this.ctx.currentTime, 0.01)
  }

  setEqAll(gains: number[]): void {
    gains.forEach((gain, i) => this.setEq(i, gain))
  }

  async enableMic(): Promise<void> {
    if (this.mic) return
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    this.micStream = stream
    this.mic = this.ctx.createMediaStreamSource(stream)
    this.mic.connect(this.analyser)
    this.output.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01) // never route the mic to the speakers
  }

  disableMic(): void {
    this.mic?.disconnect()
    this.micStream?.getTracks().forEach((track) => track.stop())
    this.mic = null
    this.micStream = null
    this.output.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01)
  }

  get micActive(): boolean {
    return this.mic !== null
  }

  /** Reads the analyser once per frame; returns the RMS level of the waveform. */
  sample(): number {
    this.analyser.getByteFrequencyData(this.freq)
    this.analyser.getByteTimeDomainData(this.wave)
    let sum = 0
    for (let i = 0; i < this.wave.length; i++) {
      const v = (this.wave[i] - 128) / 128
      sum += v * v
    }
    return Math.sqrt(sum / this.wave.length)
  }

  dispose(): void {
    this.disableMic()
    void this.ctx.close()
  }
}
