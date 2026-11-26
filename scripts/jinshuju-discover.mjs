#!/usr/bin/env node
/**
 * 金数据接入自检与配置发现。
 *
 *   node scripts/jinshuju-discover.mjs          # 只打印，不改 .env
 *   node scripts/jinshuju-discover.mjs --write  # 自动把表单与选项字段写回 .env
 *
 * 用途：账号里第一次建好投票表单后，跑一次就能拿到 form_token 与选项字段 api_code，
 * 不用去网页里逐个翻。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const API = 'https://jinshuju.net/api/v1'
const ENV_PATH = path.resolve('.env')
const WRITE = process.argv.includes('--write')

/** 金数据里可能承载「投票选项」的字段类型 */
const CHOICE_TYPES = new Set([
  'single_select', 'multi_select', 'radio', 'checkbox', 'select',
  'dropdown', 'single_choice', 'multi_choice'
])
/** 选项字段的标签关键词，命中优先级最高 */
const OPTION_LABEL_HINTS = ['选手', '选项', '候选人', '节目', '投票', '支持', '作品', '项目']

function readEnv() {
  const text = readFileSync(ENV_PATH, 'utf8')
  const values = new Map()
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (match) values.set(match[1], match[2].trim())
  }
  return { text, values }
}

function setEnvKey(text, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(text)) return text.replace(pattern, `${key}=${value}`)
  return `${text.replace(/\s*$/, '')}\n${key}=${value}\n`
}

async function call(token, route) {
  const response = await fetch(`${API}${route}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000)
  })
  const body = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(body)
  } catch {
    parsed = body
  }
  return { status: response.status, body: parsed }
}

function toField(apiCode, def) {
  const raw = def?.choices ?? def?.options
  const choices = Array.isArray(raw)
    ? raw.map((item) => (typeof item === 'string' ? item : item?.name ?? item?.label ?? item?.value ?? '')).slice(0, 12)
    : []
  return {
    apiCode: apiCode ?? def?.api_code ?? '?',
    label: def?.label ?? def?.title ?? '',
    type: def?.type ?? def?.field_type ?? '',
    choices
  }
}

/**
 * 金数据读表单时 fields 是 `[{ field_1: {...} }, { field_2: {...} }]` 的包装形态，
 * 也兼容扁平的 `{ api_code, label, type }`。
 */
function describeFields(form) {
  const raw = Array.isArray(form?.fields) ? form.fields : []
  const result = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    if (item.label !== undefined || item.type !== undefined) {
      result.push(toField(item.api_code ?? item.apiCode ?? '?', item))
      continue
    }
    for (const [apiCode, def] of Object.entries(item)) {
      if (def && typeof def === 'object') result.push(toField(apiCode, def))
    }
  }
  return result
}

function pickOptionField(fields) {
  const choiceFields = fields.filter((field) => CHOICE_TYPES.has(String(field.type).toLowerCase()))
  if (choiceFields.length === 0) return null
  for (const hint of OPTION_LABEL_HINTS) {
    const hit = choiceFields.find((field) => String(field.label).includes(hint))
    if (hit) return hit
  }
  return choiceFields[0]
}

async function main() {
  const { text, values } = readEnv()
  const token = values.get('NUXT_JINSHUJU_API_TOKEN')
  if (!token) {
    console.error('缺少 NUXT_JINSHUJU_API_TOKEN，先填 .env')
    process.exit(1)
  }

  const me = await call(token, '/me')
  if (me.status !== 200) {
    console.error(`令牌不可用：HTTP ${me.status} ${JSON.stringify(me.body).slice(0, 200)}`)
    process.exit(1)
  }
  console.log(`账号：${me.body.name ?? '(未命名)'}  角色：${me.body.role ?? '?'}  创建于：${me.body.created_at ?? '?'}`)

  const list = await call(token, '/forms?limit=100')
  if (list.status !== 200) {
    console.error(`表单列表失败：HTTP ${list.status} ${JSON.stringify(list.body).slice(0, 200)}`)
    process.exit(1)
  }

  const forms = Array.isArray(list.body.data) ? list.body.data : []
  console.log(`表单数量：${forms.length}\n`)
  if (forms.length === 0) {
    console.log('这个账号下还没有表单。先到金数据建一张投票表单，再回来跑本条命令。')
    console.log('表单要拿到风控字段，需要：')
    console.log('  1. 一个「单选」字段承载选手/选项（这就是 option field）')
    console.log('  2. 设置里开启记录提交人信息（页面会带回 creator_name）')
    console.log('  3. 表单设置 → 数据推送，指向 /api/integrations/jinshuju/webhook')
    process.exit(0)
  }

  const candidates = []
  for (const item of forms) {
    const formToken = item.token ?? item.form_token ?? item.id
    const name = item.name ?? item.title ?? '(未命名表单)'
    const detail = await call(token, `/forms/${encodeURIComponent(formToken)}`)
    const fields = detail.status === 200 ? describeFields(detail.body) : []
    console.log(`表单 ${formToken}  ${name}  条目数：${item.entries_count ?? item.entriesCount ?? '?'}`)
    if (fields.length === 0) {
      console.log('  （读不到字段结构，可能是套餐限制）')
    } else {
      for (const field of fields) {
        const mark = CHOICE_TYPES.has(String(field.type).toLowerCase()) ? ' *' : ''
        console.log(`  ${field.apiCode.padEnd(12)} ${String(field.type).padEnd(14)} ${field.label}${mark}`)
        if (field.choices.length) console.log(`     选项：${field.choices.join(' / ')}`)
      }
    }
    const picked = pickOptionField(fields)
    if (picked) candidates.push({ formToken, name, field: picked })
    console.log('')
  }

  if (candidates.length === 0) {
    console.log('没有识别到选项类字段。请手动确认表单里是否有单选/下拉，并把 api_code 填进 NUXT_JINSHUJU_OPTION_FIELD。')
    process.exit(0)
  }

  const chosen = candidates[0]
  console.log(`建议配置：`)
  console.log(`  NUXT_JINSHUJU_FORM_TOKEN=${chosen.formToken}`)
  console.log(`  NUXT_JINSHUJU_OPTION_FIELD=${chosen.field.apiCode}   （${chosen.name} / ${chosen.field.label}）`)
  if (candidates.length > 1) {
    console.log(`  另有 ${candidates.length - 1} 张表单可选，确认第一张不是想要的就手动改。`)
  }

  if (!WRITE) {
    console.log('\n只打印未写入。确认无误后加 --write 重跑。')
    return
  }

  let next = setEnvKey(text, 'NUXT_JINSHUJU_FORM_TOKEN', chosen.formToken)
  next = setEnvKey(next, 'NUXT_JINSHUJU_OPTION_FIELD', chosen.field.apiCode)
  writeFileSync(ENV_PATH, next, 'utf8')
  console.log('\n已写入 .env')
}

main().catch((error) => {
  console.error('执行失败：', error?.message ?? error)
  process.exit(1)
})
