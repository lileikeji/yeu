import assert from 'node:assert/strict'
import test from 'node:test'
import {
  crawlPriority,
  DEFAULT_OFFICIAL_KNOWLEDGE_SEEDS,
  EXPLICIT_SEED_PRIORITY,
  normalizeOfficialUrl,
  parseOfficialCrawlCli,
  parseOfficialHtml,
  parseReaderDocument
} from './crawl-official-knowledge'

test('official crawl seeds include student rules, calendars and campus services', () => {
  for (const seed of [
    'https://xsb.yeu.edu.cn/',
    'https://bgs.yeu.edu.cn/',
    'https://jwb.yeu.edu.cn/',
    'https://shpg.yeu.edu.cn/',
    'https://zwc.yeu.edu.cn/'
  ]) {
    assert.ok(DEFAULT_OFFICIAL_KNOWLEDGE_SEEDS.includes(seed as typeof DEFAULT_OFFICIAL_KNOWLEDGE_SEEDS[number]))
  }
})

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

test('reader output gives opaque Office attachments a meaningful searchable title', () => {
  const document = parseReaderDocument(`Title: 0bfe3bf3-5dfd-4ccb-a132-a556f46a4300.docx
URL Source: https://www.yeu.edu.cn/_upload/article/files/rules/0bfe3bf3-5dfd-4ccb-a132-a556f46a4300.docx

Markdown Content:
\u0007仰大教〔2021〕15号

仰恩大学本科生学籍管理规定（修订）

第一章 总则
第一条 根据《普通高等学校学生管理规定》，为维护学校正常教育教学秩序，规范全日制普通本科学生的学籍管理，结合学校实际制定本规定。
第二条 本规定适用于普通本科学生以及专升本学生。
`, 'https://www.yeu.edu.cn/_upload/article/files/rules/0bfe3bf3-5dfd-4ccb-a132-a556f46a4300.docx')

  assert.equal(document.kind, 'document')
  assert.equal(document.title, '仰恩大学本科生学籍管理规定（修订）')
  assert.equal(document.text.includes(String.fromCharCode(7)), false)
})

test('official HTML fallback extracts article text and relative attachments without the reader service', () => {
  const page = parseOfficialHtml(`<!doctype html>
    <html>
      <head>
        <title>学生奖学金评审办法 - 仰恩大学</title>
        <meta name="publishdate" content="2026-07-18">
      </head>
      <body>
        <nav>首页 新闻 通知</nav>
        <article class="wp_articlecontent">
          <h1>学生奖学金评审办法</h1>
          <p>申请人应当完成规定课程，并按通知提交成绩和综合测评材料。</p>
          <p>评审按照公开、公平、公正原则进行，具体条件以附件正文为准。</p>
          <a href="../../_upload/article/files/scholarship-rule.pdf">奖学金评审办法附件</a>
        </article>
      </body>
    </html>`, 'https://xsb.yeu.edu.cn/2026/0718/c644a50000/page.htm')
  assert.equal(page.extractionMethod, 'direct-html')
  assert.match(page.text, /申请人应当完成规定课程/)
  assert.doesNotMatch(page.text, /首页 新闻 通知/)
  assert.deepEqual(page.links[0], {
    url: 'https://xsb.yeu.edu.cn/2026/_upload/article/files/scholarship-rule.pdf',
    label: '奖学金评审办法附件'
  })
})

test('official HTML discovers PDF players whose attachment is stored outside anchor tags', () => {
  const page = parseOfficialHtml(`<!doctype html>
    <html>
      <head><title>仰恩大学学生综合测评实施办法（修订）</title></head>
      <body>
        <nav>部门首页 部门概况 部门简介 部门职责 联系方式 学工动态 通知公告 学生资助 心理健康 就业指导 创业园 一站式社区 制度文件 规章制度</nav>
        <div class="wp_articlecontent">
          <div
            class="wp_pdf_player"
            pdfsrc="/_upload/article/files/rules/comprehensive-evaluation.pdf"
            sudyfile-attr="{'title':'仰恩大学学生综合测评实施办法（修订）.pdf'}"
          ></div>
        </div>
      </body>
    </html>`, 'https://xsb.yeu.edu.cn/2025/0530/c640a49640/page.htm')

  assert.equal(page.attachmentLandingPage, true)
  assert.match(page.text, /正文由仰恩大学官网附件展示/)
  assert.deepEqual(page.links, [{
    url: 'https://xsb.yeu.edu.cn/_upload/article/files/rules/comprehensive-evaluation.pdf',
    label: '仰恩大学学生综合测评实施办法（修订）.pdf'
  }])
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
  assert.ok(EXPLICIT_SEED_PRIORITY > attachment)
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
