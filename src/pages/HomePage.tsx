import { Link } from 'react-router-dom'
import { useAccessibility } from '../contexts/AccessibilityContext'
import { speak } from '../lib/speech'

interface ScenarioCard {
  path: string
  icon: string
  title: string
  desc: string
  features: string[]
  color: string
}

const SCENARIOS: ScenarioCard[] = [
  {
    path: '/create',
    icon: '👁️',
    title: '视障创作',
    desc: '用听觉替代视觉，语音生成图片并"听见"画面',
    features: ['语音文生图', '听觉画面解析', '语音指令修改'],
    color: 'from-indigo-500 to-purple-600',
  },
  {
    path: '/hearing',
    icon: '👂',
    title: '听障创作',
    desc: '用可视化图形替代音频，"看见"声音节奏',
    features: ['音频波形可视化', '节奏脉冲标记', '智能字幕对齐'],
    color: 'from-amber-500 to-orange-600',
  },
  {
    path: '/physical',
    icon: '✋',
    title: '肢障创作',
    desc: '用纯语音替代手部操作，"说"出创作',
    features: ['全语音交互', '语音指令映射', '简化操作界面'],
    color: 'from-teal-500 to-cyan-600',
  },
]

export default function HomePage() {
  const { settings } = useAccessibility()

  return (
    <div className="space-y-8">
      {/* Hero 区域 */}
      <section className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          听见画面 · 看见声音
        </h1>
        <p className="text-xl text-gray-600 mb-2">
          AI 残障感官代偿创作工具包
        </p>
        <p className="text-gray-500 max-w-2xl mx-auto">
          以多模态感官代偿为核心，用听觉替代视觉、用可视化替代音频、用语音替代手部操作，
          让残障人群平等参与 AIGC 数字创作浪潮。
        </p>
      </section>

      {/* 场景选择 */}
      <section aria-labelledby="scenarios-heading">
        <h2 id="scenarios-heading" className="text-2xl font-semibold text-gray-800 mb-6">
          选择适合您的创作模式
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {SCENARIOS.map((s) => (
            <Link
              key={s.path}
              to={s.path}
              onClick={() => settings.voiceEnabled && speak(`进入${s.title}模式`)}
              className="group block rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all"
            >
              {/* 顶部渐变区 */}
              <div className={`bg-gradient-to-br ${s.color} p-8 text-white`}>
                <span className="text-5xl" aria-hidden="true">{s.icon}</span>
                <h3 className="text-2xl font-bold mt-4">{s.title}</h3>
                <p className="text-white/90 mt-2 text-sm">{s.desc}</p>
              </div>
              {/* 功能列表 */}
              <div className="bg-white p-6">
                <ul className="space-y-2">
                  {s.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-gray-700">
                      <span className="text-green-600" aria-hidden="true">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-primary font-medium group-hover:underline">
                  开始使用 →
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 数据统计 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 py-8">
        {[
          { num: '8500万', label: '残障人士受益' },
          { num: '3类', label: '感官代偿模式' },
          { num: '0元', label: '创作依赖成本' },
          { num: 'WCAG AAA', label: '无障碍标准' },
        ].map((stat) => (
          <div key={stat.label} className="text-center bg-gray-50 rounded-xl p-6">
            <p className="text-3xl font-bold text-primary">{stat.num}</p>
            <p className="text-gray-500 text-sm mt-1">{stat.label}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
