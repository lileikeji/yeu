import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import test from 'node:test'

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(path)
    if (entry.name.endsWith('.recovered')) return []
    return ['.ts', '.vue'].includes(extname(entry.name)) ? [path] : []
  })
}

test('every Lucide icon used by the app exists in the installed icon set', () => {
  const iconFile = resolve('node_modules/@iconify-json/lucide/icons.json')
  const iconData = JSON.parse(readFileSync(iconFile, 'utf8')) as {
    icons: Record<string, unknown>
  }
  const available = new Set(Object.keys(iconData.icons))
  const used = new Set<string>()

  for (const file of collectSourceFiles(resolve('app'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/i-lucide-([a-z0-9-]+)/g)) {
      if (match[1]) used.add(match[1])
    }
  }

  const missing = [...used].filter(icon => !available.has(icon)).sort()
  assert.deepEqual(missing, [])
})
