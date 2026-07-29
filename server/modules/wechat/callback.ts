import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual
} from 'node:crypto'

const AES_BLOCK_SIZE = 32
const RANDOM_PREFIX_SIZE = 16
const MESSAGE_LENGTH_SIZE = 4
const MAX_XML_FIELD_LENGTH = 128 * 1024

function requiredText(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`Missing ${label}`)
  return normalized
}

function signatureEquals(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const receivedBuffer = Buffer.from(received.toLowerCase(), 'utf8')
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer)
}

function decodeAesKey(encodingAesKey: string): Buffer {
  const normalized = requiredText(encodingAesKey, 'EncodingAESKey')
  if (!/^[A-Za-z0-9]{43}$/.test(normalized)) throw new Error('Invalid EncodingAESKey')
  const key = Buffer.from(`${normalized}=`, 'base64')
  if (key.length !== 32) throw new Error('Invalid EncodingAESKey')
  return key
}

function removeWechatPadding(value: Buffer): Buffer {
  if (value.length === 0) throw new Error('Invalid encrypted payload')
  const padding = value[value.length - 1]!
  if (padding < 1 || padding > AES_BLOCK_SIZE || padding > value.length) {
    throw new Error('Invalid encrypted payload padding')
  }
  for (let index = value.length - padding; index < value.length; index += 1) {
    if (value[index] !== padding) throw new Error('Invalid encrypted payload padding')
  }
  return value.subarray(0, value.length - padding)
}

function addWechatPadding(value: Buffer): Buffer {
  const remainder = value.length % AES_BLOCK_SIZE
  const padding = remainder === 0 ? AES_BLOCK_SIZE : AES_BLOCK_SIZE - remainder
  return Buffer.concat([value, Buffer.alloc(padding, padding)])
}

export function createWechatCallbackSignature(input: {
  token: string
  timestamp: string
  nonce: string
  encrypted?: string
}): string {
  const parts = [
    requiredText(input.token, 'token'),
    requiredText(input.timestamp, 'timestamp'),
    requiredText(input.nonce, 'nonce')
  ]
  if (input.encrypted) parts.push(requiredText(input.encrypted, 'encrypted payload'))
  return createHash('sha1').update(parts.sort().join('')).digest('hex')
}

export function verifyWechatCallbackSignature(input: {
  token: string
  timestamp: string
  nonce: string
  signature: string
  encrypted?: string
}): boolean {
  const signature = typeof input.signature === 'string' ? input.signature.trim() : ''
  if (!/^[a-f0-9]{40}$/i.test(signature)) return false
  try {
    return signatureEquals(createWechatCallbackSignature(input), signature)
  } catch {
    return false
  }
}

export function decryptWechatPayload(input: {
  encrypted: string
  encodingAesKey: string
  appId: string
}): string {
  const key = decodeAesKey(input.encodingAesKey)
  const encrypted = Buffer.from(requiredText(input.encrypted, 'encrypted payload'), 'base64')
  if (encrypted.length === 0 || encrypted.length % 16 !== 0) {
    throw new Error('Invalid encrypted payload')
  }

  const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
  decipher.setAutoPadding(false)
  const plaintext = removeWechatPadding(Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]))

  if (plaintext.length < RANDOM_PREFIX_SIZE + MESSAGE_LENGTH_SIZE) {
    throw new Error('Invalid encrypted payload')
  }
  const messageLength = plaintext.readUInt32BE(RANDOM_PREFIX_SIZE)
  const messageStart = RANDOM_PREFIX_SIZE + MESSAGE_LENGTH_SIZE
  const messageEnd = messageStart + messageLength
  if (messageLength > MAX_XML_FIELD_LENGTH || messageEnd > plaintext.length) {
    throw new Error('Invalid encrypted payload length')
  }

  const appId = plaintext.subarray(messageEnd).toString('utf8')
  if (appId !== requiredText(input.appId, 'AppID')) throw new Error('AppID mismatch')
  return plaintext.subarray(messageStart, messageEnd).toString('utf8')
}

export function encryptWechatPayload(input: {
  message: string
  encodingAesKey: string
  appId: string
  randomPrefix?: Buffer
}): string {
  const key = decodeAesKey(input.encodingAesKey)
  const message = Buffer.from(input.message, 'utf8')
  if (message.length > MAX_XML_FIELD_LENGTH) throw new Error('Message is too large')
  const randomPrefix = input.randomPrefix ?? randomBytes(RANDOM_PREFIX_SIZE)
  if (randomPrefix.length !== RANDOM_PREFIX_SIZE) throw new Error('Invalid random prefix')
  const length = Buffer.alloc(MESSAGE_LENGTH_SIZE)
  length.writeUInt32BE(message.length)
  const plaintext = addWechatPadding(Buffer.concat([
    randomPrefix,
    length,
    message,
    Buffer.from(requiredText(input.appId, 'AppID'), 'utf8')
  ]))
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64')
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', '\'')
    .replaceAll('&amp;', '&')
}

export function readWechatXmlField(xml: string, field: string): string | null {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(field) || xml.length > MAX_XML_FIELD_LENGTH) return null
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = xml.match(new RegExp(
    `<${escaped}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${escaped}>`,
    'i'
  ))
  const value = match?.[1] ?? match?.[2]
  return typeof value === 'string' ? decodeXmlEntities(value).trim() : null
}

export interface WechatMpTextMessage {
  messageId: string
  toUserName: string
  fromUserName: string
  content: string
}

export function parseWechatMpTextMessage(xml: string): WechatMpTextMessage | null {
  const messageType = readWechatXmlField(xml, 'MsgType')?.toLowerCase()
  if (messageType !== 'text') return null
  const messageId = readWechatXmlField(xml, 'MsgId')
  const toUserName = readWechatXmlField(xml, 'ToUserName')
  const fromUserName = readWechatXmlField(xml, 'FromUserName')
  const content = readWechatXmlField(xml, 'Content')?.replace(/\s+/g, ' ').trim()
  if (
    !messageId
    || !/^\d{1,32}$/.test(messageId)
    || !toUserName
    || !fromUserName
    || !content
  ) {
    return null
  }
  return {
    messageId,
    toUserName: toUserName.slice(0, 160),
    fromUserName: fromUserName.slice(0, 160),
    content: content.slice(0, 300)
  }
}
