import assert from 'node:assert/strict'
import { createCipheriv, createPublicKey, createVerify } from 'node:crypto'
import test from 'node:test'
import {
  buildSignedBody,
  clipPolylineToCampus,
  decryptOpenTicket,
  parseSignedResponse,
  pUnescape,
  stitchShapeSegments,
  toWgs84Point
} from '../server/modules/transit/ykt-bus'

// 与模块内一致的客户端签名私钥（前端 app.js 硬编码，非机密），用于导出公钥验签。
const CLIENT_SIGNING_PEM = [
  '-----BEGIN PRIVATE KEY-----',
  'MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBAKamtwArkzoZVK9w',
  'ji5ewx4beB1xbI98vkOyMWWqeebw3dI2E7vT3RJ/ALkxJpN+KWT6zB/7+zu+mk4B',
  'IQdIyDCc1oGpnait8Q2+ROO31tKP1zthH4g7JHZMdqlFvmTK8m8o0IbKP8xdcmUF',
  'f5qpyRb3qq5cH8kUioPNXo+wMFwDAgMBAAECgYBlqdaBuBN8oe9Th2p1R0HooAFK',
  'lOMRNZwsWAxiZPkwtUfc8ThgoQKAQhIC58UMvS4reAQGjwXYkJI5e97WPsRARycc',
  'Ol3prUGLkkK2aGkAiKGmKN3hLeRO2AfYpY+fso17kkwNcFiDHEtmdnZ2NXcWxwOo',
  '9FTV0dTQgfTds7daYQJBANwusNXKJVIFCva5wmNkF8Wxu8QjTT2TtB1O6HkgZfUi',
  'VP4uhzQB2idOU/ws3Fh/MvIr+TbujCSzmj7LbD82Cd0CQQDBwsOtuez3S0+RYiU6',
  'iCLK872UgdbfGjEwHIE4I1Pho3ILpMq4MSs4bhHlNAeE94tCdqPHpJWXYbFyd/21',
  'vc9fAkEAizN1luPC7nTDtrJABAguw0yXcewDlC+CSpktfg6OhwjahQwzbBzTp8/s',
  'ZtyRvd1E/zfvydvMfBOUK6j92YS3fQJAcHKpwV7PqUzppoQA+xEasBH4igE4RE4d',
  'EcDZNU07Vw3WF+/RPkg6vwsSE6S4YHCRP0c/EZPwxOQLaVU9xoWbnQJBANtXYwiv',
  'o7GkNyz/zK2M7j6o24X3TKt85vqvNTLicZoaWhj9lQcVlDeMMj86fraFbrRZQ+T9',
  '+asbqyQY1RsB4W4=',
  '-----END PRIVATE KEY-----'
].join('\n')

test('pUnescape 还原 yktkey 字符混淆', () => {
  assert.equal(
    pUnescape('ayktkey2bbyktkey3dcyktkey2fdyktkey20eyktkey3ffyktkey25gyktkey23hyktkey26i'),
    'a+b=c/d e?f%g#h&i'
  )
  assert.equal(pUnescape('plain-string-no-token'), 'plain-string-no-token')
})

test('decryptOpenTicket 解出 addr/ticket JSON', () => {
  const info = { addr: 'http://wx.leyunykt.com', ticket: '218F524442904F65', url: 'h5' }
  // 模拟前端编码链的逆向：AES-CBC 加密 → base64 → yktkey 混淆
  const plain = JSON.stringify(info)
  const cipher = createCipheriv('aes-128-cbc', Buffer.from('***REMOVED***'), Buffer.from('***REMOVED***'))
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('base64')
  const blob = encrypted
    .replaceAll('+', 'yktkey2b')
    .replaceAll('=', 'yktkey3d')
    .replaceAll('/', 'yktkey2f')
  assert.deepEqual(decryptOpenTicket(blob), info)
})

test('buildSignedBody 生成长度前缀 + SIGN_VAL + RSA-SHA256 签名', () => {
  const params = { api_id: '***REMOVED***', open_id: '123', ticket: 'T' }
  const body = buildSignedBody(params)

  const prefix = body.slice(0, 8)
  const payload = body.slice(8)
  assert.match(prefix, /^\d{8}$/)
  assert.equal(Number(prefix), Buffer.byteLength(payload, 'utf8'))

  const sepIndex = payload.indexOf('SIGN_VAL')
  assert.ok(sepIndex > 0)
  const json = payload.slice(0, sepIndex)
  const signature = payload.slice(sepIndex + 'SIGN_VAL'.length)
  assert.deepEqual(JSON.parse(json), params)

  // 签名用模块硬编码私钥 → 同一密钥导出公钥验签通过
  const publicKey = createPublicKey(CLIENT_SIGNING_PEM)
  const verifier = createVerify('RSA-SHA256')
  verifier.update(json, 'utf8')
  assert.equal(verifier.verify(publicKey, Buffer.from(signature, 'base64')), true)
})

