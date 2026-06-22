import { Context } from 'hono'

/**
 * 图像理解 API — 调用智谱 GLM-4V
 * 将图片内容转化为详细的中文描述，供视障用户"听见"画面
 * 文档：https://open.bigmodel.cn/dev/api/visual-model
 */

interface DescribeImageBody {
  imageUrl: string
  detailLevel?: 'brief' | 'detailed' | 'comprehensive'
}

const PROMPT_TEMPLATES = {
  brief: '请简要描述这张图片的主要内容，包括主体、场景和整体氛围，50字以内。',
  detailed:
    '请详细描述这张图片，包括：1.整体构图和主体位置 2.色彩和光影 3.人物的表情动作服饰 4.画面氛围和情感。200字左右。',
  comprehensive:
    '请非常详细地描述这张图片，包括：1.整体构图和布局 2.色彩搭配和光影效果 3.人物的表情、动作、服饰细节 4.背景和环境元素 5.画面传达的情感和氛围 6.画面中的细节元素如装饰、道具、文字。请用自然流畅的中文描述，让视障用户能够通过听觉"看见"这幅画面。300字左右。',
}

export async function describeImageHandler(c: Context) {
  const { imageUrl, detailLevel } = await c.req.json<DescribeImageBody>()

  if (!imageUrl) {
    return c.json({ success: false, error: '请提供图片地址' }, 400)
  }

  const apiKey = process.env.ZHIPU_API_KEY
  if (!apiKey) {
    return c.json({ success: false, error: '服务端未配置 API 密钥' }, 500)
  }

  try {
    const promptText =
      PROMPT_TEMPLATES[detailLevel || 'comprehensive'] || PROMPT_TEMPLATES.comprehensive

    // 调用智谱 GLM-4V API
    const response = await fetch(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4v',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
          temperature: 0.3,
          max_tokens: 800,
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('智谱 GLM-4V API 错误:', errText)
      return c.json({ success: false, error: '画面解析失败，请重试' }, 500)
    }

    const data = await response.json()
    const description = data.choices?.[0]?.message?.content

    if (!description) {
      return c.json({ success: false, error: '未能生成画面描述' }, 500)
    }

    return c.json({ success: true, description })
  } catch (err) {
    console.error('图像理解异常:', err)
    return c.json({ success: false, error: '服务异常，请重试' }, 500)
  }
}
