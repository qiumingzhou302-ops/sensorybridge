/**
 * WAV 录音工具 — 用 AudioContext 直接采集 PCM 数据并编码为 WAV
 * 不依赖 MediaRecorder，生成的 WAV 格式阿里云百炼 Paraformer 完全支持
 * 兼容所有现代浏览器（Chrome、Edge、Firefox、Safari）
 */

export class WavRecorder {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private leftChannel: Float32Array[] = []
  private recordingLength = 0
  private sampleRate = 44100
  private isRecording = false

  /** 开始录音 */
  async start(): Promise<void> {
    if (this.isRecording) return

    // 请求麦克风权限
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    })

    // 创建 AudioContext（采样率设为 16kHz，足够语音识别用，文件更小）
    this.audioContext = new AudioContext({ sampleRate: 16000 })
    this.sampleRate = this.audioContext.sampleRate

    this.source = this.audioContext.createMediaStreamSource(this.mediaStream)

    // 用 ScriptProcessorNode 采集 PCM 数据（bufferSize 越大延迟越高，4096 是平衡点）
    const bufferSize = 4096
    this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1)

    this.leftChannel = []
    this.recordingLength = 0
    this.isRecording = true

    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return
      const input = e.inputBuffer.getChannelData(0)
      // 复制数据（Float32Array 是引用，必须拷贝）
      this.leftChannel.push(new Float32Array(input))
      this.recordingLength += input.length
    }

    this.source.connect(this.processor)
    this.processor.connect(this.audioContext.destination)
  }

  /** 停止录音并返回 WAV Blob */
  async stop(): Promise<Blob> {
    if (!this.isRecording) {
      throw new Error('未在录音中')
    }

    this.isRecording = false

    // 断开连接
    this.processor?.disconnect()
    this.source?.disconnect()
    this.mediaStream?.getTracks().forEach((t) => t.stop())

    // 合并所有 PCM 数据
    const samples = this.mergeBuffers(this.leftChannel, this.recordingLength)

    // 关闭 AudioContext
    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    // 编码为 WAV
    const wavBlob = this.encodeWav(samples, this.sampleRate)

    this.leftChannel = []
    this.recordingLength = 0

    return wavBlob
  }

  /** 合并多个 Float32Array */
  private mergeBuffers(channelBuffer: Float32Array[], length: number): Float32Array {
    const result = new Float32Array(length)
    let offset = 0
    for (const buffer of channelBuffer) {
      result.set(buffer, offset)
      offset += buffer.length
    }
    return result
  }

  /** 将 PCM Float32 数据编码为 WAV Blob（16-bit PCM 单声道） */
  private encodeWav(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)

    // WAV 文件头
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i))
      }
    }

    // RIFF header
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeString(8, 'WAVE')

    // fmt chunk
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true) // chunk size
    view.setUint16(20, 1, true) // audio format (PCM)
    view.setUint16(22, 1, true) // num channels (mono)
    view.setUint32(24, sampleRate, true) // sample rate
    view.setUint32(28, sampleRate * 2, true) // byte rate
    view.setUint16(32, 2, true) // block align
    view.setUint16(34, 16, true) // bits per sample

    // data chunk
    writeString(36, 'data')
    view.setUint32(40, samples.length * 2, true)

    // 写入 PCM 样本（Float32 → Int16）
    let offset = 44
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }

    return new Blob([view], { type: 'audio/wav' })
  }

  /** 是否正在录音 */
  get recording(): boolean {
    return this.isRecording
  }
}
