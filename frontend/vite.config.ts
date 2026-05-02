import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, gzip } from 'node:zlib'
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { appConfig } from './config/app'

const gzipAsync = promisify(gzip)
const brotliAsync = promisify(brotliCompress)

const COMPRESSIBLE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.wasm',
  '.xml',
])

function buildCompressionPlugin(): Plugin {
  let config: ResolvedConfig

  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true })
    const files = await Promise.all(
      entries.map((entry) => {
        const fullPath = join(dir, entry.name)
        return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath])
      }),
    )
    return files.flat()
  }

  return {
    name: 'agrocloud-compression',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      const outDir = isAbsolute(config.build.outDir) ? config.build.outDir : join(config.root, config.build.outDir)
      const files = await walk(outDir)
      await Promise.all(
        files
          .filter((file) => COMPRESSIBLE_EXTENSIONS.has(extname(file)) && !file.endsWith('.gz') && !file.endsWith('.br'))
          .map(async (file) => {
            const content = await readFile(file)
            if (content.byteLength < 10240) return
            const [gzipped, brotlied] = await Promise.all([gzipAsync(content), brotliAsync(content)])
            await Promise.all([writeFile(`${file}.gz`, gzipped), writeFile(`${file}.br`, brotlied)])
          }),
      )
    },
  }
}

/** Vite serves `base` with a trailing slash; `/AgroCloud` (no slash) returns 404. Browsers/bookmarks often omit it. */
function agroCloudBaseTrailingSlashRedirect(): Plugin {
  const baseWithSlash = appConfig.basePath
  const noTrailingSlash = baseWithSlash.replace(/\/$/, '')
  const redirect: (req: IncomingMessage, res: ServerResponse, next: () => void) => void = (req, res, next) => {
    const raw = req.url ?? ''
    const pathOnly = raw.split('?')[0] ?? ''
    if (pathOnly !== noTrailingSlash) {
      next()
      return
    }
    const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : ''
    const location = query ? `${noTrailingSlash}/${query}` : baseWithSlash
    res.writeHead(302, { Location: location })
    res.end()
  }
  return {
    name: 'agrocloud-base-trailing-slash',
    configureServer(s) {
      s.middlewares.use(redirect)
    },
    configurePreviewServer(s) {
      s.middlewares.use(redirect)
    },
  }
}

/** Unique per CI build so Pages index.html ETag changes and browsers/CDNs refetch the shell. */
function pagesBuildStamp(): Plugin {
  return {
    name: 'agri-pages-build-stamp',
    apply: 'build',
    transformIndexHtml(html) {
      if (html.includes('name="agro-pages-build"')) return html
      const stamp = (process.env.GITHUB_SHA || '').trim() || `local-${Date.now()}`
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta name="agro-pages-build" content="${stamp}" />`,
      )
    },
  }
}

/** Production HTML: canonical URL for GitHub Pages (see appConfig.productionPublicUrl). */
function productionCanonicalLink(): Plugin {
  const href = appConfig.productionPublicUrl
  return {
    name: 'agri-production-canonical',
    apply: 'build',
    transformIndexHtml(html) {
      if (html.includes('rel="canonical"')) return html
      return html.replace('</head>', `    <link rel="canonical" href="${href}" />\n  </head>`)
    },
  }
}

export default defineConfig({
  base: appConfig.basePath,
  build: {
    chunkSizeWarningLimit: 1800,
    modulePreload: {
      polyfill: false,
    },
  },
  plugins: [
    agroCloudBaseTrailingSlashRedirect(),
    pagesBuildStamp(),
    productionCanonicalLink(),
    react(),
    ...(process.env.ENABLE_PWA === 'true'
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: null,
            devOptions: { enabled: false },
            includeAssets: ['favicon.ico', 'avatars/*.svg'],
            manifest: {
              name: 'Agri Cloud System',
              short_name: 'AgriCloud',
              description: 'Agricultural Management and Satellite Analysis System',
              theme_color: '#ffffff',
              icons: [
                {
                  src: 'avatars/emirati-farmer.svg',
                  sizes: '192x192',
                  type: 'image/svg+xml'
                },
                {
                  src: 'avatars/emirati-farmer.svg',
                  sizes: '512x512',
                  type: 'image/svg+xml'
                }
              ]
            }
          })
        ]
      : []),
    buildCompressionPlugin()
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**']
  },
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true
      }
    }
  },
  preview: {
    port: 5173,
    host: true,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  }
})
