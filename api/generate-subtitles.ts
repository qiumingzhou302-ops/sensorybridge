import { Context } from 'hono'

/**
 * 字幕生成 API — 调用阿里云百炼 Paraformer 录音文件识别
 * 复用 DASHSCOPE_API_KEY，无需额外注册讯飞
 * 文档：https://help.aliyun.com/zh/model-studio/paraformer-recorded-speech-recognition-restful-api
 *
 * 流程：前端上传 base64 音频 → 后端上传到百炼获取 URL → 提交转写任务 → 轮询结果 → 解析字幕
 */

interface SubtitleEntry {
  start: number // 秒
  end: number
  text: string
}

export async function generateSubtitlesHandler(c: Context) {
  const apiKey = process.env.DASHSCOPE_API_KEY
  if (!apiKey) {
    return c.json({ success: false, error: '服务端未配置 DASHSCOPE_API_KEY' }, 500)
  }

  // 接收 base64 编码的音频
  const { audioBase64, fileName } = await c.req.json<{ audioBase64: string; fileName: string }>()

  if (!audioBase64) {
    return c.json({ success: false, error: '请提供音频数据' }, 400)
  }

  try {
    // 1. 上传音频文件到百炼，获取可访问的 URL
    const fileUrl = await uploadFileToDashScope(apiKey, audioBase64, fileName)

    if (!fileUrl) {
      return c.json({ success: false, error: '音频上传失败，请重试' }, 500)
    }

    // 2. 提交录音文件识别任务
    const taskId = await submitTranscriptionTask(apiKey, fileUrl)

    if (!taskId) {
      return c.json({ success: false, error: '识别任务提交失败，请重试' }, 500)
    }

    // 3. 轮询任务结果
    const transcriptionUrl = await pollTranscriptionResult(apiKey, taskId)

    if (!transcriptionUrl) {
      return c.json({ success: false, error: '识别超时，请重试' }, 504)
    }

    // 4. 获取识别结果 JSON
    const resultJson = await fetch(transcriptionUrl).then((r) => r.json())

    // 5. 解析为字幕格式
    const subtitles = parseTranscriptionToSubtitles(resultJson)

    if (subtitles.length === 0) {
      return c.json({ success: false, error: '未识别到语音内容，请确认音频包含清晰的人声' }, 422)
    }

    return c.json({ success: true, subtitles })
  } catch (err) {
    console.error('字幕生成异常:', err)
    return c.json({ success: false, error: '服务异常，请重试' }, 500)
  }
}

/**
 * 上传文件到百炼临时存储，获取 oss:// 临时 URL（有效期 48 小时）
 * 文档：https://help.aliyun.com/zh/model-studio/get-temporary-file-url
 *
 * 流程：
 *   1. GET /api/v1/uploads?action=getPolicy&model=paraformer-v2  获取上传凭证
 *   2. POST 到 oss upload_host，使用 multipart/form-data 上传文件
 *   3. 拼接 oss://{upload_dir}/{fileName} 作为 file_url
 * 调用转写接口时必须携带 Header: X-DashScope-OssResourceResolve: enable
 */
async function uploadFileToDashScope(
  apiKey: string,
  audioBase64: string,
  fileName: string
): Promise<string | null> {
  const audioBuffer = Buffer.from(audioBase64, 'base64')

  // 1. 获取上传凭证（注意：是 GET 请求，参数通过 query 传递）
  const credentialRes = await fetch(
    `https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=paraformer-v2`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  )

  if (!credentialRes.ok) {
    console.error('获取上传凭证失败:', await credentialRes.text())
    return null
  }

  const credentialJson = await credentialRes.json()
  const policy = credentialJson.data || {}

  const uploadHost = policy.upload_host
  const uploadDir = policy.upload_dir

  if (!uploadHost || !uploadDir) {
    console.error('上传凭证缺少必要字段:', credentialJson)
    return null
  }

  // 2. 构造 OSS multipart 表单并上传
  const key = `${uploadDir}/${fileName}`
  const formData = new FormData()
  formData.append('OSSAccessKeyId', policy.oss_access_key_id || '')
  formData.append('Signature', policy.signature || '')
  formData.append('policy', policy.policy || '')
  formData.append('x-oss-object-acl', policy.x_oss_object_acl || '')
  formData.append('x-oss-forbid-overwrite', policy.x_oss_forbid_overwrite || '')
  formData.append('key', key)
  formData.append('success_action_status', '200')
  formData.append('file', new Blob([audioBuffer]), fileName)

  const uploadRes = await fetch(uploadHost, {
    method: 'POST',
    body: formData,
  })

  if (!uploadRes.ok) {
    console.error('文件上传失败:', await uploadRes.text())
    return null
  }

  // 3. 返回 oss:// 形式的临时 URL
  return `oss://${key}`
}

/**
 * 提交录音文件识别任务
 */
async function submitTranscriptionTask(
  apiKey: string,
  fileUrl: string
): Promise<string | null> {
  const response = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        // 使用 oss:// 临时 URL 时必须携带此 Header，否则无法解析
        'X-DashScope-OssResourceResolve': 'enable',
      },
      body: JSON.stringify({
        model: 'paraformer-v2',
        input: {
          file_urls: [fileUrl],
        },
        parameters: {
          language_hints: ['zh', 'en'],
          disfluency_removal_enabled: false,
          timestamp_alignment_enabled: true,
        },
      }),
    }
  )

  if (!response.ok) {
    console.error('提交转写任务失败:', await response.text())
    return null
  }

  const data = await response.json()
  return data.output?.task_id || null
}

/**
 * 轮询转写任务结果
 */
async function pollTranscriptionResult(
  apiKey: string,
  taskId: string
): Promise<string | null> {
  const maxRetries = 60
  const interval = 3000 // 3秒

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
      // 获取识别结果 URL
      const results = data.output?.results
      if (results && results.length > 0) {
        const transcriptionUrl = results[0].transcription_url
        if (transcriptionUrl) {
          return transcriptionUrl
        }
        // 检查是否有错误
        if (results[0].subtask_status === 'FAILED') {
          console.error('子任务失败:', results[0].message)
          return null
        }
      }
      return null
    }

    if (status === 'FAILED') {
      console.error('转写任务失败:', data)
      return null
    }
    // PENDING / RUNNING 继续轮询
  }

  return null
}

/**
 * 解析百炼转写结果为字幕格式
 * 百炼返回 sentences 数组，每个包含 begin_time/end_time（毫秒）和 text
 */
function parseTranscriptionToSubtitles(result: any): SubtitleEntry[] {
  const subtitles: SubtitleEntry[] = []

  const transcripts = result?.transcripts || []

  for (const transcript of transcripts) {
    const sentences = transcript?.sentences || []
    for (const sentence of sentences) {
      const text = sentence.text?.trim()
      if (!text) continue

      subtitles.push({
        start: (sentence.begin_time || 0) / 1000, // 毫秒转秒
        end: (sentence.end_time || 0) / 1000,
        text,
      })
    }
  }

  return subtitles
}
