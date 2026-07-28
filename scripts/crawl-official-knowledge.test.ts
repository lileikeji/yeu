import assert from 'node:assert/strict'
import test from 'node:test'
import {
  crawlPriority,
  normalizeOfficialUrl,
  parseOfficialCrawlCli,
  parseReaderDocument
} from './crawl-official-knowledge'

test('official URL normalization keeps school documents and rejects external or asset URLs', () => {
  assert.equal(
    normalizeOfficialUrl('http://computer.yeu.edu.cn/2026/0728/c100a123/page.htm?utm_source=test#top'),
    'https://computer.yeu.edu.cn/2026/0728/c100a123/page.htm'
  )
  assert.equal(normalizeOfficialUrl('https://example.com/page.htm'), null)
  assert.equal(normalizeOfficialUrl('https://www.yeu.edu.cn/_upload/article/images/demo.jpg'), null)
  assert.equal(normalizeOfficialUrl('https://www.yeu.edu.cn/_upload/article/files/rule.pdf'), 'https://www.yeu.edu.cn/_upload/article/files/rule.pdf')
})

test('reader output becomes searchable text with official links and metadata', () => {
  const page = parseReaderDocument(`Title: 2026级新生报到安排 - 仰恩大学
URL Source: https://www.yeu.edu.cn/2026/0728/c100a123/page.htm
Published Time: 2026-07-28T08:00:00+08:00

Markdown Content:
# 2026级新生报到安排

新生请于九月五日到校报到，并提前准备录取通知书和身份证。
报到当天请根据录取学院安排前往对应接待点，现场要求如有变化以学校最新通知为准。

[学生资助办法](https://xsc.yeu.edu.cn/2026/0720/c20a88/page.htm)
[学生手册 PDF](../files/2026-student-handbook.pdf)
![配图](https://www.yeu.edu.cn/_upload/article/images/test.png)
`, 'https://www.yeu.edu.cn/2026/0728/c100a123/page.htm')
  assert.equal(page.title, '2026级新生报到安排')
  assert.match(page.text, /九月五日到校报到/)
  assert.doesNotMatch(page.text, /https:\/\//)
  assert.equal(page.links[0]?.url, 'https://xsc.yeu.edu.cn/2026/0720/c20a88/page.htm')
  assert.deepEqual(page.links[1], {
    url: 'https://www.yeu.edu.cn/2026/0728/files/2026-student-handbook.pdf',
    label: '学生手册 PDF'
  })
  assert.equal(new Date(page.publishedAt!).toISOString(), '2026-07-28T00:00:00.000Z')
})

test('new-student rules and attachments are crawled before ordinary news at the same depth', () => {
  const priority = crawlPriority({
    url: 'https://xsc.yeu.edu.cn/2026/0720/c20a88/page.htm',
    label: '学生手册与奖学金办法',
    depth: 1,
    discoveredFrom: 'https://xsc.yeu.edu.cn/',
    seed: false
  })
  const attachment = crawlPriority({
    url: 'https://xsc.yeu.edu.cn/_upload/article/files/student-handbook.pdf',
    label: '学生手册',
    depth: 1,
    discoveredFrom: 'https://xsc.yeu.edu.cn/2026/0720/c20a88/page.htm',
    seed: false
  })
  const ordinary = crawlPriority({
    url: 'https://www.yeu.edu.cn/2026/0720/c20a99/page.htm',
    label: '校园新闻',
    depth: 1,
    discoveredFrom: 'https://www.yeu.edu.cn/',
    seed: false
  })
  assert.ok(priority > ordinary)
  assert.ok(attachment > ordinary)
})

test('crawl CLI is bounded and supports an explicit seed', () => {
  const options = parseOfficialCrawlCli([
    '--seed', 'https://www.yeu.edu.cn/',
    '--max-pages', '12',
    '--max-depth', '2',
    '--concurrency', '1',
    '--dry-run'
  ])
  assert.deepEqual(options.seeds, ['https://www.yeu.edu.cn/'])
  assert.equal(options.maxPages, 12)
  assert.equal(options.maxDepth, 2)
  assert.equal(options.concurrency, 1)
  assert.equal(options.dryRun, true)
})
