import { Hono } from 'hono'
import { generateImageHandler } from './generate-image'
import { describeImageHandler } from './describe-image'
import { parseCommandHandler } from './parse-command'
import { generateSubtitlesHandler } from './generate-subtitles'

const app = new Hono()

/** 健康检查 */
app.get('/', (c) => c.json({ status: 'ok', service: 'SensoryBridge API' }))

/** 文生图 — 通义万相 */
app.post('/generate-image', generateImageHandler)

/** 图像理解 — 智谱 GLM-4V */
app.post('/describe-image', describeImageHandler)

/** 指令理解 — DeepSeek */
app.post('/parse-command', parseCommandHandler)

/** 字幕生成 — 阿里云百炼 Paraformer */
app.post('/generate-subtitles', generateSubtitlesHandler)

export default app
