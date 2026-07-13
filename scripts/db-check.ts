import './load-env'
import { closeDatabase, getDatabase } from '../server/database/client'

const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'

try {
  const client = getDatabase(databasePath)
  const integrity = client.sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>
  const foreignKeys = client.sqlite.pragma('foreign_key_check') as unknown[]
  const integrityOk = integrity.length === 1 && integrity[0]?.integrity_check === 'ok'

  if (!integrityOk || foreignKeys.length > 0) {
    process.stderr.write(JSON.stringify({ integrity, foreignKeys }, null, 2))
    process.exitCode = 1
  } else {
    process.stdout.write(`Database check passed: ${client.path}\n`)
  }
} finally {
  closeDatabase(databasePath)
}
