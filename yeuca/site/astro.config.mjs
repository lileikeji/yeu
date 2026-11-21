// @ts-check
import { defineConfig } from 'astro/config';

// 仰恩大学计算机协会（YEUCA · 泉州洛江）官方网站
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://yeuca.huiliyill.cn',
  output: 'static',
  build: {
    format: 'directory',
  },
  compressHTML: true,
  devToolbar: {
    enabled: false,
  },
});
