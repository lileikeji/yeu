import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  OFFLINE_SNAPSHOT_MAX_BYTES,
  OFFLINE_SNAPSHOT_MAX_ENTRIES,
  OFFLINE_SNAPSHOT_PREFIX,
  buildOfflineSnapshotStorageKey,
  formatOfflineSnapshotTime,
  parseOfflineSnapshot,
  readOfflineSnapshot,
  selectOfflineSnapshotEvictions,
  serializeOfflineSnapshot,
  writeOfflineSnapshot
} from '../app/composables/useOfflineSnapshot'

const composableSource = readFileSync(resolve('app/composables/useOfflineSnapshot.ts'), 'utf8')
const placesSource = readFileSync(resolve('app/pages/places/[slug].vue'), 'utf8')
const proceduresSource = readFileSync(resolve('app/pages/procedures/[slug].vue'), 'utf8')
const arrivalSource = readFileSync(resolve('app/pages/arrival/index.vue'), 'utf8')

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    }
  }
}

function withMemoryStorage(run: () => void): void {
  const globals = globalThis as { localStorage?: Storage }
  const previous = globals.localStorage
  globals.localStorage = createMemoryStorage()
  try {
    run()
  } finally {
    globals.localStorage = previous
  }
}

test('snapshot key uses one prefix and the agreed limits', () => {
  assert.equal(OFFLINE_SNAPSHOT_PREFIX, 'yeu:offline:')
  assert.equal(OFFLINE_SNAPSHOT_MAX_ENTRIES, 12)
  assert.equal(OFFLINE_SNAPSHOT_MAX_BYTES, 64 * 1024)
  assert.equal(buildOfflineSnapshotStorageKey('place:library'), 'yeu:offline:place:library')
  assert.equal(buildOfflineSnapshotStorageKey('arrival:routes'), 'yeu:offline:arrival:routes')
})

test('serialize + parse round-trips payload and savedAt', () => {
  const record = serializeOfflineSnapshot({ name: '图书馆', tags: ['自习'] }, 1_700_000_000_000)
  assert.ok(record)
  assert.ok(record.bytes > 0)
  assert.equal(record.bytes, Buffer.byteLength(record.raw, 'utf8'))

  const parsed = parseOfflineSnapshot<{ name: string, tags: string[] }>(record.raw)
  assert.deepEqual(parsed, {
    savedAt: 1_700_000_000_000,
    payload: { name: '图书馆', tags: ['自习'] }
  })
})

test('one snapshot over 64KB is refused, a normal one is kept', () => {
  assert.equal(serializeOfflineSnapshot({ text: 'x'.repeat(70 * 1024) }, Date.now()), null)
  const small = serializeOfflineSnapshot({ text: 'x'.repeat(1024) }, Date.now())
  assert.ok(small)
  assert.ok(small.bytes < OFFLINE_SNAPSHOT_MAX_BYTES)
})

test('parse drops malformed snapshots instead of throwing', () => {
  assert.equal(parseOfflineSnapshot(null), null)
  assert.equal(parseOfflineSnapshot(''), null)
  assert.equal(parseOfflineSnapshot('not json'), null)
  assert.equal(parseOfflineSnapshot('[]'), null)
  assert.equal(parseOfflineSnapshot('{"payload":{"a":1}}'), null)
  assert.equal(parseOfflineSnapshot('{"savedAt":"yesterday","payload":{"a":1}}'), null)
  assert.equal(parseOfflineSnapshot('{"savedAt":1}'), null)
})

test('eviction keeps 12 newest entries and drops the oldest first', () => {
  const usage = Array.from({ length: 14 }, (_, index) => ({
    key: `${OFFLINE_SNAPSHOT_PREFIX}entry-${index}`,
    savedAt: index === 0 ? 1 : index * 1_000
  }))
  const evicted = selectOfflineSnapshotEvictions(usage)
  assert.equal(evicted.length, 2)
  assert.deepEqual(evicted, [
    `${OFFLINE_SNAPSHOT_PREFIX}entry-0`,
    `${OFFLINE_SNAPSHOT_PREFIX}entry-1`
  ])
  assert.deepEqual(selectOfflineSnapshotEvictions(usage.slice(0, 12)), [])
})

test('formatOfflineSnapshotTime renders local minutes and hides missing time', () => {
  assert.equal(formatOfflineSnapshotTime(null), '')
  const stamp = new Date(2026, 0, 2, 3, 4).getTime()
  assert.equal(formatOfflineSnapshotTime(stamp), '2026-01-02 03:04')
})

test('write + read + prune work against a real storage shim', () => {
  withMemoryStorage(() => {
    const key = buildOfflineSnapshotStorageKey('place:library')
    const savedAt = writeOfflineSnapshot(key, { name: '图书馆' })
    assert.ok(savedAt)
    assert.deepEqual(readOfflineSnapshot<{ name: string }>(key), {
      savedAt,
      payload: { name: '图书馆' }
    })

    const storage = (globalThis as { localStorage?: Storage }).localStorage
    assert.ok(storage)
    storage.setItem('dsh:unrelated', 'keep-me')
    for (let index = 0; index < OFFLINE_SNAPSHOT_MAX_ENTRIES; index += 1) {
      writeOfflineSnapshot(buildOfflineSnapshotStorageKey(`place:item-${index}`), { index })
    }

    assert.equal(storage.getItem(key), null)
    assert.equal(storage.getItem('dsh:unrelated'), 'keep-me')
    assert.equal(
      [...Array(storage.length).keys()]
        .map(index => storage.key(index))
        .filter(item => item?.startsWith(OFFLINE_SNAPSHOT_PREFIX)).length,
      OFFLINE_SNAPSHOT_MAX_ENTRIES
    )
  })
})

