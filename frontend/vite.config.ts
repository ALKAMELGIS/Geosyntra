import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
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

/**
 * External SIW module (copied Satellite Intelligence + isolated siw_* persistence).
 * Override locally with `SIW_SRC` to point at any other checkout. CI and machines without the
 * external tree fall back to the in-repo stub at `src/satellite-intelligence-workspace-fallback`
 * so production builds succeed.
 */
const SATELLITE_INTELLIGENCE_WORKSPACE_EXTERNAL_DEFAULT = 'C:/Users/mohamed.abass.WUSOOM/Downloads/Maps/GIS RS Intelligence Workspace/src'
const SATELLITE_INTELLIGENCE_WORKSPACE_EXTERNAL = resolve(
  process.env.SIW_SRC?.trim() || SATELLITE_INTELLIGENCE_WORKSPACE_EXTERNAL_DEFAULT,
)
const SATELLITE_INTELLIGENCE_WORKSPACE_FALLBACK = resolve(
  __dirname,
  'src/satellite-intelligence-workspace-fallback',
)
const SATELLITE_INTELLIGENCE_WORKSPACE_SRC = existsSync(SATELLITE_INTELLIGENCE_WORKSPACE_EXTERNAL)
  ? SATELLITE_INTELLIGENCE_WORKSPACE_EXTERNAL
  : SATELLITE_INTELLIGENCE_WORKSPACE_FALLBACK

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
    name: 'geosyntra-compression',
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
function geosyntraBaseTrailingSlashRedirect(): Plugin {
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
    name: 'geosyntra-base-trailing-slash',
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
    name: 'geosyntra-pages-build-stamp',
    apply: 'build',
    transformIndexHtml(html) {
      const run = (process.env.GITHUB_RUN_ID || '').trim()
      const attempt = (process.env.GITHUB_RUN_ATTEMPT || '').trim()
      const sha = (process.env.GITHUB_SHA || '').trim()
      const stamp = [run, attempt, sha].filter(Boolean).join('-') || `local-${Date.now()}`
      const meta = `<meta name="geosyntra-pages-build" content="${stamp}" />`
      if (html.includes('name="geosyntra-pages-build"')) return html
      if (html.includes('name="agro-pages-build"')) {
        return html.replace(/<meta name="agro-pages-build"[^>]*\/?>/, meta)
      }
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${meta}`)
    },
  }
}

/** Production HTML: canonical URL for GitHub Pages (see appConfig.productionPublicUrl). */
function productionCanonicalLink(): Plugin {
  const href = appConfig.productionPublicUrl
  return {
    name: 'geosyntra-production-canonical',
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
  const marker = 'data-geosyntra-gh-pages-redirect'
  const snippet = `<script ${marker}="1">;(function(){try{var h=String(location.hostname||"");if(h.indexOf("github.io")===-1)return;var p=location.pathname||"";var ws=${JSON.stringify(withSlash)};var ns=${JSON.stringify(noSlash)};if(p===ns){location.replace(location.origin+ws+location.search+(location.hash&&location.hash.length>1?location.hash:"#/"));return;}if((p===ws||p===ns+"/")&&(!location.hash||location.hash==="#")){location.replace(location.origin+ws+location.search+"#/");}}catch(_){}})();</script>`
  return {
    name: 'geosyntra-gh-pages-hash-redirect',
    apply: 'build',
    transformIndexHtml(html) {
      if (html.includes(marker)) return html
      let out = html.replace(/<script data-agro-gh-pages-redirect="1"[^>]*>[\s\S]*?<\/script>\s*/i, '')
      out = out.replace(/<script data-geosyntra-gh-pages-redirect="1"[^>]*>[\s\S]*?<\/script>\s*/i, '')
      return out.replace('<body>', `<body>\n    ${snippet}`)
    },
  }
}

/** Open Graph / Twitter cards for production shell (GitHub Pages + crawlers). */
function geosyntraSocialMetaTags(): Plugin {
  const title = appConfig.appName
  const description =
    'Geosyntra Platform — enterprise GIS, satellite intelligence, and operational geospatial workflows.'
  const url = appConfig.productionPublicUrl.replace(/\/?$/, '/')
  return {
    name: 'geosyntra-social-meta',
    apply: 'build',
    transformIndexHtml(html) {
      if (html.includes('property="og:title"')) return html
      const block = `    <meta property="og:type" content="website" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
`
      return html.replace('</head>', `${block}  </head>`)
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
    geosyntraBaseTrailingSlashRedirect(),
    pagesBuildStamp(),
    ghPagesHashAndSlashRedirect(),
    productionCanonicalLink(),
    geosyntraSocialMetaTags(),
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
              theme_color: '#0b1220',
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
