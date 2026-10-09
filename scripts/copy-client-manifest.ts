import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Nuxt may inline this module into Nitro; preserve the current build's manifest
// so the budget gate can inspect the exact files shipped in the artifact.
const directory = resolve(process.env.NUXT_OUTPUT_DIR || '.output', 'deploy')
mkdirSync(directory, { recursive: true })
copyFileSync(resolve('.nuxt/dist/server/client.precomputed.mjs'), resolve(directory, 'client.precomputed.mjs'))
