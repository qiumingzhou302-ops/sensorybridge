import { Context } from 'hono'

/**
 * 指令理解 API — 调用 DeepSeek
 * 将用户的语音修改指令解析为新的文生图 prompt
 * 例如："把背景换成森林" + 当前prompt → 新的完整 prompt
 */

interface ParseCommandBody {
  command: string
  currentPrompt?: string
}

const SYSTEM_PROMPT = `你是一个 AI 绘画指令解析助手。用户正在用 AI 生成图片，现在想通过语音指令修改画面。
你的任务是将用户的修改指令和当前的图片描述，合并成一个新的、完整的英文绘画 prompt。

规则：
1. 保留用户未提及的部分
2. 根据修改指令调整对应内容
3. 输出纯英文 prompt，不要有任何解释
4. prompt 应该详细、具象，适合 AI 绘图模型

示例：
当前描述：a girl standing on the beach at sunset, wearing a white dress
修改指令：把背景换成森林
输出：a girl standing in a forest, wearing a white dress, sunlight filtering through trees

当前描述：a cat sitting on a windowsill
修改指令：改成水彩画风格
输出：a cat sitting on a windowsill, watercolor painting style, soft colors`

export async function parseCommandHandler(c: Context) {
  const { command, currentPrompt } = await c.req.json<ParseCommandBody>()

  if (!command || !command.trim()) {
    return c.json({ success: false, error: '请提供修改指令' }, 400)
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return c.json({ success: false, error: '服务端未配置 API 密钥' }, 500)
  }

  try {
    const userMessage = currentPrompt
      ? `当前描述：${currentPrompt}\n修改指令：${command}`
      : `修改指令：${command}`

    // 调用 DeepSeek API
    const response = await fetch(
      'https://api.deepseek.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 300,
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('DeepSeek API 错误:', errText)
      return c.json({ success: false, error: '指令理解失败，请重试' }, 500)
    }

    const data = await response.json()
    const newPrompt = data.choices?.[0]?.message?.content?.trim()

    if (!newPrompt) {
      return c.json({ success: false, error: '未能生成新的描述' }, 500)
    }

    return c.json({
      success: true,
      action: 'modify',
      newPrompt,
    })
  } catch (err) {
    console.error('指令理解异常:', err)
    return c.json({ success: false, error: '服务异常，请重试' }, 500)
  }
}
