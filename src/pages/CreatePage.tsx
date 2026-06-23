import { useState, useRef, useCallback, useEffect } from 'react'
import { useAccessibility } from '../contexts/AccessibilityContext'
import {
  speak,
  stopSpeaking,
  isSpeechSynthesisSupported,
} from '../lib/speech'
import { generateImage, describeImage, parseCommand, generateSubtitles } from '../lib/api'
import { WavRecorder } from '../lib/wav-recorder'

type CreationStep = 'input' | 'generating' | 'result' | 'describing' | 'modifying'

interface Artwork {
  url: string
  prompt: string
  description?: string
}

export default function CreatePage() {
  const { settings } = useAccessibility()
  const [step, setStep] = useState<CreationStep>('input')
  const [prompt, setPrompt] = useState('')
  const [artwork, setArtwork] = useState<Artwork | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [transcript, setTranscript] = useState('') // 实时识别文字
  const [isRecognizing, setIsRecognizing] = useState(false)

  const wavRecorderRef = useRef<WavRecorder | null>(null)
  const ttsSupported = isSpeechSynthesisSupported()

  /** 语音播报 + 字幕同步 */
  const announce = useCallback(
    (text: string) => {
      setSubtitle(text)
      if (settings.voiceEnabled && ttsSupported) {
        setIsSpeaking(true)
        speak(text, {
          rate: settings.speechRate,
          onEnd: () => setIsSpeaking(false),
        })
      }
    },
    [settings.voiceEnabled, settings.speechRate, ttsSupported]
  )

  /** 开始录音 */
  const startRecording = useCallback(async () => {
    setError('')
    setTranscript('')

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('当前浏览器不支持录音功能，请使用 Chrome、Edge 或 Firefox 浏览器')
      announce('当前浏览器不支持录音功能')
      return
    }

    try {
      const recorder = new WavRecorder()
      wavRecorderRef.current = recorder
      await recorder.start()

      setIsRecording(true)
      announce('正在录音，请说出您的创意。再次点击按钮停止录音')
    } catch (err: any) {
      const errName = err?.name || ''
      const errMsg = err?.message || ''

      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setError('麦克风权限被拒绝。请在浏览器地址栏左侧点击锁形图标，将麦克风权限改为"允许"，然后刷新页面重试')
      } else if (errName === 'NotFoundError') {
        setError('未检测到麦克风设备，请检查麦克风是否已连接')
      } else if (errName === 'NotReadableError') {
        setError('麦克风被其他程序占用，请关闭其他使用麦克风的程序后重试')
      } else if (errName === 'SecurityError') {
        setError('安全限制：需要通过 HTTPS 访问页面才能使用麦克风')
      } else {
        setError(`麦克风访问失败：${errName || errMsg || '未知错误'}。请刷新页面重试`)
      }
      announce('麦克风访问失败，请检查权限设置')
    }
  }, [announce])

  /** 停止录音并识别 */
  const stopRecording = useCallback(async () => {
    const recorder = wavRecorderRef.current
    if (!recorder || !recorder.recording) {
      setIsRecording(false)
      return
    }

    setIsRecording(false)
    setIsRecognizing(true)

    try {
      const wavBlob = await recorder.stop()

      if (wavBlob.size === 0) {
        setError('录音为空，请重试')
        setIsRecognizing(false)
        return
      }

      announce('正在识别语音...')

      const arrayBuffer = await wavBlob.arrayBuffer()
      const audioBase64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      )

      const result = await generateSubtitles({
        audioBase64,
        fileName: 'voice-input.wav',
      })

      if (result.success && result.subtitles && result.subtitles.length > 0) {
        const text = result.subtitles.map((s) => s.text).join('')
        setTranscript(text)
        setPrompt(text)
        announce(`识别结果：${text}。确认生成请说"确认"，重新说请说"重试"`)
      } else {
        setError(result.error || '未识别到语音内容，请重试')
        announce('未识别到语音内容，请重试')
      }
    } catch (err) {
      console.error('语音识别失败:', err)
      setError('语音识别失败，请重试')
      announce('语音识别失败，请重试')
    } finally {
      setIsRecognizing(false)
    }
  }, [announce])

  /** 生成图片 */
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      announce('请先说出您的创意描述')
      return
    }

    setStep('generating')
    announce('正在为您创作图片，请稍候...')

    const result = await generateImage({ prompt: prompt.trim() })

    if (!result.success || !result.imageUrl) {
      setError(result.error || '生成失败')
      announce(`生成失败：${result.error || '请重试'}`)
      setStep('input')
      return
    }

    setArtwork({ url: result.imageUrl, prompt: prompt.trim() })
    setStep('result')
    announce('图片已生成。要听画面描述，请点击描述按钮')
  }

  /** 听觉画面解析 */
  const handleDescribe = async () => {
    if (!artwork) return

    setStep('describing')
    announce('正在解析画面内容...')

    const result = await describeImage({
      imageUrl: artwork.url,
      detailLevel: 'comprehensive',
    })

    if (!result.success || !result.description) {
      announce(`解析失败：${result.error || '请重试'}`)
      setStep('result')
      return
    }

    setArtwork({ ...artwork, description: result.description })
    announce(result.description)
    setStep('result')
  }

  /** 语音指令修改 */
  const handleModify = async (command: string) => {
    if (!artwork) return

    setStep('modifying')
    announce('正在理解您的修改指令...')

    const parseResult = await parseCommand({
      command,
      currentPrompt: artwork.prompt,
    })

    if (!parseResult.success || !parseResult.newPrompt) {
      announce(`指令理解失败：${parseResult.error || '请重试'}`)
      setStep('result')
      return
    }

    announce('正在根据您的要求修改画面...')
    const genResult = await generateImage({ prompt: parseResult.newPrompt })

    if (!genResult.success || !genResult.imageUrl) {
      announce('修改失败，请重试')
      setStep('result')
      return
    }

    setArtwork({ url: genResult.imageUrl, prompt: parseResult.newPrompt })
    setStep('result')
    announce('画面已修改。要听新画面描述，请点击描述按钮')
  }

  /** 停止播报 */
  const handleStopSpeaking = () => {
    stopSpeaking()
    setIsSpeaking(false)
  }

  useEffect(() => {
    return () => {
      const recorder = wavRecorderRef.current
      if (recorder && recorder.recording) {
        recorder.stop().catch(() => {})
      }
      stopSpeaking()
    }
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">创作工作台</h1>

      {/* 字幕显示区（听障用户） */}
      {settings.subtitleEnabled && subtitle && (
        <div
          role="status"
          aria-live="polite"
          className="bg-gray-900 text-white rounded-lg p-4 text-center text-lg"
        >
          {subtitle}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
          {error}
        </div>
      )}

      {/* 步骤 1：语音输入 */}
      {step === 'input' && (
        <section aria-labelledby="input-heading" className="space-y-6">
          <h2 id="input-heading" className="text-xl font-semibold text-gray-700">
            说出您的创意
          </h2>

          {/* 录音按钮 */}
          <div className="flex flex-col items-center gap-6 py-8">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isRecognizing}
              className={`touch-target w-32 h-32 rounded-full flex items-center justify-center text-5xl transition-all ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : isRecognizing
                  ? 'bg-gray-400 text-white cursor-wait'
                  : 'bg-primary text-white hover:bg-primary-dark shadow-lg hover:shadow-xl'
              }`}
              aria-label={isRecording ? '停止录音' : '开始录音，说出您的创意'}
              aria-pressed={isRecording}
            >
              {isRecording ? '⏹️' : isRecognizing ? '⏳' : '🎤'}
            </button>
            <p className="text-gray-500 text-center">
              {isRecording
                ? '正在录音... 再次点击按钮停止'
                : isRecognizing
                ? '正在识别语音...'
                : '点击按钮，说出您想画的画面'}
            </p>
          </div>

          {/* 识别到的文字 */}
          {(prompt || transcript) && (
            <div className="bg-gray-50 rounded-xl p-6 space-y-4">
              <label htmlFor="prompt-text" className="block text-sm font-medium text-gray-700">
                您的创意描述：
              </label>
              <textarea
                id="prompt-text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-lg"
                rows={3}
                aria-describedby="prompt-help"
              />
              <p id="prompt-help" className="text-sm text-gray-500">
                您可以编辑文字描述，或直接点击生成
              </p>
              <button
                onClick={handleGenerate}
                className="touch-target px-8 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-dark transition-colors"
                aria-label="生成图片"
              >
                生成图片
              </button>
            </div>
          )}
        </section>
      )}

      {/* 步骤 2：生成中 */}
      {(step === 'generating' || step === 'modifying') && (
        <section aria-live="polite" className="flex flex-col items-center gap-6 py-16">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <p className="text-lg text-gray-600">
            {step === 'modifying' ? '正在修改画面...' : '正在为您创作图片...'}
          </p>
        </section>
      )}

      {/* 步骤 3：解析中 */}
      {step === 'describing' && (
        <section aria-live="polite" className="flex flex-col items-center gap-6 py-16">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <p className="text-lg text-gray-600">正在解析画面内容...</p>
        </section>
      )}

      {/* 步骤 4：结果展示 */}
      {step === 'result' && artwork && (
        <section aria-labelledby="result-heading" className="space-y-6">
          <h2 id="result-heading" className="text-xl font-semibold text-gray-700">
            创作结果
          </h2>

          {/* 图片展示 */}
          <figure className="rounded-xl overflow-hidden shadow-lg">
            <img
              src={artwork.url}
              alt={artwork.description || `AI生成的图片：${artwork.prompt}`}
              className="w-full"
            />
            <figcaption className="bg-gray-50 p-4 text-sm text-gray-600">
              创意描述：{artwork.prompt}
            </figcaption>
          </figure>

          {/* 画面描述（文字版，听障用户可读） */}
          {artwork.description && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="font-semibold text-blue-900 mb-2">画面描述</h3>
              <p className="text-blue-800 leading-relaxed">{artwork.description}</p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-4">
            {/* 听觉画面解析 */}
            <button
              onClick={handleDescribe}
              className="touch-target px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              aria-label="听觉画面解析，AI将描述画面内容"
            >
              <span aria-hidden="true">🔊</span>
              {artwork.description ? '重新描述' : '描述画面'}
            </button>

            {/* 停止播报 */}
            {isSpeaking && (
              <button
                onClick={handleStopSpeaking}
                className="touch-target px-6 py-3 bg-gray-600 text-white rounded-xl font-medium hover:bg-gray-700 transition-colors"
                aria-label="停止语音播报"
              >
                <span aria-hidden="true">⏹️</span>
                停止播报
              </button>
            )}

            {/* 语音修改 */}
            <button
              onClick={() => {
                setStep('input')
                setPrompt('')
                announce('请说出您的修改指令，例如：把背景换成森林')
              }}
              className="touch-target px-6 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
              aria-label="语音修改画面"
            >
              <span aria-hidden="true">✏️</span>
              修改画面
            </button>

            {/* 重新创作 */}
            <button
              onClick={() => {
                setArtwork(null)
                setPrompt('')
                setStep('input')
                announce('开始新的创作')
              }}
              className="touch-target px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              aria-label="重新创作"
            >
              重新创作
            </button>
          </div>

          {/* 快捷修改指令 */}
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="font-medium text-gray-700 mb-3">快捷修改指令</h3>
            <div className="flex flex-wrap gap-2">
              {[
                '把背景换成森林',
                '让色调更暖一些',
                '改成水彩画风格',
                '重新画一张',
              ].map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => handleModify(cmd)}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:border-primary hover:text-primary transition-colors"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
