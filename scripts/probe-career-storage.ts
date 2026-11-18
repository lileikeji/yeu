/**
 * 探测「职业发展平台」的对象存储上传接口。
 * 用法：CAREER_STORAGE_BASE_URL=https://平台域名 CAREER_STORAGE_TOKEN=xxx npx tsx scripts/probe-career-storage.ts
 * 会把常见路径挨个 POST 一个 1KB 的假 mp3，打印状态码与返回体前 200 字，用来确认该用哪个 path、字段名。
 */
const CANDIDATES = [
  '/api/storage/upload',
  '/api/upload',
  '/api/files/upload',
  '/api/v1/upload',
  '/upload',
  '/api/upload/file'
]

async function probe(baseUrl: string, path: string, token: string): Promise<void> {
  const form = new FormData()
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'probe.mp3')
  form.append('path', 'competition/probe.mp3')
  form.append('filename', 'probe.mp3')
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, { method: 'POST', body: form, headers })
    const text = (await response.text()).slice(0, 200).replace(/\s+/g, ' ')
    console.log(`${response.status}  ${path}  ${text}`)
  } catch (error) {
    console.log(`ERR ${path}  ${(error as Error).message}`)
  }
}

async function main(): Promise<void> {
  const baseUrl = (process.env.CAREER_STORAGE_BASE_URL || '').trim()
  if (!baseUrl) {
    console.error('先设 CAREER_STORAGE_BASE_URL（平台的域名，例如 https://career.example.com）')
    process.exitCode = 1
    return
  }
  const token = (process.env.CAREER_STORAGE_TOKEN || '').trim()
  for (const path of CANDIDATES) await probe(baseUrl, path, token)
}

await main()
