// @ts-check
import { globalIgnores } from 'eslint/config'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  globalIgnores([
    '.codex/**',
    '.deploy-tmp/**',
    '.firecrawl/**',
    '.tmp-*',
    '.tmp-*/**',
    '.tmp_*',
    '.tmp_*/**',
    '_yeu_.tmp-*',
    '**/*.recovered'
  ]),
  {
    files: [
      'app/**/*.{js,ts,vue}',
      'map/**/*.{js,ts}',
      'server/**/*.{js,ts}'
    ],
    rules: {
      'no-console': 'error'
    }
  }
)
