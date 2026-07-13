import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

const configuredPath = process.env.NUXT_ENV_FILE
const envPath = resolve(process.cwd(), configuredPath || '.env')

if (configuredPath || existsSync(envPath)) {
  loadEnvFile(envPath)
}
