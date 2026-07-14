import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { officialCampusPlanReference } from '../data/seeds/official-campus-plan-reference'
import {
  buildOfficialCampusPlanCurlArgs,
  inspectOfficialCampusPlan,
  officialCampusPlanCurlExecOptions,
  officialCampusPlanCurlExecutable,
  officialCampusPlanCurlMetadataMarker,
  officialCampusPlanRequestInit,
  officialCampusPlanSnapshotMismatches,
  parseOfficialCampusPlanCurlOutput,
  readJpegDimensions
} from './check-official-campus-plan'

function tinyJpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xff, 0xd9
  ])
}

function curlOutput(
  body: Uint8Array,
  metadata: Partial<Record<'http_code' | 'content_type' | 'size_download' | 'etag' | 'last_modified', string>> = {}
): Uint8Array {
  const values = {
    http_code: '200',
    content_type: 'image/jpeg',
    size_download: String(body.byteLength),
    etag: '"fixture"',
    last_modified: 'Tue, 14 Jul 2026 00:00:00 GMT',
    ...metadata
  }
  return Buffer.concat([
    Buffer.from(body),
    Buffer.from([
      officialCampusPlanCurlMetadataMarker,
      `http_code=${values.http_code}\n`,
      `content_type=${values.content_type}\n`,
      `size_download=${values.size_download}\n`,
      `etag=${values.etag}\n`,
      `last_modified=${values.last_modified}\n`
    ].join(''))
  ])
}

test('reads JPEG frame dimensions without decoding or rewriting the official image', () => {
  assert.deepEqual(readJpegDimensions(tinyJpeg(8504, 3898)), {
    width: 8504,
    height: 3898
  })
})
test('reports every snapshot property that requires anchor re-review', () => {
  const bytes = tinyJpeg(640, 480)
  const snapshot = inspectOfficialCampusPlan(bytes, {
    contentType: 'image/png',
    etag: '"changed"',
    lastModified: 'Tue, 14 Jul 2026 00:00:00 GMT'
  })
  assert.equal(snapshot.sha256, createHash('sha256').update(bytes).digest('hex'))
  const mismatches = officialCampusPlanSnapshotMismatches(snapshot)
  assert.ok(mismatches.some(message => message.includes('content type')))
  assert.ok(mismatches.some(message => message.includes('content length')))
  assert.ok(mismatches.some(message => message.includes('SHA-256')))
  assert.ok(mismatches.some(message => message.includes('dimensions')))
  assert.ok(mismatches.some(message => message.includes('ETag')))
  assert.ok(mismatches.some(message => message.includes('Last-Modified')))
})

test('official plan metadata explicitly refuses geographic coordinate semantics', () => {
  assert.equal(officialCampusPlanReference.georeferenced, false)
  assert.equal(officialCampusPlanReference.coordinateSemantics, 'image-relative-only')
  assert.equal(officialCampusPlanReference.verificationScope, 'relative-campus-orientation-only')
  assert.match(officialCampusPlanReference.imageSha256, /^[0-9a-f]{64}$/)
})

test('official plan snapshot uses a full GET without transport compression', () => {
  assert.equal(officialCampusPlanRequestInit.method, 'GET')
  assert.equal(officialCampusPlanRequestInit.cache, 'no-store')
  assert.equal(officialCampusPlanRequestInit.headers['Accept-Encoding'], 'identity')
})

test('transport gzip ETag variants do not invalidate identical image bytes', () => {
  const mismatches = officialCampusPlanSnapshotMismatches({
    contentLength: officialCampusPlanReference.imageContentLength,
    sha256: officialCampusPlanReference.imageSha256,
    width: officialCampusPlanReference.imageWidth,
    height: officialCampusPlanReference.imageHeight,
    contentType: 'image/jpeg',
    etag: officialCampusPlanReference.imageEtag.replace(/"$/, '-gzip"'),
    lastModifiedAt: officialCampusPlanReference.imageLastModifiedAt
  })
  assert.deepEqual(mismatches, [])
})

test('parses binary JPEG bytes separately from curl write-out metadata', () => {
  const bytes = tinyJpeg(8504, 3898)
  const parsed = parseOfficialCampusPlanCurlOutput(curlOutput(bytes, {
    content_type: 'image/jpeg; charset=binary',
    etag: '"fixture-etag"',
    last_modified: 'Thu, 30 Oct 2025 08:54:46 GMT'
  }))

  assert.deepEqual(parsed.bytes, bytes)
  assert.equal(parsed.status, 200)
  assert.equal(parsed.reportedSize, bytes.byteLength)
  assert.equal(parsed.contentType, 'image/jpeg')
  assert.equal(parsed.etag, '"fixture-etag"')
  assert.equal(parsed.lastModified, 'Thu, 30 Oct 2025 08:54:46 GMT')
  assert.deepEqual(readJpegDimensions(parsed.bytes), { width: 8504, height: 3898 })
})

test('rejects curl metadata whose download size differs from emitted body bytes', () => {
  const bytes = tinyJpeg(640, 480)
  assert.throws(
    () => parseOfficialCampusPlanCurlOutput(curlOutput(bytes, { size_download: String(bytes.byteLength + 1) })),
    /reported \d+ downloaded bytes but emitted \d+/
  )
})

test('curl fallback is a bounded direct GET without a shell or HEAD request', () => {
  const args = buildOfficialCampusPlanCurlArgs()
  assert.equal(officialCampusPlanCurlExecutable('win32'), 'curl.exe')
  assert.equal(officialCampusPlanCurlExecutable('linux'), 'curl')
  assert.equal(officialCampusPlanCurlExecOptions.shell, false)
  assert.ok(officialCampusPlanCurlExecOptions.maxBuffer >= officialCampusPlanReference.imageContentLength)
  assert.ok(officialCampusPlanCurlExecOptions.maxBuffer <= 4 * 1024 * 1024)
  assert.deepEqual(args.slice(args.indexOf('--request'), args.indexOf('--request') + 2), ['--request', 'GET'])
  assert.ok(args.includes('--location'))
  assert.ok(args.includes('--fail'))
  assert.ok(args.includes('--max-time'))
  assert.ok(args.includes(`Accept-Encoding: ${officialCampusPlanRequestInit.headers['Accept-Encoding']}`))
  assert.ok(args.includes(officialCampusPlanRequestInit.headers['User-Agent']))
  assert.equal(args.at(-1), officialCampusPlanReference.imageUrl)
  assert.equal(args.includes('--head'), false)
  assert.equal(args.includes('-I'), false)
})
