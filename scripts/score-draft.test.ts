import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  SCORE_DRAFT_BACKOFF_MS,
  SCORE_DRAFT_MAX_ATTEMPTS,
  SCORE_DRAFT_QUEUED_NOTICE,
  SCORE_DRAFT_RETRY_TICK_MS,
  SCORE_DRAFT_STORAGE_KEY,
  canRetryScoreDraft,
  parseScoreDrafts,
  readScoreDrafts,
  removeScoreDraft,
  scoreDraftBackoffMs,
  scoreDraftId,
  shouldRetryScoreDraftError,
  upsertScoreDraft,
  writeScoreDrafts,
  type ScoreDraftItem,
  type ScoreDraftStorage
} from '../app/composables/useScoreDraft'

function draft(overrides: Partial<ScoreDraftItem> = {}): ScoreDraftItem {
  return {
    id: 'prelim:s1:j1',
    singerId: 's1',
    roundKey: 'prelim',
    payload: { scores: { tone: 8.5, stage: 9 }, comment: '' },
    createdAt: 1_700_000_000_000,
    attempts: 0,
    ...overrides
  }
}

function memoryStorage(): ScoreDraftStorage & { dump: () => Map<string, string> } {
  const store = new Map<string, string>()
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value) },
    removeItem: (key) => { store.delete(key) },
    dump: () => store
  }
}

test('草稿键固定为 yeu:score-draft:v1', () => {
  assert.equal(SCORE_DRAFT_STORAGE_KEY, 'yeu:score-draft:v1')
  const storage = memoryStorage()
  writeScoreDrafts(storage, [draft()])
  assert.ok(storage.dump().has('yeu:score-draft:v1'))
  assert.equal(SCORE_DRAFT_QUEUED_NOTICE, '已经记下了，网好了会自动交上去')
  assert.equal(SCORE_DRAFT_RETRY_TICK_MS, 20_000)
})

test('同一评委对同一选手同一轮只有一个草稿键', () => {
  const id = scoreDraftId('prelim', 's1', 'j1')
  assert.equal(id, 'prelim:s1:j1')
  assert.equal(scoreDraftId('prelim', 's1', 'j1'), id)
  assert.notEqual(scoreDraftId('prelim', 's1', 'j2'), id)
  assert.notEqual(scoreDraftId('prelim', 's2', 'j1'), id)
  assert.notEqual(scoreDraftId('final', 's1', 'j1'), id)

  // 改完分再交一次，队列里还是那一份，只把分数换掉。
  const first = draft()
  const again = draft({
    payload: { scores: { tone: 9.5, stage: 9 }, comment: '再来一次' },
    createdAt: 1_700_000_000_500
  })
  const merged = upsertScoreDraft([first], again)
  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.id, id)
  assert.equal(merged[0]?.payload.scores.tone, 9.5)
  assert.equal(merged[0]?.payload.comment, '再来一次')

  const other = upsertScoreDraft([first], draft({ id: 'prelim:s2:j1', singerId: 's2' }))
  assert.equal(other.length, 2)
})

test('失败补交按 2/4/8/16/32 秒退避，超出上限按最后一档', () => {
  assert.deepEqual([...SCORE_DRAFT_BACKOFF_MS], [2000, 4000, 8000, 16000, 32000])
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(attempts => scoreDraftBackoffMs(attempts)),
    [2000, 4000, 8000, 16000, 32000]
  )
  assert.equal(scoreDraftBackoffMs(9), 32000)
  assert.equal(scoreDraftBackoffMs(-3), 2000)
  assert.equal(scoreDraftBackoffMs(Number.NaN), 2000)
})

test('同一份评分最多自动补交 5 次', () => {
  assert.equal(SCORE_DRAFT_MAX_ATTEMPTS, 5)
  assert.equal(SCORE_DRAFT_BACKOFF_MS.length, SCORE_DRAFT_MAX_ATTEMPTS)
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 99].map(attempts => canRetryScoreDraft(attempts)),
    [true, true, true, true, true, false, false]
  )
})

test('提交成功后草稿从 localStorage 删掉', () => {
  const storage = memoryStorage()
  writeScoreDrafts(storage, [draft()])
  assert.equal(readScoreDrafts(storage).length, 1)

  writeScoreDrafts(storage, removeScoreDraft(readScoreDrafts(storage), 'prelim:s1:j1'))
  assert.equal(readScoreDrafts(storage).length, 0)
  assert.equal(storage.getItem(SCORE_DRAFT_STORAGE_KEY), null)
})

test('SSR / localStorage 不可用时不读也不抛', () => {
  assert.deepEqual(readScoreDrafts(null), [])
  assert.deepEqual(readScoreDrafts(undefined), [])
  assert.doesNotThrow(() => writeScoreDrafts(null, [draft()]))

  const broken: ScoreDraftStorage = {
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => { throw new Error('QuotaExceededError') },
    removeItem: () => { throw new Error('SecurityError') }
  }
  assert.deepEqual(readScoreDrafts(broken), [])
  assert.doesNotThrow(() => writeScoreDrafts(broken, [draft()]))
  assert.doesNotThrow(() => writeScoreDrafts(broken, []))

  assert.deepEqual(parseScoreDrafts('not-json'), [])
  assert.deepEqual(parseScoreDrafts('{"items":[{"id":""}]}'), [])

  const source = readFileSync('app/composables/useScoreDraft.ts', 'utf8')
  assert.match(source, /import\.meta\.client/)
  assert.match(source, /onMounted\(\(\) => \{\s*items\.value = readScoreDrafts/)
})

test('只有网络错误、5xx 和限流才补交，明确拒绝不排队', () => {
  const networkError = new Error('fetch failed')
  assert.equal(shouldRetryScoreDraftError(networkError), true)
  assert.equal(shouldRetryScoreDraftError({ statusCode: 502 }), true)
  assert.equal(shouldRetryScoreDraftError({ statusCode: 408 }), true)
  assert.equal(shouldRetryScoreDraftError({ statusCode: 429 }), true)
  assert.equal(shouldRetryScoreDraftError({ statusCode: 409 }), false)
  assert.equal(shouldRetryScoreDraftError({ statusCode: 401 }), false)
})

test('评分页接上了断网续评', () => {
  const page = readFileSync('app/pages/judge/index.vue', 'utf8')
  assert.match(page, /useScoreDraft\(\{/)
  assert.match(page, /send: item => judgeFetch\(`\/api\/judge\/scores\/\$\{encodeURIComponent\(item\.singerId\)\}`/)
  assert.match(page, /await saveScoreDraft\(\{/)
  assert.match(page, /result\.status === 'queued'/)
  assert.match(page, /data-score-draft-queue/)
  assert.match(page, /SCORE_DRAFT_QUEUED_NOTICE/)
  assert.match(page, /还有 \{\{ draftPending \}\} 份没交上去/)
  assert.match(page, /label="立即重试"/)
  assert.match(page, /:loading="draftFlushing"/)
})
