import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import * as sqliteVec from 'sqlite-vec'

/**
 * Copy the sqlite-vec platform binary into the Nitro build output.
 *
 * sqlite-vec loads its vector functions from a platform-specific package
 * (sqlite-vec-<os>-<arch>) declared as an optionalDependency. Nitro does not
 * copy optionalDependencies into .output/server/node_modules, so at runtime
 * getLoadablePath() inside the built server fails and vector search silently
 * stays off. This script runs after `nuxt build` and copies the installed
 * platform package next to the copied sqlite-vec package.
 *
 * Exit code is always 0: vector search is an enhancement and a missing binary
 * (e.g. an unsupported platform) must not fail the build.
 */

function copyBinary(): { copied: string | null, reason?: string } {
  try {
    const loadablePath = sqliteVec.getLoadablePath()
    const sourcePackageDir = dirname(loadablePath)
    const outputNodeModules = resolve(process.cwd(), process.env.NUXT_OUTPUT_DIR || '.output', 'server', 'node_modules')
    const targetPackageDir = join(outputNodeModules, basename(sourcePackageDir))
    mkdirSync(targetPackageDir, { recursive: true })
    let copied = 0
    for (const fileName of readdirSync(sourcePackageDir)) {
      const source = join(sourcePackageDir, fileName)
      const target = join(targetPackageDir, fileName)
      if (existsSync(target)) continue
      copyFileSync(source, target)
      copied += 1
    }
    return { copied: copied > 0 ? targetPackageDir : null }
  } catch (error) {
    return { copied: null, reason: error instanceof Error ? error.message : String(error) }
  }
}

const result = copyBinary()
if (result.copied) {
  process.stdout.write(`sqlite-vec binary ready at ${result.copied}\n`)
} else {
  process.stdout.write(`sqlite-vec binary not copied: ${result.reason ?? 'already present'}\n`)
}
