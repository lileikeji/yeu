/**
 * 构建期注入的坐标混淆 key（nuxt.config 生成，vite define / nitro replace 落地）。
 * 运行时三端（app client、SSR、nitro API）读到的都是同一构建的同一值。
 */
declare const __GEO_CIPHER_KEY__: string
