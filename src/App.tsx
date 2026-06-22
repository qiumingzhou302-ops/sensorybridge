import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAccessibility } from './contexts/AccessibilityContext'
import { speak, preloadVoices } from './lib/speech'
import { useEffect } from 'react'
import HomePage from './pages/HomePage'
import CreatePage from './pages/CreatePage'
import HearingImpairedPage from './pages/HearingImpairedPage'
import PhysicalImpairedPage from './pages/PhysicalImpairedPage'
import SettingsPage from './pages/SettingsPage'

/** 导航项 */
const NAV_ITEMS = [
  { path: '/', label: '首页', voice: '返回首页' },
  { path: '/create', label: '视障创作', voice: '进入视障创作' },
  { path: '/hearing', label: '听障创作', voice: '进入听障创作' },
  { path: '/physical', label: '肢障创作', voice: '进入肢障创作' },
  { path: '/settings', label: '设置', voice: '打开无障碍设置', icon: '⚙️' },
]

export default function App() {
  const { settings } = useAccessibility()
  const location = useLocation()

  // 页面加载时预加载语音
  useEffect(() => {
    if (settings.autoSpeak === 'all' || settings.autoSpeak === 'feedback') {
      preloadVoices()
    }
  }, [settings.autoSpeak])

  return (
    <>
      {/* 跳过导航链接（WCAG 2.4.1） */}
      <a href="#main-content" className="skip-link">
        跳到主内容
      </a>

      {/* 顶部导航 */}
      <header
        role="banner"
        className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm"
      >
        <nav
          role="navigation"
          aria-label="主导航"
          className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2"
        >
          <Link
            to="/"
            className="text-xl font-bold text-primary hover:text-primary-dark transition-colors"
            aria-label="SensoryBridge 首页"
            onClick={() => settings.voiceEnabled && speak('返回首页')}
          >
            SensoryBridge
          </Link>
          <div className="flex items-center gap-1 flex-wrap">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 rounded-lg transition-colors touch-target flex items-center text-sm font-medium ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => settings.voiceEnabled && speak(item.voice)}
                >
                  {item.icon && <span aria-hidden="true" className="mr-1">{item.icon}</span>}
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>
      </header>

      {/* 主内容区 */}
      <main id="main-content" role="main" className="max-w-6xl mx-auto px-4 py-8">
        {/* ARIA Live 区域 — 状态消息（WCAG 4.1.3） */}
        <div aria-live="polite" aria-atomic="true" className="sr-only" id="status-messages" />
        {/* ARIA Live 区域 — 紧急警报 */}
        <div aria-live="assertive" aria-atomic="true" className="sr-only" id="alert-messages" />

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/hearing" element={<HearingImpairedPage />} />
          <Route path="/physical" element={<PhysicalImpairedPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      {/* 页脚 */}
      <footer role="contentinfo" className="bg-gray-900 text-white text-center py-6 mt-12">
        <p className="opacity-70">SensoryBridge — 听见画面·看见声音</p>
        <p className="opacity-50 text-sm mt-1">AI 残障感官代偿创作工具包</p>
      </footer>
    </>
  )
}
