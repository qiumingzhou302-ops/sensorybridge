import { useState, useRef, useCallback, useEffect } from 'react'
import { useAccessibility } from '../contexts/AccessibilityContext'
import {
  speak,
  stopSpeaking,
  isSpeechSynthesisSupported,
} from '../lib/speech'
import { generateImage, describeImage, parseCommand, generateSubtitles } from '../lib/api'
import { WavRecorder } from '../lib/wav-recorder'

/**
 * 肢障创作模块 — 全语音交互系统
 * 所有操作通过语音完成，无需精细手部操作
 * 简化界面：大按钮、单击操作、语音优先
 *
 * 语音识别方案：WavRecorder 录制 WAV → 上传后端 → 阿里云百炼 Paraformer 识别
 * 用 WAV 格式确保阿里云百炼能正确识别（webm 格式百炼不支持）
 */

type Mode = 'idle' | 'recording' | 'recognizing' | 'generating' | 'result' | 'describing'

interface Artwork {
  url: string
  prompt: string
  description?: string
}

/** 语音指令映射表 */
const VOICE_COMMANDS: { pattern: string; action: string; desc: string }[] = [
  { pattern: '生成|画|创作|画一张|画一个', action: 'generate', desc: '生成图片' },
  { pattern: '描述|看看|查看|画面是什么', action: 'describe', desc: '描述画面' },
  { pattern: '修改|改|换|调整', action: 'modify', desc: '修改画面' },
  { pattern: '重新|重来|再画', action: 'regenerate', desc: '重新创作' },
  { pattern: '保存|导出|下载', action: 'export', desc: '导出图片' },
  { pattern: '停止|安静|别说了', action: 'stop', desc: '停止播报' },
  { pattern: '帮助|怎么用|指令', action: 'help', desc: '查看帮助' },
]

