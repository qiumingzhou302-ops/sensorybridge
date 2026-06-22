import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

/** 无障碍设置类型 */
interface AccessibilitySettings {
  fontSize: 'small' | 'medium' | 'large' | 'xlarge'
  highContrast: boolean
  reduceMotion: boolean
  speechRate: number // 0.5 - 2.0
  autoSpeak: 'off' | 'feedback' | 'all'
  subtitleEnabled: boolean
  voiceEnabled: boolean
  clickTargetSize: 'standard' | 'large' | 'xlarge'
  operationConfirm: 'single' | 'double' | 'longpress'
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  fontSize: 'medium',
  highContrast: false,
  reduceMotion: false,
  speechRate: 1.0,
  autoSpeak: 'feedback',
  subtitleEnabled: true,
  voiceEnabled: true,
  clickTargetSize: 'large',
  operationConfirm: 'single',
}

interface AccessibilityContextValue {
  settings: AccessibilitySettings
  updateSetting: <K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K]
  ) => void
  resetSettings: () => void
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null)

const STORAGE_KEY = 'sensorybridge-a11y-settings'

/** 无障碍设置 Provider — 全局管理用户的无障碍偏好 */
export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
      } catch {
        return DEFAULT_SETTINGS
      }
    }
    return DEFAULT_SETTINGS
  })

  // 持久化 + 应用到 <html> 元素
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))

    const root = document.documentElement

    // 字体大小
    root.style.fontSize = {
      small: '14px',
      medium: '16px',
      large: '20px',
      xlarge: '24px',
    }[settings.fontSize]

    // 高对比度
    root.classList.toggle('high-contrast', settings.highContrast)

    // 减少动画
    root.classList.toggle('reduce-motion', settings.reduceMotion)
  }, [settings])

  const updateSetting = <K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const resetSettings = () => setSettings(DEFAULT_SETTINGS)

  return (
    <AccessibilityContext.Provider value={{ settings, updateSetting, resetSettings }}>
      {children}
    </AccessibilityContext.Provider>
  )
}

/** 获取无障碍设置 hook */
export function useAccessibility() {
  const ctx = useContext(AccessibilityContext)
  if (!ctx) {
    throw new Error('useAccessibility 必须在 AccessibilityProvider 内使用')
  }
  return ctx
}
