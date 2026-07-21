import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('rethrowDatabaseError redacts driver details in production', () => {
  const source = readFileSync(join(process.cwd(), 'server/utils/errors.ts'), 'utf8')
  assert.match(source, /NODE_ENV === 'production'/)
  assert.match(source, /DATABASE_ERROR/)
  assert.match(source, /statusMessage: 'Database error'/)
  assert.match(source, /SQLITE_CONSTRAINT/)
  assert.match(source, /DATA_CONFLICT/)
  // Dev may rethrow; prod must not pass through raw driver messages.
  assert.match(source, /throw error/)
})
