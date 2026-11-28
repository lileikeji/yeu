import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface VideoCodecProbe {
  /** ffprobe 识别出的视频轨编码，全小写；读不到就是 null。 */
  codec: string | null
  /** ffprobe 不可用（没装、超时、文件读不了）：调用方据此选择放行，不能因此拦住选手。 */
  unavailable: boolean
}

/** 浏览器真正能放的只有 H.264；这几个编码在 Windows Chrome / 安卓上会黑屏或只有声音。 */
const CODEC_LABEL: Record<string, string> = {
  hevc: 'H.265（HEVC）',
  h265: 'H.265（HEVC）',
  av1: 'AV1',
  vp9: 'VP9',
  prores: 'ProRes'
}

export function videoCodecLabel(codec: string): string {
  return CODEC_LABEL[codec.toLowerCase()] ?? codec.toUpperCase()
}

/**
 * 用 ffprobe 读视频轨编码。传 https URL 时 ffprobe 只按范围请求读容器头，不拉整个文件。
 */
export async function probeVideoCodec(source: string, timeoutMs = 15_000): Promise<VideoCodecProbe> {
  try {
    const { stdout } = await run(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name',
        '-of', 'default=noprint_wrappers=1:nk=1',
        source
      ],
      { timeout: timeoutMs, windowsHide: true }
    )
    const codec = stdout.trim().split('\n')[0]?.trim().toLowerCase()
    return { codec: codec || null, unavailable: false }
  } catch {
    return { codec: null, unavailable: true }
  }
}
