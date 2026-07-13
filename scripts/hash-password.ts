import './load-env'
import { hashPassword } from '../server/utils/password'

const password = process.env.NUXT_ADMIN_PASSWORD

if (!password) {
  throw new Error('Set NUXT_ADMIN_PASSWORD before running db:hash-password')
}

process.stdout.write(`${await hashPassword(password)}\n`)
