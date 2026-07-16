// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
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
