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
  const snippet = `<script ${marker}="1">;(function(){try{var h=String(location.hostname||"");if(h.indexOf("github.io")===-1)return;var p=location.pathname||"";var ws=${JSON.stringify(withSlash)};var ns=${JSON.stringify(noSlash)};var g=location.hash||"";if(g.startsWith("#/")){var route=g.slice(2).split("?")[0].replace(/\\/$/,"");if(route==="app/onboarding/trial-start"){location.replace(location.origin+ws+"?start=1&wizard=pricing#/");return;}if(route==="app/auth/login"){location.replace(location.origin+ws+"?start=1&wizard=auth&mode=signin#/");return;}if(route==="app/auth/register"){location.replace(location.origin+ws+"?start=1&wizard=auth&mode=signup#/");return;}if(route==="app/billing/pricing"){location.replace(location.origin+ws+"?start=1&wizard=pricing#/");return;}}if(g&&g!=="#/"&&!g.startsWith("#/")){try{sessionStorage.setItem("geosyntra-scroll-to",g.slice(1));}catch(_){}location.replace(location.origin+ws+location.search+"#/");return;}if(p===ns){location.replace(location.origin+ws+location.search+(g&&g.length>1?g:"#/"));return;}if((p===ws||p===ns+"/")&&(!g||g==="#")){location.replace(location.origin+ws+location.search+"#/");}}catch(_){}})();</script>`
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
    },
  },
  build: {
    chunkSizeWarningLimit: 1800,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('mapbox-gl')) return 'mapbox-gl'
            if (id.includes('jspdf')) return 'jspdf'
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('chart.js') || id.includes('react-chartjs')) return 'chartjs'
          }
        },
      },
    },
  },
  plugins: [
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
    // Match dev server so `npm run preview` + Node API still persist API vault to agri_api_secrets.json.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true,
      },
    },
  }
})
