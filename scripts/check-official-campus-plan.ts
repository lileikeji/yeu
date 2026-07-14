import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { setDefaultResultOrder } from 'node:dns'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { officialCampusPlanReference } from '../data/seeds/official-campus-plan-reference'

setDefaultResultOrder('ipv4first')

export interface OfficialCampusPlanSnapshot {
  contentLength: number
  sha256: string
  width: number
  height: number
  contentType: string | null
  etag: string | null
  lastModifiedAt: string | null
}

export const officialCampusPlanRequestInit = {
  method: 'GET',
  cache: 'no-store',
  headers: {
    'Accept-Encoding': 'identity',
    'User-Agent': 'YEU-Freshman-Guide/0.1 (https://gitee.com/lilei1529/yeu)'
  }
} as const

export const officialCampusPlanCurlMetadataMarker = '\nYEU_CAMPUS_PLAN_CURL_METADATA_V1\n'

export const officialCampusPlanCurlExecOptions = {
  encoding: null,
  maxBuffer: 2 * 1024 * 1024,
  shell: false,
  windowsHide: true
} as const

const officialCampusPlanCurlWriteOut = [
  officialCampusPlanCurlMetadataMarker,
  'http_code=%{http_code}\n',
  'content_type=%{content_type}\n',
  'size_download=%{size_download}\n',
  'etag=%header{etag}\n',
  'last_modified=%header{last-modified}\n'
].join('')

export interface OfficialCampusPlanCurlOutput {
  bytes: Uint8Array
  contentType: string | null
  etag: string | null
  lastModified: string | null
  reportedSize: number
  status: number
}

export function officialCampusPlanCurlExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'curl.exe' : 'curl'
}

export function buildOfficialCampusPlanCurlArgs(): string[] {
  return [
    '--request',
    'GET',
    '--location',
    '--max-redirs',
    '5',
    '--fail',
    '--silent',
    '--show-error',
    '--max-time',
    '30',
    '--proto',
    '=https',
    '--proto-redir',
    '=https',
    '--header',
    `Accept-Encoding: ${officialCampusPlanRequestInit.headers['Accept-Encoding']}`,
    '--user-agent',
    officialCampusPlanRequestInit.headers['User-Agent'],
    '--output',
    '-',
    '--write-out',
    officialCampusPlanCurlWriteOut,
    officialCampusPlanReference.imageUrl
  ]
}

function requiredCurlMetadata(
  metadata: ReadonlyMap<string, string>,
  key: string
): string {
  const value = metadata.get(key)
  if (value === undefined) throw new Error(`curl metadata is missing ${key}`)
  return value
}

export function parseOfficialCampusPlanCurlOutput(output: Uint8Array): OfficialCampusPlanCurlOutput {
  const buffer = Buffer.from(output.buffer, output.byteOffset, output.byteLength)
  const marker = Buffer.from(officialCampusPlanCurlMetadataMarker, 'utf8')
  const markerOffset = buffer.lastIndexOf(marker)
  if (markerOffset < 0) throw new Error('curl output is missing the campus plan metadata marker')

  const metadataText = buffer.subarray(markerOffset + marker.byteLength).toString('utf8')
  const metadata = new Map<string, string>()
  for (const line of metadataText.split(/\r?\n/)) {
    if (!line) continue
    const separatorOffset = line.indexOf('=')
    if (separatorOffset < 1) throw new Error(`curl metadata contains an invalid line: ${line}`)
    const key = line.slice(0, separatorOffset)
    if (metadata.has(key)) throw new Error(`curl metadata contains duplicate ${key}`)
    metadata.set(key, line.slice(separatorOffset + 1).trim())
  }

  const statusText = requiredCurlMetadata(metadata, 'http_code')
  if (!/^\d{3}$/.test(statusText)) throw new Error(`curl reported an invalid HTTP status: ${statusText}`)
  const status = Number(statusText)

  const reportedSizeText = requiredCurlMetadata(metadata, 'size_download')
  if (!/^\d+$/.test(reportedSizeText)) {
    throw new Error(`curl reported an invalid download size: ${reportedSizeText}`)
  }
  const reportedSize = Number(reportedSizeText)
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, markerOffset)
  if (!Number.isSafeInteger(reportedSize) || reportedSize !== bytes.byteLength) {
    throw new Error(`curl reported ${reportedSizeText} downloaded bytes but emitted ${bytes.byteLength}`)
  }

  const contentType = requiredCurlMetadata(metadata, 'content_type').split(';')[0]?.trim() || null
  const etag = requiredCurlMetadata(metadata, 'etag') || null
  const lastModified = requiredCurlMetadata(metadata, 'last_modified') || null
  return { bytes, contentType, etag, lastModified, reportedSize, status }
}

function assertJpeg(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function normalizedHttpDate(value: string | null): string | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function normalizedEntityTag(value: string | null): string | null {
  return value?.replace(/-gzip(?="?$)/, '') ?? null
}

export function readJpegDimensions(bytes: Uint8Array): { width: number, height: number } {
  assertJpeg(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8, 'Campus plan is not a JPEG')
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
  ])

  let offset = 2
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) break

    const marker = bytes[offset]!
    offset += 1
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue
    assertJpeg(offset + 1 < bytes.length, 'Campus plan has a truncated JPEG marker')
    const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!
    assertJpeg(segmentLength >= 2 && offset + segmentLength <= bytes.length, 'Campus plan has an invalid JPEG segment')

    if (startOfFrameMarkers.has(marker)) {
      assertJpeg(segmentLength >= 7, 'Campus plan has a truncated JPEG frame')
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!
      assertJpeg(width > 0 && height > 0, 'Campus plan has invalid JPEG dimensions')
      return { width, height }
    }

    offset += segmentLength
  }

  throw new Error('Campus plan JPEG has no supported frame header')
}

