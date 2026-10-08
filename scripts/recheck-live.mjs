// Recheck live assistant answers for problem queries (SSH tunnel 3102 -> 3000)
const BASE = 'http://127.0.0.1:3102/api/public/assistant'
const queries = [
  '在哪抢课',
  '老生什么时候开学',
  '宿舍床尺寸多大',
  '床垫买多大的',
  '电子信息工程新生在哪个教学区上课',
  '仰恩大学考研氛围怎么样？考研率多少？',
  '团员转接需要介绍信吗',
  '普通型宿舍有阳台吗'
]
const delay = (ms) => new Promise(r => setTimeout(r, ms))
for (const q of queries) {
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://yx.huiliyill.cn' },
      body: JSON.stringify({ q, sessionId: 'recheck-' + Date.now() })
    })
    const json = await res.json()
    const answer = (json.answer ?? '').replace(/\s+/g, ' ').slice(0, 220)
    const cites = (json.citations ?? []).map(c => c.title).join(' | ')
    console.log(`Q: ${q}\n  HTTP ${res.status} | mode=${json.mode} | path=${json.retrievalPath} | conf=${json.confidence}\n  A: ${answer}\n  C: ${cites}\n`)
  } catch (e) {
    console.log(`Q: ${q}\n  ERROR: ${e.message}\n`)
  }
  await delay(400)
}
