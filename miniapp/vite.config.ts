import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)

export default defineConfig(({ mode }) => {
  process.env.UNI_INPUT_DIR ||= rootDir
  process.env.UNI_CLI_CONTEXT ||= rootDir
  process.env.UNI_PLATFORM ||= mode === 'production' ? 'mp-weixin' : 'h5'
  process.env.UNI_OUTPUT_DIR ||= fileURLToPath(new URL('./unpackage/dist/build/mp-weixin', import.meta.url))

  const uniModule = require('@dcloudio/vite-plugin-uni')
  const uni = typeof uniModule === 'function' ? uniModule : uniModule.default

  return {
    plugins: [uni()],
    build: {
      outDir: process.env.UNI_OUTPUT_DIR,
      emptyOutDir: false,
    },
    resolve: {
      alias: {
        '@mini': rootDir,
        '@shared': new URL('../shared', import.meta.url).pathname
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5174
    }
  }
})
