import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 把任意音频转成 mp3（192k / 44.1k）。
 *
 * 微信内置浏览器（安卓 X5）对 m4a / wav / flac 的支持不稳，实测同一条伴奏在
 * Chrome 能播、微信里点就报错；转成 mp3 是最省事的兼容做法。
 * ffmpeg 不在时返回 null，调用方回落到原文件。
 */
export async function transcodeToMp3(input: Uint8Array, extension = 'bin'): Promise<Uint8Array | null> {
  const dir = await mkdtemp(join(tmpdir(), 'yeu-audio-'))
  const source = join(dir, `input.${extension.replace(/[^a-z0-9]/gi, '') || 'bin'}`)
  const target = join(dir, 'output.mp3')
  try {
    await writeFile(source, input)
    const ok = await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-i', source, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', target])
    if (!ok) return null
    return new Uint8Array(await readFile(target))
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function runFfmpeg(args: string[]): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn('ffmpeg', args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}
