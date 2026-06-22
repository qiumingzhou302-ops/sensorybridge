import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// 加载 .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url))
try {
  const envPath = path.resolve(__dirname, '.env.local')
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim()
      const value = trimmed.substring(eqIdx + 1).trim()
      process.env[key] = value
    }
  }
  console.log('[dev-server] .env.local 已加载')
} catch {
  console.warn('[dev-server] 未找到 .env.local')
}

// 动态导入 API 处理器
const { generateImageHandler } = await import('./api/generate-image.ts')
const { describeImageHandler } = await import('./api/describe-image.ts')
const { parseCommandHandler } = await import('./api/parse-command.ts')
const { generateSubtitlesHandler } = await import('./api/generate-subtitles.ts')

const app = new Hono()

// CORS — 允许前端跨域调用
app.use('*', cors())

// 请求日志
app.use('*', async (c, next) => {
  console.log(`[${c.req.method}] ${c.req.url}`)
  await next()
})

// 健康检查
app.get('/api', (c) => c.json({ status: 'ok', service: 'SensoryBridge API' }))
app.get('/api/', (c) => c.json({ status: 'ok', service: 'SensoryBridge API' }))

// API 路由（带 /api 前缀，与 Vite 代理配合）
app.post('/api/generate-image', generateImageHandler)
app.post('/api/describe-image', describeImageHandler)
app.post('/api/parse-command', parseCommandHandler)
app.post('/api/generate-subtitles', generateSubtitlesHandler)

const port = 3001
serve({ fetch: app.fetch, port })
console.log(`[dev-server] API 服务运行在 http://localhost:${port}`)