export function inspectOfficialCampusPlan(
  bytes: Uint8Array,
  headers: {
    contentType?: string | null
    etag?: string | null
    lastModified?: string | null
  } = {}
): OfficialCampusPlanSnapshot {
  const dimensions = readJpegDimensions(bytes)
  return {
    contentLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...dimensions,
    contentType: headers.contentType ?? null,
    etag: headers.etag ?? null,
    lastModifiedAt: normalizedHttpDate(headers.lastModified ?? null)
  }
}

export function officialCampusPlanSnapshotMismatches(snapshot: OfficialCampusPlanSnapshot): string[] {
  const mismatches: string[] = []
  if (snapshot.contentType && snapshot.contentType !== 'image/jpeg') {
    mismatches.push(`content type changed to ${snapshot.contentType}`)
  }
  if (snapshot.contentLength !== officialCampusPlanReference.imageContentLength) {
    mismatches.push(`content length changed to ${snapshot.contentLength}`)
  }
  if (snapshot.sha256 !== officialCampusPlanReference.imageSha256) {
    mismatches.push(`SHA-256 changed to ${snapshot.sha256}`)
  }
  if (snapshot.width !== officialCampusPlanReference.imageWidth
    || snapshot.height !== officialCampusPlanReference.imageHeight) {
    mismatches.push(`dimensions changed to ${snapshot.width}x${snapshot.height}`)
  }
  if (snapshot.etag
    && normalizedEntityTag(snapshot.etag) !== normalizedEntityTag(officialCampusPlanReference.imageEtag)) {
    mismatches.push(`ETag changed to ${snapshot.etag}`)
  }
  if (snapshot.lastModifiedAt
    && snapshot.lastModifiedAt !== officialCampusPlanReference.imageLastModifiedAt) {
    mismatches.push(`Last-Modified changed to ${snapshot.lastModifiedAt}`)
  }
  return mismatches
}

interface OfficialCampusPlanTransfer {
  bytes: Uint8Array
  contentType: string | null
  etag: string | null
  lastModified: string | null
}

function describeTransferError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function downloadOfficialCampusPlanWithCurl(): Promise<OfficialCampusPlanTransfer> {
  const output = await new Promise<Uint8Array>((resolveDownload, rejectDownload) => {
    execFile(
      officialCampusPlanCurlExecutable(),
      buildOfficialCampusPlanCurlArgs(),
      officialCampusPlanCurlExecOptions,
      (error, stdout, stderr) => {
        if (error) {
          const detail = Buffer.from(stderr).toString('utf8').trim().slice(0, 1_000)
          rejectDownload(new Error(`curl exited unsuccessfully${detail ? `: ${detail}` : ''}`, { cause: error }))
          return
        }
        resolveDownload(Buffer.from(stdout))
      }
    )
  })
  const parsed = parseOfficialCampusPlanCurlOutput(output)
  if (parsed.status < 200 || parsed.status >= 300) {
    throw new Error(`Official campus plan returned HTTP ${parsed.status} through curl`)
  }
  return parsed
}

async function curlFallbackAfterFetchFailure(fetchError: unknown): Promise<OfficialCampusPlanTransfer> {
  try {
    return await downloadOfficialCampusPlanWithCurl()
  } catch (curlError) {
    throw new Error(
      `Official campus plan transfer failed with fetch (${describeTransferError(fetchError)}) and curl (${describeTransferError(curlError)})`,
      { cause: curlError }
    )
  }
}

function validatedOfficialCampusPlanSnapshot(transfer: OfficialCampusPlanTransfer): OfficialCampusPlanSnapshot {
  const snapshot = inspectOfficialCampusPlan(transfer.bytes, transfer)
  const mismatches = officialCampusPlanSnapshotMismatches(snapshot)
  if (mismatches.length) {
    throw new Error(`Official campus plan changed; re-review every image anchor before updating metadata: ${mismatches.join('; ')}`)
  }
  return snapshot
}

export async function checkOfficialCampusPlan(): Promise<OfficialCampusPlanSnapshot> {
  let response: Response
  try {
    response = await fetch(officialCampusPlanReference.imageUrl, officialCampusPlanRequestInit)
  } catch (fetchError) {
    const transfer = await curlFallbackAfterFetchFailure(fetchError)
    return validatedOfficialCampusPlanSnapshot(transfer)
  }
  if (!response.ok) throw new Error(`Official campus plan returned HTTP ${response.status}`)
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch (fetchError) {
    const transfer = await curlFallbackAfterFetchFailure(fetchError)
    return validatedOfficialCampusPlanSnapshot(transfer)
  }
  return validatedOfficialCampusPlanSnapshot({
    bytes,
    contentType: response.headers.get('content-type')?.split(';')[0]?.trim() ?? null,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified')
  })
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (executedDirectly) {
  try {
    const snapshot = await checkOfficialCampusPlan()
    process.stdout.write(`${JSON.stringify({
      ok: true,
      source: officialCampusPlanReference.imageUrl,
      verificationScope: officialCampusPlanReference.verificationScope,
      ...snapshot
    }, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
