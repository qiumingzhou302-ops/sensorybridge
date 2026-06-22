import { useState, useRef, useCallback, useEffect } from 'react'
import { useAccessibility } from '../contexts/AccessibilityContext'
import { generateSubtitles, type SubtitleEntry } from '../lib/api'

/**
 * 听障创作模块 — 音频波形可视化 + 节奏脉冲 + 智能字幕对齐
 * 用可视化图形替代音频，让听障用户"看见"声音
 */

export default function HearingImpairedPage() {
  const { settings } = useAccessibility()
  const [audioUrl, setAudioUrl] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [waveformType, setWaveformType] = useState<'wave' | 'spectrum' | 'pulse'>('wave')
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')

  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animationRef = useRef<number>(0)
  const beatTimesRef = useRef<number[]>([])

  /**
   * 处理音频上传
   * 上传成功后立即开始生成智能字幕（异步），同时自动播放音频
   * 字幕生成期间不影响波形/频谱展示
   */
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAudioUrl(URL.createObjectURL(file))
    setSubtitles([])
    setCurrentTime(0)
    setError('')
    setIsAnalyzing(true) // 立即进入"正在生成字幕"状态

    // 异步生成字幕（不阻塞 UI，波形/频谱照常显示）
    try {
      const arrayBuffer = await file.arrayBuffer()
      const audioBase64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      )

      const result = await generateSubtitles({
        audioBase64,
        fileName: file.name,
      })

      if (result.success && result.subtitles) {
        setSubtitles(result.subtitles)
      } else {
        setError(result.error || '字幕生成失败')
      }
    } catch (err) {
      setError('音频处理失败，请重试')
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  /** 初始化 Web Audio API 分析器 */
  const initAudioAnalyser = useCallback(() => {
    if (!audioRef.current || audioContextRef.current) return

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioCtx()
    audioContextRef.current = ctx

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8
    analyserRef.current = analyser

    const source = ctx.createMediaElementSource(audioRef.current)
    sourceRef.current = source
    source.connect(analyser)
    analyser.connect(ctx.destination)
  }, [])

  /** 绘制波形图 */
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(dataArray)

      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, width, height)

      // 绘制网格线
      ctx.strokeStyle = '#2a2a4a'
      ctx.lineWidth = 1
      for (let i = 0; i < 10; i++) {
        const x = (width / 10) * i
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }

      // 绘制中线
      ctx.strokeStyle = '#3a3a5a'
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()

      // 绘制波形
      ctx.lineWidth = 2
      ctx.strokeStyle = '#4F46E5'
      ctx.beginPath()
      const sliceWidth = width / bufferLength
      let x = 0
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0
        const y = (v * height) / 2
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
        x += sliceWidth
      }
      ctx.lineTo(width, height / 2)
      ctx.stroke()

      // 绘制播放进度线
      if (audioRef.current) {
        const progressX = (audioRef.current.currentTime / audioRef.current.duration) * width
        ctx.strokeStyle = '#F59E0B'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(progressX, 0)
        ctx.lineTo(progressX, height)
        ctx.stroke()
      }
    }
    draw()
  }, [])

  /** 绘制频谱图 */
  const drawSpectrum = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, width, height)

      const barWidth = width / bufferLength * 2.5
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.8
        // 频率映射颜色：低频红、中频绿、高频蓝
        const hue = (i / bufferLength) * 240
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`
        ctx.fillRect(x, height - barHeight, barWidth, barHeight)
        x += barWidth
      }

      // 播放进度线
      if (audioRef.current && audioRef.current.duration) {
        const progressX = (audioRef.current.currentTime / audioRef.current.duration) * width
        ctx.strokeStyle = '#F59E0B'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(progressX, 0)
        ctx.lineTo(progressX, height)
        ctx.stroke()
      }
    }
    draw()
  }, [])

  /** 绘制节奏脉冲图 */
  const drawPulse = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    let lastBeatTime = 0
    const beatThreshold = 180

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, width, height)

      // 计算低频能量（用于节拍检测）
      let bassEnergy = 0
      for (let i = 0; i < 10; i++) {
        bassEnergy += dataArray[i]
      }
      bassEnergy /= 10

      const now = audioRef.current?.currentTime || 0

      // 节拍检测
      if (bassEnergy > beatThreshold && now - lastBeatTime > 0.3) {
        beatTimesRef.current.push(now)
        lastBeatTime = now
      }

      // 绘制已检测到的节拍点
      const beatRadius = 8
      beatTimesRef.current.forEach((beatTime) => {
        if (!audioRef.current?.duration) return
        const x = (beatTime / audioRef.current.duration) * width
        const opacity = 1 - (now - beatTime) / 3
        if (opacity > 0) {
          // 脉冲圆点
          ctx.fillStyle = `rgba(245, 158, 11, ${opacity})`
          ctx.beginPath()
          ctx.arc(x, height / 2, beatRadius + (1 - opacity) * 20, 0, Math.PI * 2)
          ctx.fill()

          // 中心点
          ctx.fillStyle = '#F59E0B'
          ctx.beginPath()
          ctx.arc(x, height / 2, beatRadius, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      // 绘制时间轴
      ctx.strokeStyle = '#3a3a5a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()

      // 绘制播放进度
      if (audioRef.current && audioRef.current.duration) {
        const progressX = (audioRef.current.currentTime / audioRef.current.duration) * width
        ctx.strokeStyle = '#4F46E5'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(progressX, 0)
        ctx.lineTo(progressX, height)
        ctx.stroke()
      }
    }
    draw()
  }, [])

  /** 切换可视化类型 */
  useEffect(() => {
    cancelAnimationFrame(animationRef.current)
    if (!isPlaying) return
    if (waveformType === 'wave') drawWaveform()
    else if (waveformType === 'spectrum') drawSpectrum()
    else drawPulse()
  }, [waveformType, isPlaying, drawWaveform, drawSpectrum, drawPulse])

  /** 播放/暂停 */
  const togglePlay = () => {
    if (!audioRef.current) return
    if (!audioContextRef.current) initAudioAnalyser()
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume()
    }
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
  }

  /** 格式化时间 */
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  /** 获取当前字幕 */
  const currentSubtitle = subtitles.find(
    (s) => currentTime >= s.start && currentTime < s.end
  )

  /**
   * 逐字高亮渲染
   * 阿里云 Paraformer 返回的是句子级时间戳（无逐字时间戳），
   * 这里在句子时间范围内按字数均匀分配每个字的显示时间，
   * 播放到哪个字，那个字标蓝色，已读字浅色，未读字白色。
   */
  const renderKaraokeText = (sub: SubtitleEntry, now: number) => {
    const text = sub.text
    const charCount = text.length
    if (charCount === 0) return null

    const duration = sub.end - sub.start
    // 当前播放到的字符索引（匀速分配）
    const progress = Math.max(0, Math.min(1, (now - sub.start) / duration))
    const currentCharIdx = Math.floor(progress * charCount)

    return (
      <span>
        {text.split('').map((char, idx) => {
          let colorClass = 'text-white/40' // 未读：暗白色
          if (idx < currentCharIdx) {
            colorClass = 'text-white/70' // 已读：亮白色
          } else if (idx === currentCharIdx) {
            colorClass = 'text-blue-400 font-bold' // 当前字：蓝色加粗
          }
          return (
            <span key={idx} className={colorClass}>
              {char}
            </span>
          )
        })}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">听障创作工作台</h1>
      <p className="text-gray-600">
        通过音频波形可视化、频谱图和节奏脉冲，"看见"声音的节奏与韵律。
      </p>

      {/* 音频上传区 */}
      {!audioUrl && (
        <section
          className="border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center"
          aria-labelledby="upload-heading"
        >
          <h2 id="upload-heading" className="text-xl font-medium text-gray-700 mb-4">
            上传音频或视频文件
          </h2>
          <p className="text-gray-500 mb-6">支持 M4A、MP3、WAV、AAC、FLAC、MP4 等格式</p>
          <label
            htmlFor="audio-upload"
            className="touch-target inline-flex items-center px-8 py-4 bg-primary text-white rounded-xl font-medium hover:bg-primary-dark cursor-pointer transition-colors"
          >
            <span aria-hidden="true">📁</span>
            <span className="ml-2">选择文件</span>
          </label>
          <input
            id="audio-upload"
            type="file"
            accept="audio/*,video/*,.m4a,.mp3,.wav,.aac,.flac,.ogg,.mp4,.mov,.webm"
            onChange={handleFileUpload}
            className="sr-only"
          />
        </section>
      )}

      {/* 音频可视化区 */}
      {audioUrl && (
        <>
          {/* 隐藏的 audio 元素 */}
          <audio
            ref={audioRef}
            src={audioUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration)
              // 上传成功后自动播放
              initAudioAnalyser()
              if (audioContextRef.current?.state === 'suspended') {
                audioContextRef.current.resume()
              }
              // 自动播放可能被浏览器策略阻止，捕获错误不影响后续使用
              e.currentTarget.play().catch(() => {
                console.warn('浏览器阻止了自动播放，请手动点击播放按钮')
              })
            }}
            className="hidden"
          />

          {/* 可视化类型切换 */}
          <section aria-labelledby="viz-heading">
            <h2 id="viz-heading" className="sr-only">音频可视化</h2>
            <div className="flex gap-2 mb-4" role="tablist" aria-label="可视化类型">
              {[
                { key: 'wave', label: '波形图', icon: '〰️' },
                { key: 'spectrum', label: '频谱图', icon: '🌈' },
                { key: 'pulse', label: '节奏脉冲', icon: '💓' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={waveformType === tab.key}
                  onClick={() => setWaveformType(tab.key as any)}
                  className={`touch-target px-6 py-3 rounded-xl font-medium transition-colors ${
                    waveformType === tab.key
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  <span className="ml-1">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Canvas 可视化 */}
            <div className="bg-gray-900 rounded-2xl overflow-hidden">
              <canvas
                ref={canvasRef}
                width={800}
                height={200}
                className="w-full"
                role="img"
                aria-label={`音频${waveformType === 'wave' ? '波形' : waveformType === 'spectrum' ? '频谱' : '节奏脉冲'}可视化图，当前时间 ${formatTime(currentTime)}`}
              />
            </div>
          </section>

          {/* 播放控制 */}
          <section aria-labelledby="playback-heading" className="flex items-center gap-4">
            <h2 id="playback-heading" className="sr-only">播放控制</h2>
            <button
              onClick={togglePlay}
              className="touch-target w-16 h-16 rounded-full bg-primary text-white text-2xl flex items-center justify-center hover:bg-primary-dark transition-colors"
              aria-label={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? '⏸️' : '▶️'}
            </button>
            <div className="flex-1">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={(e) => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = parseFloat(e.target.value)
                    setCurrentTime(parseFloat(e.target.value))
                  }
                }}
                className="w-full"
                aria-label="进度条"
              />
            </div>
          </section>

          {/* 当前字幕显示 — 逐字高亮，播放到哪个字那个字标蓝色 */}
          {settings.subtitleEnabled && currentSubtitle && (
            <div
              role="status"
              aria-live="polite"
              className="bg-gray-900 rounded-xl p-6 text-center text-2xl leading-relaxed"
            >
              {renderKaraokeText(currentSubtitle, currentTime)}
            </div>
          )}

          {/* 字幕未生成时，在播放区下方显示生成状态（不影响波形/频谱） */}
          {settings.subtitleEnabled && !currentSubtitle && audioUrl && (
            <div
              role="status"
              aria-live="polite"
              className="bg-gray-100 text-gray-500 rounded-xl p-6 text-center text-lg"
            >
              {isAnalyzing ? (
                <>
                  <span
                    className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2 align-middle"
                    aria-hidden="true"
                  ></span>
                  <span className="align-middle">正在生成字幕...</span>
                </>
              ) : subtitles.length === 0 && !error ? (
                '当前时间点暂无字幕'
              ) : null}
            </div>
          )}

          {/* 字幕显示区
              - 字幕生成中：显示"正在生成字幕..."，不影响波形/频谱展示
              - 字幕生成完成：显示字幕列表，当前播放字幕文字用颜色高亮标记 */}
          <section aria-labelledby="subtitle-heading" className="space-y-4">
            <h2 id="subtitle-heading" className="text-xl font-semibold text-gray-800">
              智能字幕
            </h2>

            {/* 字幕生成中 */}
            {isAnalyzing && (
              <div
                role="status"
                aria-live="polite"
                className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-6 text-center"
              >
                <span
                  className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2 align-middle"
                  aria-hidden="true"
                ></span>
                <span className="align-middle">正在生成字幕...</span>
              </div>
            )}

            {/* 字幕生成失败 */}
            {!isAnalyzing && error && subtitles.length === 0 && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-center"
              >
                {error}
              </div>
            )}

            {/* 字幕列表 — 当前播放的字幕文字用蓝色加粗高亮 */}
            {!isAnalyzing && subtitles.length > 0 && (
              <div className="space-y-2">
                {subtitles.map((sub, idx) => {
                  const isCurrent =
                    currentTime >= sub.start && currentTime < sub.end
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-4 p-4 rounded-lg transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-blue-50 border-2 border-blue-400 shadow-sm'
                          : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        if (audioRef.current) {
                          audioRef.current.currentTime = sub.start
                        }
                      }}
                    >
                      <span className="text-sm text-gray-500 font-mono w-20 shrink-0">
                        {formatTime(sub.start)}
                      </span>
                      <span
                        className={`flex-1 transition-colors ${
                          isCurrent
                            ? 'text-gray-900 font-medium'
                            : 'text-gray-700'
                        }`}
                      >
                        {sub.text}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 重新上传 */}
          <button
            onClick={() => {
              setAudioUrl('')
              setSubtitles([])
              setError('')
              setIsAnalyzing(false)
              cancelAnimationFrame(animationRef.current)
            }}
            className="touch-target px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            重新上传
          </button>
        </>
      )}
    </div>
  )
}
