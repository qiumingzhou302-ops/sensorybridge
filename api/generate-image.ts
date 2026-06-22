import { Context } from 'hono'

/**
 * 文生图 API — 调用阿里云通义万相（Wanx）
 * 文档：https://help.aliyun.com/zh/dashscope/developer-reference/api-details-9
 */

interface GenerateImageBody {
  prompt: string
  style?: string
  size?: string
}

export async function generateImageHandler(c: Context) {
  const { prompt, style, size } = await c.req.json<GenerateImageBody>()

  if (!prompt || !prompt.trim()) {
    return c.json({ success: false, error: '请提供创意描述' }, 400)
  }

  const apiKey = process.env.DASHSCOPE_API_KEY
  if (!apiKey) {
    return c.json({ success: false, error: '服务端未配置 API 密钥' }, 500)
  }

  try {
    // 调用通义万相 API
    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: 'wanx-v1',
          input: {
            prompt: prompt.trim(),
          },
          parameters: {
            style: style || '<photography>',
            size: size || '1024*1024',
            n: 1,
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('通义万相 API 错误:', errText)
      return c.json({ success: false, error: '图片生成失败，请重试' }, 500)
    }

    const data = await response.json()

    // 通义万相是异步 API，需要轮询任务状态
    const taskId = data.output?.task_id
    if (!taskId) {
      return c.json({ success: false, error: '生成任务创建失败' }, 500)
    }

    // 轮询任务结果（最多等待 60 秒）
    const imageUrl = await pollTaskResult(taskId, apiKey)

    if (!imageUrl) {
      return c.json({ success: false, error: '生成超时，请重试' }, 504)
    }

    return c.json({ success: true, imageUrl })
  } catch (err) {
    console.error('文生图异常:', err)
    return c.json({ success: false, error: '服务异常，请重试' }, 500)
  }
}

/** 轮询通义万相任务结果 */
async function pollTaskResult(taskId: string, apiKey: string): Promise<string | null> {
  const maxRetries = 30
  const interval = 2000 // 2 秒

  for (let i = 0; i < maxRetries; i++) {
    await new Promise((resolve) => setTimeout(resolve, interval))

    const response = await fetch(
      `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
      {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }
    )

    if (!response.ok) continue

    const data = await response.json()
    const status = data.output?.task_status

    if (status === 'SUCCEEDED') {
      const url = data.output?.results?.[0]?.url
      return url || null
    }

    if (status === 'FAILED') {
      return null
    }
    // PENDING / RUNNING 继续轮询
  }

  return null
}
