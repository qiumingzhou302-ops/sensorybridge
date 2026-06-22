import { useState, useRef, useCallback } from 'react'
import { useAccessibility } from '../contexts/AccessibilityContext'
import {
  createSpeechRecognition,
  speak,
  stopSpeaking,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
} from '../lib/speech'
import { generateImage, describeImage, parseCommand } from '../lib/api'

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
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState('')
  const [subtitle, setSubtitle] = useState('') // 字幕（听障用户用）
  const recognitionRef = useRef<any>(null)

  const srSupported = isSpeechRecognitionSupported()
  const ttsSupported = isSpeechSynthesisSupported()

  /** 语音播报 + 字幕同步 */
  const announce = useCallback(
    (text: string) => {
      setSubtitle(text) // 字幕同步显示（听障用户）
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

  /** 开始语音输入 */
  const startListening = useCallback(() => {
    if (!srSupported) {
      setError('当前浏览器不支持语音识别，请使用 Chrome 或 Edge 浏览器')
      announce('当前浏览器不支持语音识别，请使用 Chrome 或 Edge 浏览器')
      return
    }

    const recognition = createSpeechRecognition('zh-CN')
    if (!recognition) return

    recognitionRef.current = recognition
    setIsListening(true)
    setError('')
    announce('正在聆听，请说出您的创意...')

    let finalText = ''
    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += transcript
        } else {
          interim += transcript
        }
      }
      setPrompt(finalText + interim)
    }

    recognition.onerror = (event: any) => {
      setIsListening(false)
      if (event.error === 'no-speech') {
        announce('未听清，请再说一次')
      } else if (event.error === 'not-allowed') {
        announce('请允许麦克风权限')
      } else {
        announce('语音识别出错，请重试')
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      if (finalText) {
        announce(`您说的是：${finalText}。确认生成请说"确认"，重新说请说"重试"`)
      }
    }

    recognition.start()
  }, [srSupported, announce])

  /** 停止语音输入 */
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

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
    announce('图片已生成。要听画面描述，请说"描述画面"或点击描述按钮')
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

          {/* 语音输入按钮 */}
          <div className="flex flex-col items-center gap-6 py-8">
            <button
              onClick={isListening ? stopListening : startListening}
              className={`touch-target w-32 h-32 rounded-full flex items-center justify-center text-5xl transition-all ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-primary text-white hover:bg-primary-dark shadow-lg hover:shadow-xl'
              }`}
              aria-label={isListening ? '停止语音输入' : '开始语音输入，按住说话'}
              aria-pressed={isListening}
            >
              {isListening ? '⏹️' : '🎤'}
            </button>
            <p className="text-gray-500 text-center">
              {isListening ? '正在聆听...' : '点击按钮，说出您想画的画面'}
            </p>
          </div>

          {/* 识别到的文字 */}
          {prompt && (
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

          {/* 浏览器兼容性提示 */}
          {!srSupported && (
            <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4">
              当前浏览器不支持语音识别。请使用 Chrome 或 Edge 浏览器，或在下方手动输入描述。
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
