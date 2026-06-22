import { useAccessibility } from '../contexts/AccessibilityContext'
import { speak } from '../lib/speech'

export default function SettingsPage() {
  const { settings, updateSetting, resetSettings } = useAccessibility()

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">无障碍设置</h1>
      <p className="text-gray-600">根据您的需求自定义无障碍体验，所有设置即时生效。</p>

      {/* 视觉设置 */}
      <section aria-labelledby="visual-heading" className="space-y-4">
        <h2 id="visual-heading" className="text-xl font-semibold text-gray-800 border-b pb-2">
          视觉设置
        </h2>

        {/* 字体大小 */}
        <div className="flex items-center justify-between py-3">
          <label htmlFor="font-size" className="text-gray-700 font-medium">
            字体大小
          </label>
          <select
            id="font-size"
            value={settings.fontSize}
            onChange={(e) => updateSetting('fontSize', e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="small">小（14px）</option>
            <option value="medium">中（16px）</option>
            <option value="large">大（20px）</option>
            <option value="xlarge">超大（24px）</option>
          </select>
        </div>

        {/* 高对比度 */}
        <div className="flex items-center justify-between py-3">
          <label htmlFor="high-contrast" className="text-gray-700 font-medium">
            高对比度模式
          </label>
          <button
            id="high-contrast"
            role="switch"
            aria-checked={settings.highContrast}
            onClick={() => updateSetting('highContrast', !settings.highContrast)}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              settings.highContrast ? 'bg-primary' : 'bg-gray-300'
            }`}
            aria-label="高对比度模式"
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                settings.highContrast ? 'translate-x-7' : ''
              }`}
            />
          </button>
        </div>

        {/* 减少动画 */}
        <div className="flex items-center justify-between py-3">
          <label htmlFor="reduce-motion" className="text-gray-700 font-medium">
            减少动画
          </label>
          <button
            id="reduce-motion"
            role="switch"
            aria-checked={settings.reduceMotion}
            onClick={() => updateSetting('reduceMotion', !settings.reduceMotion)}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              settings.reduceMotion ? 'bg-primary' : 'bg-gray-300'
            }`}
            aria-label="减少动画"
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                settings.reduceMotion ? 'translate-x-7' : ''
              }`}
            />
          </button>
        </div>
      </section>

      {/* 听觉设置 */}
      <section aria-labelledby="audio-heading" className="space-y-4">
        <h2 id="audio-heading" className="text-xl font-semibold text-gray-800 border-b pb-2">
          听觉设置
        </h2>

        {/* 语音播报开关 */}
        <div className="flex items-center justify-between py-3">
          <label htmlFor="voice-enabled" className="text-gray-700 font-medium">
            语音播报
          </label>
          <button
            id="voice-enabled"
            role="switch"
            aria-checked={settings.voiceEnabled}
            onClick={() => updateSetting('voiceEnabled', !settings.voiceEnabled)}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              settings.voiceEnabled ? 'bg-primary' : 'bg-gray-300'
            }`}
            aria-label="语音播报开关"
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                settings.voiceEnabled ? 'translate-x-7' : ''
              }`}
            />
          </button>
        </div>

        {/* 语音播报速度 */}
        <div className="py-3">
          <label htmlFor="speech-rate" className="block text-gray-700 font-medium mb-2">
            语音播报速度：{settings.speechRate}x
          </label>
          <input
            id="speech-rate"
            type="range"
            min="0.5"
            max="2.0"
            step="0.25"
            value={settings.speechRate}
            onChange={(e) => updateSetting('speechRate', parseFloat(e.target.value))}
            className="w-full"
            aria-describedby="rate-desc"
          />
          <p id="rate-desc" className="text-sm text-gray-500 mt-1">
            范围 0.5x 到 2.0x
          </p>
          <button
            onClick={() => speak('这是一段测试语音，用于调整播报速度', { rate: settings.speechRate })}
            className="mt-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 transition-colors"
          >
            测试语音
          </button>
        </div>

        {/* 字幕显示 */}
        <div className="flex items-center justify-between py-3">
          <label htmlFor="subtitle-enabled" className="text-gray-700 font-medium">
            字幕显示
          </label>
          <button
            id="subtitle-enabled"
            role="switch"
            aria-checked={settings.subtitleEnabled}
            onClick={() => updateSetting('subtitleEnabled', !settings.subtitleEnabled)}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              settings.subtitleEnabled ? 'bg-primary' : 'bg-gray-300'
            }`}
            aria-label="字幕显示开关"
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                settings.subtitleEnabled ? 'translate-x-7' : ''
              }`}
            />
          </button>
        </div>
      </section>

      {/* 操作设置 */}
      <section aria-labelledby="operation-heading" className="space-y-4">
        <h2 id="operation-heading" className="text-xl font-semibold text-gray-800 border-b pb-2">
          操作设置
        </h2>

        {/* 点击区域大小 */}
        <div className="flex items-center justify-between py-3">
          <label htmlFor="click-target" className="text-gray-700 font-medium">
            点击区域大小
          </label>
          <select
            id="click-target"
            value={settings.clickTargetSize}
            onChange={(e) => updateSetting('clickTargetSize', e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="standard">标准（44px）</option>
            <option value="large">大（60px）</option>
            <option value="xlarge">超大（80px）</option>
          </select>
        </div>
      </section>

      {/* 重置按钮 */}
      <div className="pt-4 border-t">
        <button
          onClick={() => {
            resetSettings()
            speak('设置已重置为默认值')
          }}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
        >
          恢复默认设置
        </button>
      </div>
    </div>
  )
}