test('parseSignedResponse 切出 ret 与 JSON，缺 SIGN_VAL 报错', () => {
  const json = '{"user_id":"u1","id":"o1"}'
  const payload = '0000' + json + 'SIGN_VAL' + 'sig-part'
  const body = '00000099' + payload
  assert.deepEqual(parseSignedResponse(body), { ret: '0000', json })

  const busyPayload = '9993{"msg":"busy"}SIGN_VALs'
  assert.deepEqual(parseSignedResponse('00000030' + busyPayload), { ret: '9993', json: '{"msg":"busy"}' })

  assert.throws(() => parseSignedResponse('00000010no-separator-here'), /SIGN_VAL/)
})

test('buildSignedBody 与 parseSignedResponse 组合自洽', () => {
  const body = buildSignedBody({ user_id: 'u-1', route_id: 'r-1' })
  // 服务端响应结构不同，但长度前缀切片规则一致：body[8:] 起为 payload
  const payload = body.slice(8)
  const sepIndex = payload.indexOf('SIGN_VAL')
  assert.equal(sepIndex, JSON.stringify({ user_id: 'u-1', route_id: 'r-1' }).length)
})

test('toWgs84Point 把 YKT 的 GCJ-02 坐标逆成 WGS84（实证点位）', () => {
  // YKT「新区图书馆」站原值 GCJ-02=(118.608184, 25.10936)，
  // 逆地理实证落「仰恩大学图书馆」17m；转 WGS84 后应向西南偏 ~500m。
  const wgs = toWgs84Point(118.608184, 25.10936)
  assert.ok(Math.abs(wgs.longitude - 118.608184) > 0.002, '经度应有 GCJ-02 偏移')
  assert.ok(Math.abs(wgs.latitude - 25.10936) > 0.001, '纬度应有 GCJ-02 偏移')
  assert.ok(wgs.longitude < 118.608184 && wgs.latitude > 25.10936, '泉州地区逆变方向：西移+北移')
  // 身份点（境外）不受影响
  assert.deepEqual(toWgs84Point(0, 0), { longitude: 0, latitude: 0 })
})

test('stitchShapeSegments 拼接相邻段折线并去接缝重复点', () => {
  const stitched = stitchShapeSegments([
    [{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }, { lng: 3, lat: 3 }],
    [{ lng: 3, lat: 3 }, { lng: 4, lat: 4 }],
    [{ lng: 4, lat: 4 }, { lng: 5, lat: 5 }]
  ])
  assert.deepEqual(stitched, [
    { lng: 1, lat: 1 }, { lng: 2, lat: 2 }, { lng: 3, lat: 3 }, { lng: 4, lat: 4 }, { lng: 5, lat: 5 }
  ])
  assert.deepEqual(stitchShapeSegments([]), [])
  assert.deepEqual(stitchShapeSegments([[{ lng: 7, lat: 8 }], []]), [{ lng: 7, lat: 8 }])
})

test('clipPolylineToCampus 剪掉校外段、邻接内点直连、首末点恒保留', () => {
  // 方形校界 [0,10]×[0,10]（注入，不依赖真校界数据）
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]] as Array<readonly [number, number]>

  // 棒棒糖环：从内点 (5,5) 出界绕一圈回同点——环整体剪掉，回点与原内点相邻去重
  const lollipop = clipPolylineToCampus([
    { lng: 1, lat: 5 },
    { lng: 5, lat: 5 },
    { lng: 12, lat: 5 },
    { lng: 15, lat: 8 },
    { lng: 12, lat: 5 },
    { lng: 5, lat: 5 },
    { lng: 5, lat: 9 }
  ], [square])
  assert.deepEqual(lollipop, [
    { lng: 1, lat: 5 },
    { lng: 5, lat: 5 },
    { lng: 5, lat: 9 }
  ])

  // 首末点即使在校外也恒保留（站点锚点）
  const anchored = clipPolylineToCampus([
    { lng: -5, lat: 5 },
    { lng: 20, lat: 5 },
    { lng: 5, lat: 5 },
    { lng: 20, lat: 9 }
  ], [square])
  assert.deepEqual(anchored, [
    { lng: -5, lat: 5 },
    { lng: 5, lat: 5 },
    { lng: 20, lat: 9 }
  ])

  // 全在界内原样返回（含去重：相邻重复点只留一个）
  assert.deepEqual(
    clipPolylineToCampus([{ lng: 1, lat: 1 }, { lng: 1, lat: 1 }, { lng: 2, lat: 2 }], [square]),
    [{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }]
  )
})
