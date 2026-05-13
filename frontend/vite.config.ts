import { createRequire } from 'node:module'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompress, gzip } from 'node:zlib'
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { appConfig } from './config/app'

const gzipAsync = promisify(gzip)
const brotliAsync = promisify(brotliCompress)

const __dirname = dirname(fileURLToPath(import.meta.url))

/** External SIW module (copied Satellite Intelligence + isolated siw_* persistence). */
const SATELLITE_INTELLIGENCE_WORKSPACE_SRC = resolve(
  'C:/Users/mohamed.abass.WUSOOM/Downloads/Maps/GIS RS Intelligence Workspace/src',
)

/** SIW sources live outside Vite `root`; resolve bare imports from this frontend package's node_modules. */
function satelliteIntelligenceWorkspaceDependencyResolve(): Plugin {
  const require = createRequire(resolve(__dirname, 'package.json'))
  return {
    name: 'siw-external-node-resolve',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer?.includes('GIS RS Intelligence Workspace')) return null
      if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) return null
      try {
        return require.resolve(id, { paths: [__dirname] })
      } catch {
        return null
      }
    },
  }
}
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

/** Vite serves `base` with a trailing slash; `/Geosyntra` (no slash) returns 404. Browsers/bookmarks often omit it. */
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
      const run = (process.env.GITHUB_RUN_ID || '').trim()
      const attempt = (process.env.GITHUB_RUN_ATTEMPT || '').trim()
      const sha = (process.env.GITHUB_SHA || '').trim()
      const stamp = [run, attempt, sha].filter(Boolean).join('-') || `local-${Date.now()}`
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

/**
 * GitHub Pages: `/Geosyntra` (no trailing slash) and `/Geosyntra/` with empty hash break the HashRouter shell.
 * Normalize to `.../Geosyntra/#/` before the app bundle runs.
 */
function ghPagesHashAndSlashRedirect(): Plugin {
  const base = appConfig.basePath
  const withSlash = base.endsWith('/') ? base : `${base}/`
  const noSlash = withSlash.replace(/\/$/, '')
  const marker = 'data-agro-gh-pages-redirect'
  const snippet = `<script ${marker}="1">;(function(){try{var h=String(location.hostname||"");if(h.indexOf("github.io")===-1)return;var p=location.pathname||"";var ws=${JSON.stringify(withSlash)};var ns=${JSON.stringify(noSlash)};if(p===ns){location.replace(location.origin+ws+location.search+(location.hash&&location.hash.length>1?location.hash:"#/"));return;}if((p===ws||p===ns+"/")&&(!location.hash||location.hash==="#")){location.replace(location.origin+ws+location.search+"#/");}}catch(_){}})();</script>`
  return {
    name: 'agro-gh-pages-hash-redirect',
    apply: 'build',
    transformIndexHtml(html) {
      if (html.includes(marker)) return html
      return html.replace('<body>', `<body>\n    ${snippet}`)
    },
  }
}

export default defineConfig({
  base: appConfig.basePath,
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@satellite-intelligence-workspace': SATELLITE_INTELLIGENCE_WORKSPACE_SRC,
    },
  },
  build: {
    chunkSizeWarningLimit: 1800,
    modulePreload: {
      polyfill: false,
    },
  },
  plugins: [
    satelliteIntelligenceWorkspaceDependencyResolve(),
    agroCloudBaseTrailingSlashRedirect(),
    pagesBuildStamp(),
    ghPagesHashAndSlashRedirect(),
    productionCanonicalLink(),
    react(),
    ...(process.env.ENABLE_PWA === 'true'
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: null,
            devOptions: { enabled: false },
            includeAssets: ['favicon.svg', 'favicon.png', 'favicon-16x16.png', 'favicon-32x32.png'],
            manifest: {
              name: 'Geosyntra Platform',
              short_name: 'Geosyntra',
              description: 'Geospatial intelligence, satellite imagery, and operational GIS workflows',
              theme_color: '#ffffff',
              icons: [
                {
                  src: 'favicon.svg',
                  sizes: '512x512',
                  type: 'image/svg+xml',
                  purpose: 'any'
                },
                {
                  src: 'favicon.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any'
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
    fs: {
      allow: [SATELLITE_INTELLIGENCE_WORKSPACE_SRC],
    },
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