test('oversized payloads are not written at all', () => {
  withMemoryStorage(() => {
    const key = buildOfflineSnapshotStorageKey('procedure:big')
    assert.equal(writeOfflineSnapshot(key, { text: 'x'.repeat(80 * 1024) }), null)
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    assert.ok(storage)
    assert.equal(storage.length, 0)
  })
})

test('storage failures stay silent (private mode / quota full)', () => {
  const globals = globalThis as { localStorage?: Storage }
  const previous = globals.localStorage
  globals.localStorage = {
    ...createMemoryStorage(),
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('SecurityError')
    }
  } as unknown as Storage

  try {
    const key = buildOfflineSnapshotStorageKey('place:quota')
    assert.equal(writeOfflineSnapshot(key, { name: '图书馆' }), null)
    assert.equal(readOfflineSnapshot(key), null)
  } finally {
    globals.localStorage = previous
  }
})

test('SSR never touches localStorage', () => {
  // guard 在 snapshotStorage 的第一行；handler 的 SSR 分支直接走 loader。
  assert.match(composableSource, /function snapshotStorage\(\): Storage \| null \{\s*if \(import\.meta\.server\) return null/)
  assert.match(composableSource, /if \(import\.meta\.server\) \{\s*try \{\s*return await loader\(\)/)
  assert.match(composableSource, /OFFLINE_SNAPSHOT_TIMEOUT_MS = 4000/)
  assert.match(composableSource, /setTimeout\(\(\) => \{[\s\S]{0,240}OFFLINE_SNAPSHOT_TIMEOUT_MS/)
})

test('the three pages use the composable and show the offline banner', () => {
  for (const [name, source, matcher, copyPattern] of [
    [
      'places',
      placesSource,
      /useOfflineSnapshot<ApiPlace>\(/,
      /现在连不上网，显示 \{\{ offlineSavedAtLabel \}\} 保存的内容。恢复网络后刷新。/
    ],
    [
      'procedures',
      proceduresSource,
      /useOfflineSnapshot<ApiProcedure>\(/,
      /现在连不上网，显示 \{\{ offlineSavedAtLabel \}\} 保存的内容。恢复网络后刷新。/
    ],
    [
      'arrival',
      arrivalSource,
      /useOfflineSnapshot<ArrivalRoutesPayload>\(/,
      /现在连不上网，显示 \{\{ offlineSavedAtLabel \}\} 保存的内容。恢复网络后刷新。/
    ]
  ] as const) {
    assert.match(source, matcher, `${name} 页应接入 useOfflineSnapshot`)
    assert.match(source, /v-if="stale"/, `${name} 页应有 stale 分支`)
    assert.match(source, /role="status"/, `${name} 页提示条要能被读屏读到`)
    assert.match(
      source,
      /v-if="stale"[\s\S]{0,400}surface-panel/,
      `${name} 页提示条复用 surface-panel`
    )
    assert.match(source, copyPattern, `${name} 页文案`)
    assert.match(source, /offlineSavedAtLabel/, `${name} 页显示核验时间`)
    assert.doesNotMatch(source, /温馨提示|为您/, `${name} 页不要客套腔`)
  }
})

test('pages still sanitize public payloads on the server only', () => {
  assert.match(placesSource, /if \(import\.meta\.client\) return payload/)
  assert.match(placesSource, /await import\('~\/utils\/public-api-presentation'\)/)
  assert.match(proceduresSource, /if \(import\.meta\.client\) return payload/)
  assert.match(proceduresSource, /await import\('~\/utils\/public-api-presentation'\)/)
})

// 2026-11-11 线上 /places/:slug、/procedures/:slug 全量 503：loader 里的裸 $fetch
// 在 SSR 期间不带请求上下文，被 server/middleware/01-api-origin-guard.ts 判成
// missing-source 403，页面再把非 404 统一映射成「服务暂时不可用」。
test('detail pages fetch through useRequestFetch so SSR keeps the request context', () => {
  const cases = [
    ['places', placesSource, /await requestFetch<ApiPlace>\(`\/api\/public\/places\//],
    ['procedures', proceduresSource, /await requestFetch<ApiProcedure>\(`\/api\/public\/procedures\//]
  ] as const

  for (const [name, source, fetchPattern] of cases) {
    assert.match(source, /const requestFetch = useRequestFetch\(\)/, `${name} 页要取 useRequestFetch`)
    assert.match(source, fetchPattern, `${name} 页 loader 走 requestFetch`)
    assert.doesNotMatch(source, /await \$fetch<Api(?:Place|Procedure)>\(/, `${name} 页不要裸 $fetch 取详情`)
  }
})
