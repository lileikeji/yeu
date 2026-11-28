import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { probeVideoCodec, videoCodecLabel } from '../server/utils/media-probe'

const sample = join(process.cwd(), 'public', 'media', 'ordinary-dorm-tour.mp4')

test('probeVideoCodec reads the H.264 sample through the real ffprobe binary', async () => {
  const probe = await probeVideoCodec(sample)
  assert.equal(probe.unavailable, false)
  assert.equal(probe.codec, 'h264')
})

test('probeVideoCodec reports unavailable instead of throwing when the source is missing', async () => {
  const probe = await probeVideoCodec(join(process.cwd(), 'public', 'media', 'no-such-file.mp4'))
  assert.equal(probe.unavailable, true)
  assert.equal(probe.codec, null)
})

test('videoCodecLabel names the codecs browsers refuse to decode', () => {
  assert.equal(videoCodecLabel('hevc'), 'H.265（HEVC）')
  assert.equal(videoCodecLabel('H265'), 'H.265（HEVC）')
  assert.equal(videoCodecLabel('av1'), 'AV1')
  assert.equal(videoCodecLabel('mpeg4'), 'MPEG4')
})