export default function PhysicalImpairedPage() {
  const { settings } = useAccessibility()
  const [mode, setMode] = useState<Mode>('idle')
  const [artwork, setArtwork] = useState<Artwork | null>(null)
  const [transcript, setTranscript] = useState('') // 识别出的文字
  const [subtitle, setSubtitle] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState('')
  const [commandLog, setCommandLog] = useState<string[]>([])

  const wavRecorderRef = useRef<WavRecorder | null>(null)
  const ttsSupported = isSpeechSynthesisSupported()

  /** 语音播报 + 字幕 */
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

  /** 添加指令日志 */
  const addLog = (cmd: string) => {
    setCommandLog((prev) => [`[${new Date().toLocaleTimeString()}] ${cmd}`, ...prev].slice(0, 10))
  }

  /** 解析语音指令 */
  const parseVoiceCommand = (text: string): { action: string; content: string } => {
    for (const cmd of VOICE_COMMANDS) {
      const regex = new RegExp(cmd.pattern, 'i')
      if (regex.test(text)) {
        // 提取指令后面的内容
        const content = text.replace(regex, '').trim()
        return { action: cmd.action, content }
      }
    }
    return { action: 'unknown', content: text }
  }

  /** 执行语音指令 */
  const executeCommand = useCallback(
    async (text: string) => {
      const { action, content } = parseVoiceCommand(text)
      addLog(`指令：${text} → 动作：${action}`)

      try {
        switch (action) {
          case 'generate': {
            const userPrompt = content || text
            setMode('generating')
            announce(`正在为您创作：${userPrompt}`)
            const result = await generateImage({ prompt: userPrompt })
            if (result.success && result.imageUrl) {
              setArtwork({ url: result.imageUrl, prompt: userPrompt })
              setMode('result')
              announce('图片已生成。您可以说"描述画面"来听画面内容，或说"修改"来调整')
            } else {
              announce(`生成失败：${result.error || '请重试'}`)
              setMode('idle')
            }
            break
          }
          case 'describe': {
            if (!artwork) {
              announce('还没有图片，请先说"画一张"加上您的创意')
              setMode('idle')
              return
            }
            setMode('describing')
            announce('正在解析画面...')
            const result = await describeImage({ imageUrl: artwork.url, detailLevel: 'comprehensive' })
            if (result.success && result.description) {
              setArtwork({ ...artwork, description: result.description })
              announce(result.description)
            } else {
              announce(`解析失败：${result.error || '请重试'}`)
            }
            setMode('result')
            break
          }
          case 'modify': {
            if (!artwork) {
              announce('还没有图片，请先创作一张图片')
              setMode('idle')
              return
            }
            if (!content) {
              announce('请说出修改内容，例如：把背景换成森林')
              setMode('idle')
              return
            }
            setMode('generating')
            announce(`正在修改：${content}`)
            // 用 DeepSeek 合并指令（通过 parseCommand API）
            const parseResult = await parseCommand({ command: content, currentPrompt: artwork.prompt })
            if (parseResult.success && parseResult.newPrompt) {
              const genResult = await generateImage({ prompt: parseResult.newPrompt })
              if (genResult.success && genResult.imageUrl) {
                setArtwork({ url: genResult.imageUrl, prompt: parseResult.newPrompt })
                announce('画面已修改完成')
                setMode('result')
              } else {
                announce('修改失败，请重试')
                setMode('idle')
              }
            } else {
              announce('指令理解失败，请重试')
              setMode('idle')
            }
            break
          }
          case 'regenerate':
            setArtwork(null)
            setMode('idle')
            announce('好的，请说出您的新创意')
            break
          case 'export':
            if (artwork) {
              const link = document.createElement('a')
              link.href = artwork.url
              link.download = 'sensorybridge-artwork.png'
              link.click()
              announce('图片正在下载')
            } else {
              announce('还没有图片可导出')
            }
            setMode('idle')
            break
          case 'stop':
            stopSpeaking()
            setIsSpeaking(false)
            setMode('idle')
            break
          case 'help':
            announce(
              '您可以说：画一张夕阳下的海边；描述画面；把背景换成森林；重新画；导出图片；停止播报'
            )
            setMode('idle')
            break
          default:
            // 默认当作生成指令
            setMode('generating')
            announce(`正在为您创作：${text}`)
            const result = await generateImage({ prompt: text })
            if (result.success && result.imageUrl) {
              setArtwork({ url: result.imageUrl, prompt: text })
              setMode('result')
              announce('图片已生成。说"描述画面"来听内容，说"修改"来调整')
            } else {
              announce(`生成失败：${result.error || '请重试'}`)
              setMode('idle')
            }
        }
      } catch (err) {
        // 任何异常都恢复到 idle 状态，避免卡死
        console.error('执行指令异常:', err)
        announce('指令执行出错，请重试')
        setMode('idle')
      }
    },
    [artwork, announce]
  )

  /** 开始录音 — 用 WavRecorder 采集麦克风音频并编码为 WAV */
  const startRecording = useCallback(async () => {
    setError('')
    setTranscript('')

    // 检查浏览器是否支持
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('当前浏览器不支持录音功能，请使用 Chrome、Edge 或 Firefox 浏览器')
      announce('当前浏览器不支持录音功能')
      return
    }

    try {
      // 创建 WavRecorder 并开始录音
      const recorder = new WavRecorder()
      wavRecorderRef.current = recorder
      await recorder.start()

      setIsRecording(true)
      setMode('recording')
      announce('正在录音，请说出您的指令。再次点击按钮停止录音')
    } catch (err: any) {
      const errName = err?.name || ''
      const errMsg = err?.message || ''

      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setError('麦克风权限被拒绝。请在浏览器地址栏左侧点击锁形图标，将麦克风权限改为"允许"，然后刷新页面重试')
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setError('未检测到麦克风设备，请检查麦克风是否已连接')
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setError('麦克风被其他程序占用，请关闭其他使用麦克风的程序后重试')
      } else if (errName === 'OverconstrainedError') {
        setError('麦克风不满足约束条件，请检查设备')
      } else if (errName === 'SecurityError') {
        setError('安全限制：需要通过 HTTPS 访问页面才能使用麦克风')
      } else {
        setError(`麦克风访问失败：${errName || errMsg || '未知错误'}。请刷新页面重试`)
      }
      announce('麦克风访问失败，请检查权限设置')
    }
  }, [announce])

  /** 停止录音 — 触发识别 */
  const stopRecording = useCallback(async () => {
    const recorder = wavRecorderRef.current
    if (!recorder || !recorder.recording) {
      setIsRecording(false)
      return
    }

    setIsRecording(false)

    try {
      // 停止录音，获取 WAV Blob
      const wavBlob = await recorder.stop()

      if (wavBlob.size === 0) {
        setError('录音为空，请重试')
        setMode('idle')
        return
      }

      // 上传到后端识别
      setMode('recognizing')
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
        fileName: 'voice-command.wav',
      })

      if (result.success && result.subtitles && result.subtitles.length > 0) {
        const text = result.subtitles.map((s) => s.text).join('')
        setTranscript(text)
        setMode('idle')
        executeCommand(text)
      } else {
        setError(result.error || '未识别到语音内容，请重试')
        setMode('idle')
      }
    } catch (err) {
      console.error('录音识别失败:', err)
      setError('语音识别失败，请重试')
      setMode('idle')
    }
  }, [announce, executeCommand])

  /** 大按钮单击操作（肢障用户友好） */
  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'generate':
        announce('请说出您的创意，例如：画一张夕阳下的海边')
        break
      case 'describe':
        executeCommand('描述画面')
        break
      case 'modify':
        announce('请说出修改内容，例如：把背景换成森林')
        break
      case 'export':
        executeCommand('导出图片')
        break
      case 'help':
        executeCommand('帮助')
        break
    }
  }

  useEffect(() => {
    return () => {
      // 组件卸载时停止录音并释放麦克风
      const recorder = wavRecorderRef.current
      if (recorder && recorder.recording) {
        recorder.stop().catch(() => {})
      }
      stopSpeaking()
    }
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">肢障创作工作台</h1>
      <p className="text-gray-600">
        全语音交互，无需精细手部操作。说出指令，完成创作。
      </p>

      {/* 字幕显示区 */}
      {settings.subtitleEnabled && subtitle && (
        <div
          role="status"
          aria-live="polite"
          className="bg-gray-900 text-white rounded-xl p-4 text-center text-lg"
        >
          {subtitle}
        </div>
      )}

      {/* 语音识别状态显示区
          - 录音中：红色脉冲指示器 + "正在录音"
          - 识别中：旋转加载图标 + "正在识别语音..."
          - 识别完成：显示识别出的文字（蓝色） */}
      {(isRecording || mode === 'recognizing' || transcript) && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6 space-y-3">
          {/* 录音中状态 */}
          {isRecording && (
            <div className="flex items-center gap-2 text-red-600 font-medium">
              <span
                className="inline-block w-3 h-3 rounded-full bg-red-500 animate-pulse"
                aria-hidden="true"
              ></span>
              <span>正在录音... 再次点击按钮停止并识别</span>
            </div>
          )}

          {/* 识别中状态 */}
          {mode === 'recognizing' && (
            <div className="flex items-center gap-2 text-blue-700 font-medium">
              <span
                className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"
                aria-hidden="true"
              ></span>
              <span>正在识别语音...</span>
            </div>
          )}

          {/* 识别结果文字 */}
          {transcript && !isRecording && mode !== 'recognizing' && (
            <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
              <p className="text-xs text-blue-400 mb-1">识别结果</p>
              <p className="text-blue-700 font-medium text-lg">{transcript}</p>
            </div>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
          {error}
        </div>
      )}

      {/* 核心语音按钮 — 超大尺寸 */}
      <section aria-labelledby="voice-heading" className="flex flex-col items-center gap-6 py-8">
        <h2 id="voice-heading" className="sr-only">语音控制</h2>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={mode === 'recognizing'}
          className={`w-40 h-40 rounded-full flex items-center justify-center text-6xl transition-all shadow-xl disabled:opacity-50 ${
            isRecording
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-primary text-white hover:bg-primary-dark'
          }`}
          aria-label={isRecording ? '停止录音并识别' : '开始录音'}
          aria-pressed={isRecording}
        >
          {isRecording ? '⏹️' : '🎤'}
        </button>
        <p className="text-lg text-gray-600">
          {mode === 'recognizing'
            ? '正在识别语音...'
            : isRecording
            ? '正在录音... 点击停止'
            : '点击开始录音'}
        </p>
      </section>

      {/* 快捷操作大按钮 */}
      <section aria-labelledby="quick-actions-heading" className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <h2 id="quick-actions-heading" className="sr-only">快捷操作</h2>
        {[
          { action: 'generate', icon: '🎨', label: '开始创作', color: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' },
          { action: 'describe', icon: '🔊', label: '描述画面', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
          { action: 'modify', icon: '✏️', label: '修改画面', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
          { action: 'export', icon: '💾', label: '导出图片', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
          { action: 'help', icon: '❓', label: '语音帮助', color: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
        ].map((btn) => (
          <button
            key={btn.action}
            onClick={() => handleQuickAction(btn.action)}
            className={`touch-target p-6 rounded-2xl font-medium text-lg transition-colors flex flex-col items-center gap-2 ${btn.color}`}
            aria-label={btn.label}
          >
            <span className="text-3xl" aria-hidden="true">{btn.icon}</span>
            {btn.label}
          </button>
        ))}
      </section>

      {/* 生成中状态 */}
      {(mode === 'generating' || mode === 'describing') && (
        <div aria-live="polite" className="flex flex-col items-center gap-4 py-12">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <p className="text-lg text-gray-600">
            {mode === 'describing' ? '正在解析画面...' : '正在创作图片...'}
          </p>
        </div>
      )}

      {/* 结果展示 */}
      {mode === 'result' && artwork && (
        <section aria-labelledby="result-heading" className="space-y-4">
          <h2 id="result-heading" className="text-xl font-semibold text-gray-700">创作结果</h2>
          <figure className="rounded-xl overflow-hidden shadow-lg">
            <img
              src={artwork.url}
              alt={artwork.description || artwork.prompt}
              className="w-full"
            />
            <figcaption className="bg-gray-50 p-4 text-sm text-gray-600">
              {artwork.prompt}
            </figcaption>
          </figure>

          {artwork.description && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="font-semibold text-blue-900 mb-2">画面描述</h3>
              <p className="text-blue-800 leading-relaxed">{artwork.description}</p>
            </div>
          )}

          {isSpeaking && (
            <button
              onClick={() => {
                stopSpeaking()
                setIsSpeaking(false)
              }}
              className="touch-target px-6 py-3 bg-gray-600 text-white rounded-xl font-medium hover:bg-gray-700 transition-colors"
            >
              停止播报
            </button>
          )}
        </section>
      )}

      {/* 指令日志（辅助参考） */}
      {commandLog.length > 0 && (
        <section aria-labelledby="log-heading" className="bg-gray-50 rounded-xl p-6">
          <h2 id="log-heading" className="text-sm font-medium text-gray-500 mb-3">指令日志</h2>
          <ul className="space-y-1 text-sm text-gray-600 font-mono">
            {commandLog.map((log, idx) => (
              <li key={idx}>{log}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 可用语音指令说明 */}
      <section aria-labelledby="commands-help-heading" className="bg-gray-50 rounded-xl p-6">
        <h2 id="commands-help-heading" className="font-medium text-gray-700 mb-3">可用语音指令</h2>
        <div className="grid md:grid-cols-2 gap-2 text-sm text-gray-600">
          {VOICE_COMMANDS.map((cmd) => (
            <div key={cmd.action} className="flex items-center gap-2">
              <span className="text-green-600" aria-hidden="true">•</span>
              <span className="font-medium">"{cmd.desc}"</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
