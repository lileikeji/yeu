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
/** 读时长（秒）；读不到返回 null，封面图就退回固定偏移。 */
export async function probeVideoDuration(source: string, timeoutMs = 15_000): Promise<number | null> {
  try {
    const { stdout } = await run(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nk=1', source],
      { timeout: timeoutMs, windowsHide: true }
    )
    const seconds = Number.parseFloat(stdout.trim().split('\n')[0] || '')
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  } catch {
    return null
  }
}

/** 封面取 35% 位置的画面：MV 开头常是黑底字幕卡，往后一点才是舞台实拍。 */
export function posterOffsetFor(durationSeconds: number | null): number {
  if (!durationSeconds) return 5
  return Math.min(Math.max(durationSeconds * 0.35, 3), 120)
}

/**
 * 抽一帧当封面图（JPEG）。首帧常是黑底字幕卡，所以默认取第 5 秒；
 * 短视频取不到就退回第 0 秒。失败返回 null，封面属于锦上添花，不能拦上传。
 */
export async function captureVideoPoster(
  source: string,
  atSeconds = 5,
  timeoutMs = 20_000
): Promise<Uint8Array | null> {
  const grab = async (offset: number): Promise<Uint8Array | null> => {
    try {
      const { stdout } = await run(
        'ffmpeg',
        [
          '-v', 'error',
          '-ss', String(offset),
          '-i', source,
          '-frames:v', '1',
          '-vf', 'scale=640:-2',
          '-f', 'mjpeg',
          '-q:v', '6',
          'pipe:1'
        ],
        { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'buffer' }
      )
      const bytes = new Uint8Array(stdout as unknown as Buffer)
      // JPEG 以 FF D8 开头；空输出说明这个时间点没帧可取。
      return bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 ? bytes : null
    } catch {
      return null
    }
  }
  return (await grab(atSeconds)) ?? (await grab(0))
}

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
