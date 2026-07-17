/**
 * PM2 process file for YEU.
 * Always loads production env from shared/.env (or release-local .env)
 * so restarts never drop NUXT_* secrets.
 *
 * Usage on server (from release/current root):
 *   pm2 start ecosystem.config.cjs --update-env
 *   pm2 reload ecosystem.config.cjs --update-env
 */
const fs = require('node:fs')
const path = require('node:path')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  /** @type {Record<string, string>} */
  const env = {}
  const text = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function resolveEnvFile() {
  const cwd = __dirname
  const candidates = [
    process.env.NUXT_ENV_FILE,
    path.resolve(cwd, '../shared/.env'),
    path.resolve(cwd, '../../shared/.env'),
    path.resolve(cwd, 'shared/.env'),
    path.resolve(cwd, '.env')
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return null
}

const envFile = resolveEnvFile()
const fileEnv = envFile ? parseEnvFile(envFile) : {}

module.exports = {
  apps: [
    {
      name: 'yeu',
      script: '.output/server/index.mjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '700M',
      time: true,
      env: {
        NODE_ENV: 'production',
        ...fileEnv
      }
    }
  ]
}
