declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
}

declare const process: {
  env: Record<string, string | undefined>
}
