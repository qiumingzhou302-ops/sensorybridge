import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 动态导入 API 处理器（tsx 支持直接导入 .ts 文件）
const { generateImageHandler } = await import('./api/generate-image.ts')
const { describeImageHandler } = await import('./api/describe-image.ts')
const { parseCommandHandler } = await import('./api/parse-command.ts')
const { generateSubtitlesHandler } = await import('./api/generate-subtitles.ts')

const app = new Hono()

// 健康检查
app.get('/api', (c) => c.json({ status: 'ok', service: 'SensoryBridge API' }))
app.get('/api/', (c) => c.json({ status: 'ok', service: 'SensoryBridge API' }))

// API 路由
app.post('/api/generate-image', generateImageHandler)
app.post('/api/describe-image', describeImageHandler)
app.post('/api/parse-command', parseCommandHandler)
app.post('/api/generate-subtitles', generateSubtitlesHandler)

// 静态文件服务（前端构建产物在 dist/ 目录）
app.use('/assets/*', serveStatic({ root: './dist' }))
app.use('/vite.svg', serveStatic({ root: './dist' }))
app.use('/favicon.ico', serveStatic({ root: './dist' }))

// SPA 回退 — 所有未匹配的 GET 请求返回 index.html
app.get('*', async (c) => {
  try {
    const indexPath = path.join(__dirname, 'dist', 'index.html')
    const html = fs.readFileSync(indexPath, 'utf-8')
    return c.html(html)
  } catch {
    return c.text('前端构建产物未找到，请先运行 npm run build', 500)
  }
})

// CloudBase 云托管通过 PORT 环境变量指定端口
const port = parseInt(process.env.PORT || '3000', 10)
serve({ fetch: app.fetch, port })
console.log(`[server] SensoryBridge 运行在端口 ${port}`)
