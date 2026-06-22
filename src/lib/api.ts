/**
 * API 客户端 — 调用 Serverless 后端接口
 * 所有 AI 能力通过后端 API 调用，密钥不暴露给前端
 * 开发环境直连 3001 端口，生产环境用相对路径
 */
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api'

/** 文生图请求 */
export interface GenerateImageRequest {
  prompt: string
  style?: string
  size?: string
}

/** 文生图响应 */
export interface GenerateImageResponse {
  success: boolean
  imageUrl?: string
  error?: string
}

/** 图像理解请求 */
export interface DescribeImageRequest {
  imageUrl: string
  detailLevel?: 'brief' | 'detailed' | 'comprehensive'
}

/** 图像理解响应 */
export interface DescribeImageResponse {
  success: boolean
  description?: string
  error?: string
}

/** 指令理解请求 */
export interface ParseCommandRequest {
  command: string
  currentPrompt?: string
}

/** 指令理解响应 */
export interface ParseCommandResponse {
  success: boolean
  action?: string
  newPrompt?: string
  error?: string
}

/** 字幕条目 */
export interface SubtitleEntry {
  start: number // 秒
  end: number
  text: string
}

/** 字幕生成请求 */
export interface GenerateSubtitlesRequest {
  audioBase64: string
  fileName: string
}

/** 字幕生成响应 */
export interface GenerateSubtitlesResponse {
  success: boolean
  subtitles?: SubtitleEntry[]
  error?: string
}

/** 文生图 — 调用通义万相 */
export async function generateImage(
  req: GenerateImageRequest
): Promise<GenerateImageResponse> {
  try {
    const res = await fetch(`${API_BASE}/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    return await res.json()
  } catch (err) {
    return { success: false, error: '网络请求失败，请检查网络连接' }
  }
}

/** 图像理解 — 调用智谱 GLM-4V */
export async function describeImage(
  req: DescribeImageRequest
): Promise<DescribeImageResponse> {
  try {
    const res = await fetch(`${API_BASE}/describe-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    return await res.json()
  } catch (err) {
    return { success: false, error: '网络请求失败，请检查网络连接' }
  }
}

/** 指令理解 — 调用 DeepSeek */
export async function parseCommand(
  req: ParseCommandRequest
): Promise<ParseCommandResponse> {
  try {
    const res = await fetch(`${API_BASE}/parse-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    return await res.json()
  } catch (err) {
    return { success: false, error: '网络请求失败，请检查网络连接' }
  }
}

/** 字幕生成 — 调用讯飞录音文件识别 */
export async function generateSubtitles(
  req: GenerateSubtitlesRequest
): Promise<GenerateSubtitlesResponse> {
  try {
    const res = await fetch(`${API_BASE}/generate-subtitles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    return await res.json()
  } catch (err) {
    return { success: false, error: '网络请求失败，请检查网络连接' }
  }
}
