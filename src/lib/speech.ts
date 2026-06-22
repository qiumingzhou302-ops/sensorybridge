/**
 * 语音工具 — 封装 Web Speech API（语音识别 + 语音合成）
 * 浏览器原生支持，零后端成本
 */

/** ===== 语音识别 ===== */

type SpeechRecognitionType = typeof window extends { SpeechRecognition: infer T }
  ? T
  : any

export function getSpeechRecognition(): SpeechRecognitionType | null {
  const SR =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  return SR || null
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null
}

/** 创建语音识别实例 */
export function createSpeechRecognition(lang = 'zh-CN') {
  const SR = getSpeechRecognition()
  if (!SR) return null

  const recognition = new SR()
  recognition.lang = lang
  // continuous=true：持续监听，用户停顿不会自动结束
  recognition.continuous = true
  // interimResults=true：返回临时识别结果，可实时显示
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  return recognition
}

/** ===== 语音合成（TTS）===== */

export function isSpeechSynthesisSupported(): boolean {
  return 'speechSynthesis' in window
}

/** 语音播报 */
export function speak(
  text: string,
  options?: { rate?: number; voice?: string; onEnd?: () => void }
) {
  if (!isSpeechSynthesisSupported()) return

  // 停止当前播报
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = options?.rate ?? 1.0
  utterance.volume = 1
  utterance.pitch = 1

  // 选择中文语音
  const voices = window.speechSynthesis.getVoices()
  const zhVoice = voices.find((v) => v.lang.startsWith('zh'))
  if (zhVoice) utterance.voice = zhVoice

  if (options?.onEnd) {
    utterance.onend = options.onEnd
  }

  window.speechSynthesis.speak(utterance)
}

/** 停止语音播报 */
export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel()
  }
}

/** 预加载语音列表（某些浏览器需要异步加载） */
export function preloadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported()) {
      resolve([])
      return
    }

    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      resolve(voices)
      return
    }

    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices())
    }
  })
}
