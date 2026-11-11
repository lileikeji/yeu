/**
 * systemd 单元与安装脚本的静态守卫。
 *
 * 真机上 `systemctl daemon-reload` 的失败代价很高（服务起不来、定时任务不跑），
 * 而本仓库的单元文件是随 `ops/` 进源码、由 `ops/harden-production.sh` 安装的。
 * 这里不连真机，只保证三件在任何布局下都必须成立的事：
 *   1. 单元引用的 `/opt/yeu-ops/*` 脚本都由安装脚本真实投放；
 *   2. 单元不再引用 release-only 布局里不存在的 `$current/scripts`；
 *   3. 定时器有配套的 service、有 [Install]、且安装脚本会 enable。
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const unitsDir = resolve('ops/systemd')
const unitFiles = readdirSync(unitsDir).filter(name => name.endsWith('.service') || name.endsWith('.timer')).sort()
const harden = readFileSync(resolve('ops/harden-production.sh'), 'utf8')

function unit(name: string): string {
  return readFileSync(resolve(unitsDir, name), 'utf8')
}

function execStartTargets(source: string): string[] {
  return [...source.matchAll(/^ExecStart=(.*)$/gm)]
    .flatMap(match => match[1].split(/\s+/))
    .filter(token => token.startsWith('/'))
}

test('every /opt/yeu-ops path referenced by a unit is installed by harden-production.sh', () => {
  const installed = new Set(
    [...harden.matchAll(/\/opt\/yeu-ops\/[A-Za-z0-9._/-]+/g)].map(match => match[0])
  )
  const offenders: string[] = []
  for (const name of unitFiles) {
    for (const target of execStartTargets(unit(name))) {
      if (!target.startsWith('/opt/yeu-ops/')) continue
      if (!installed.has(target)) offenders.push(`${name} -> ${target}`)
    }
  }
  assert.deepEqual(offenders, [], `单元引用了安装脚本没投放的脚本：${offenders.join(', ')}`)
})

test('installed /opt/yeu-ops scripts exist in the repository', () => {
  const sources = [...harden.matchAll(/"([^"]+)"\s*\\\n\s*(\/opt\/yeu-ops\/[A-Za-z0-9._-]+)/g)]
  assert.ok(sources.length >= 3, `安装脚本里的 /opt/yeu-ops 投放条目过少：${sources.length}`)
  for (const [, source, target] of sources) {
    const relative = source.replace('$OPS_DIR/', 'ops/').replace('$ROOT/repo/', '')
    assert.ok(existsSync(resolve(relative)), `${target} 的源文件不存在：${relative}`)
  }
})

test('units never point at the release-only current/scripts layout', () => {
  for (const name of unitFiles) {
    // 只看真正会被执行的命令行，注释里说明旧路径是允许的。
    const execLines = unit(name).split('\n').filter(line => /^(ExecStart|ExecStartPre|ExecStop)=/.test(line))
    for (const line of execLines) {
      assert.doesNotMatch(line, /\/current\/scripts/, `${name} 的可执行路径仍指向 current/scripts：${line}`)
    }
  }
  assert.match(harden, /OPS_DIR=/, '安装脚本必须解析 ops 目录，不能写死 current/ops')
  assert.doesNotMatch(harden, /"\$ROOT\/current\/ops\/systemd/, '安装脚本仍从 current/ops 取单元文件')
})

test('each timer has a matching service, and every timer the installer ships is enabled', () => {
  const timers = unitFiles.filter(name => name.endsWith('.timer'))
  assert.ok(timers.length >= 2)
  for (const timer of timers) {
    const serviceName = timer.replace(/\.timer$/, '.service')
    assert.ok(unitFiles.includes(serviceName), `${timer} 缺少配套的 ${serviceName}`)
    const source = unit(timer)
    assert.match(source, /\[Timer\]/)
    assert.match(source, /OnCalendar=/)
    assert.match(source, /\[Install\]/)
    // 只有安装脚本真正投放到 /etc/systemd/system 的定时器才要求 enable；
    // yeu-signal / yeu-knowledge-crawl 由发布侧单独安装，不在这条口径里。
    if (!harden.includes(`/etc/systemd/system/${timer}`)) continue
    assert.match(harden, new RegExp(`systemctl enable --now[^\\n]*${timer.replace('.', '\\.')}`))
  }
})

test('units that touch the database declare read-write access to it', () => {
  const databaseWriters = unitFiles.filter((name) => {
    const source = unit(name)
    return /sqlite|data\b/.test(source) && source.includes('ExecStart=')
  })
  for (const name of databaseWriters) {
    const source = unit(name)
    if (!source.includes('ProtectSystem=strict')) continue
    assert.match(source, /ReadWritePaths=/, `${name} 开了 ProtectSystem=strict 却没有 ReadWritePaths`)
  }
})
