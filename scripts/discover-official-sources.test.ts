import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_OFFICIAL_SOURCE_KEYWORDS,
  discoverOfficialSources,
  parseCliKeywords,
  type OfficialSourceDiscoveryOptions
} from './discover-official-sources'

function response(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers })
}

test('default official source keywords cover the current freshman information gaps', () => {
  assert.deepEqual([...DEFAULT_OFFICIAL_SOURCE_KEYWORDS], [
    '校园卡',
    '一卡通',
    '快递',
    '外卖',
    '新生 接站',
    '社团 招新',
    '公交',
    '交通',
    '录取通知书',
    '迎新'
  ])
  assert.equal(parseCliKeywords([]), undefined)
  assert.deepEqual(parseCliKeywords(['--keyword', '校园卡', '--keyword', '2026 新生']), ['校园卡', '2026 新生'])
  assert.throws(() => parseCliKeywords(['--keyword']), /requires a value/)
  assert.throws(() => parseCliKeywords(['--unknown']), /Unknown argument/)
})

test('official source discovery follows the public search form and parses candidates', async () => {
  const calls: Array<{ url: string, init?: RequestInit }> = []
  const options: OfficialSourceDiscoveryOptions = {
    keywords: ['校园卡'],
    now: () => new Date('2026-07-14T08:00:00.000Z'),
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      if (calls.length === 1) {
        return response('<form action="/_web/_search/api/search/new.rst?_p=token"></form>', {
          'set-cookie': 'JSESSIONID=home-session; Path=/; Secure'
        })
      }
      if (calls.length === 2) {
        return response('<script>url:\'../searchCon/create.rst?_p=token\'</script>', {
          'set-cookie': 'JSESSIONID=search-session; Path=/; Secure'
        })
      }
      return response(JSON.stringify({
        total: '1',
        data: `<div class="result_item"><h3 class="item_title"><a href='http://www.yeu.edu.cn/2026/0701/c1a2/page.htm'>校园卡 &amp; 网络</a></h3><span class="item_metas">创建者:系统管理员</span><span class="item_metas">发布时间:2026-07-01 10:00:00</span><span class="item_metas">目录:服务指南</span><span class="item_metas">出处:信息化处</span></div>`
      }), { 'set-cookie': 'JSESSIONID=query-session; Path=/; Secure' })
    }
  }

  const report = await discoverOfficialSources(options)
  assert.equal(report.generatedAt, '2026-07-14T08:00:00.000Z')
  assert.equal(report.queries[0]?.total, 1)
  assert.equal(report.queries[0]?.items[0]?.title, '校园卡 & 网络')
  assert.equal(report.queries[0]?.items[0]?.url, 'http://www.yeu.edu.cn/2026/0701/c1a2/page.htm')
  assert.equal(report.queries[0]?.items[0]?.publisher, '信息化处')
  assert.match(String(calls[2]?.init?.headers && new Headers(calls[2].init.headers).get('cookie')), /search-session/)

  const encodedBody = String(calls[2]?.init?.body)
  const searchInfo = new URLSearchParams(encodedBody).get('searchInfo')
  assert.ok(searchInfo)
  assert.match(Buffer.from(searchInfo!, 'base64').toString('utf8'), /校园卡/)
})

test('official source discovery fails closed when the public search form changes', async () => {
  await assert.rejects(
    discoverOfficialSources({
      keywords: ['测试'],
      fetchImpl: async () => response('<html>no search form</html>')
    }),
    /search form was not found/
  )
})

test('official source discovery refuses an external search endpoint', async () => {
  await assert.rejects(
    discoverOfficialSources({
      keywords: ['测试'],
      fetchImpl: async () => response('<form action="https://example.com/_web/_search/api/search/new.rst?_p=token"></form>')
    }),
    /must stay on https:\/\/www\.yeu\.edu\.cn/
  )
})
