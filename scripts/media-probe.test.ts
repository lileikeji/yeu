import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { posterKeyOf } from '../server/utils/cos-storage'
import { captureVideoPoster, posterOffsetFor, probeVideoCodec, probeVideoDuration, videoCodecLabel } from '../server/utils/media-probe'

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

test('captureVideoPoster returns JPEG bytes for the H.264 sample', async () => {
  const poster = await captureVideoPoster(sample, 2)
  assert.ok(poster)
  assert.equal(poster[0], 0xFF)
  assert.equal(poster[1], 0xD8)
  assert.ok(poster.length > 2000)
})

test('captureVideoPoster stays null instead of throwing when the source is missing', async () => {
  const poster = await captureVideoPoster(join(process.cwd(), 'public', 'media', 'no-such-file.mp4'), 1)
  assert.equal(poster, null)
})

test('posterKeyOf keeps the object in the same folder with a jpg suffix', () => {
  assert.equal(
    posterKeyOf('competition/accompaniment/final-2/a/b.mp4'),
    'competition/accompaniment/final-2/a/b.poster.jpg'
  )
  assert.equal(posterKeyOf('x/y.zip'), 'x/y.zip.poster.jpg')
  assert.equal(posterKeyOf('   '), '')
})

test('probeVideoDuration reads the sample length and posterOffsetFor skips the dark intro', async () => {
  const duration = await probeVideoDuration(sample)
  assert.ok(duration && duration > 20)
  assert.equal(posterOffsetFor(null), 5)
  assert.equal(posterOffsetFor(duration), Math.min(Math.max(duration * 0.35, 3), 120))
  assert.equal(posterOffsetFor(100), 35)
  assert.equal(posterOffsetFor(1000), 120)
})
