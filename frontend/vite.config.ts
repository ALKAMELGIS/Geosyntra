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
import {
  CUSTOM_DOMAIN_HOSTS,
  resolveProductionPublicUrl,
  resolveViteBasePath,
} from './config/viteAppConfig'
const gzipAsync = promisify(gzip)
const brotliAsync = promisify(brotliCompress)

/**
 * Public Mapbox `pk.*` tokens are usually URL-restricted to the production origin
 * (e.g. https://www.geosyntra.org). The browser cannot spoof that `Referer` from
 * localhost, so direct tile requests get 403 and basemaps render blank. In dev we
 * proxy `*.mapbox.com` through Vite and inject the allowed `Referer` server-side.
 * Override with MAPBOX_DEV_REFERER when the token is locked to a different origin.
 */
const MAPBOX_DEV_REFERER = `${(process.env.MAPBOX_DEV_REFERER || 'https://www.geosyntra.org').replace(/\/+$/, '')}/`

/** Vite dev/preview proxy for Mapbox API — adds the token's allowed Referer. */
function mapboxDevProxyOptions() {
  return {
    target: 'https://api.mapbox.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/__mapbox/, ''),
    configure: (proxy: { on: (event: string, cb: (proxyReq: { setHeader: (k: string, v: string) => void; removeHeader: (k: string) => void }) => void) => void }) => {
      proxy.on('proxyReq', proxyReq => {
        proxyReq.setHeader('Referer', MAPBOX_DEV_REFERER)
        proxyReq.removeHeader('origin')
      })
    },
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const buildBase = resolveViteBasePath()
const buildPublicUrl = resolveProductionPublicUrl(buildBase)

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
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (err) {
      // Best-effort compression: a missing dir (e.g. closeBundle racing the write,
      // or an upstream build error) must not be the thing that fails the build.
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return []
      throw err
    }
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
    enforce: 'post',
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      const outDir = isAbsolute(config.build.outDir) ? config.build.outDir : join(config.root, config.build.outDir)
      const files = await walk(outDir)
      if (files.length === 0) return
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
  const baseWithSlash = buildBase
  const noTrailingSlash = baseWithSlash.replace(/\/$/, '')
  if (!noTrailingSlash) {
    return { name: 'geosyntra-base-trailing-slash' }
  }
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

/** Inject SHA-256 shim immediately before the Vite module entry (HTTP / legacy bundles). */
function injectCryptoShimBeforeModule(): Plugin {
  const marker = 'geosyntra-crypto-shim.js'
  const tag = `<script src="${marker}"></script>`
  return {
    name: 'geosyntra-crypto-shim-inject',
    apply: 'build',
    transformIndexHtml(html) {
      if (html.includes(marker)) return html
      return html.replace(/<script type="module"/, `${tag}\n    <script type="module"`)
    },
  }
}

/** Custom domain over plain HTTP breaks Web Crypto; upgrade before the SPA bundle runs. */
function forceHttpsOnCustomDomain(): Plugin {
  const hosts = JSON.stringify([...CUSTOM_DOMAIN_HOSTS])
  const marker = 'data-geosyntra-https-redirect'
  const snippet = `<script ${marker}="1">;(function(){try{if(location.protocol!=="http:")return;var h=(location.hostname||"").toLowerCase();var custom=${hosts};if(custom.indexOf(h)===-1)return;location.replace("https://"+location.host+location.pathname+location.search+location.hash);}catch(_){}})();</script>`
  return {
    name: 'geosyntra-https-redirect',
    apply: 'build',
    transformIndexHtml(html) {
      if (html.includes(marker)) return html
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${snippet}`)
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
  const href = buildPublicUrl
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
  const base = buildBase
  const withSlash = base.endsWith('/') ? base : `${base}/`
  const noSlash = withSlash.replace(/\/$/, '') || '/'
  const marker = 'data-geosyntra-gh-pages-redirect'
  const customHosts = JSON.stringify([...CUSTOM_DOMAIN_HOSTS])
  const snippet = `<script ${marker}="1">;(function(){try{var h=String(location.hostname||"").toLowerCase();var custom=${customHosts};var onGh=h.indexOf("github.io")!==-1;var onCustom=custom.indexOf(h)!==-1;if(!onGh&&!onCustom)return;var p=location.pathname||"";var ws=${JSON.stringify(withSlash)};var ns=${JSON.stringify(noSlash)};var g=location.hash||"";if(g.startsWith("#/")){var route=g.slice(2).split("?")[0].replace(/\\/$/,"");if(route==="app/onboarding/trial-start"){location.replace(location.origin+ws+"?start=1&wizard=pricing#/");return;}if(route==="app/auth/login"){location.replace(location.origin+ws+"?start=1&wizard=auth&mode=signin#/");return;}if(route==="app/auth/register"){location.replace(location.origin+ws+"?start=1&wizard=auth&mode=signup#/");return;}if(route==="app/billing/pricing"){location.replace(location.origin+ws+"?start=1&wizard=pricing#/");return;}}if(g&&g!=="#/"&&!g.startsWith("#/")){try{sessionStorage.setItem("geosyntra-scroll-to",g.slice(1));}catch(_){}location.replace(location.origin+ws+location.search+"#/");return;}if(p===ns){location.replace(location.origin+ws+location.search+(g&&g.length>1?g:"#/"));return;}if((p===ws||p===ns+"/")&&(!g||g==="#")){location.replace(location.origin+ws+location.search+"#/");}}catch(_){}})();</script>`
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
  const url = buildPublicUrl.replace(/\/?$/, '/')
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
  base: buildBase,
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
    assetsInlineLimit: 0,
    // No manualChunks: forcing jspdf/chartjs into separate chunks hoists Vite's preload helper
    // into those vendors and makes the Satellite Intelligence lazy entry import jspdf before
    // the route module finishes init → `Cannot access '…' before initialization` on GitHub Pages.
  },
  plugins: [
    geosyntraBaseTrailingSlashRedirect(),
    forceHttpsOnCustomDomain(),
    injectCryptoShimBeforeModule(),
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
      '/__mapbox': mapboxDevProxyOptions(),
      '/api/analysis-engine': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/analysis-engine/, ''),
      },
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
      '/__mapbox': mapboxDevProxyOptions(),
      '/api/analysis-engine': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/analysis-engine/, ''),
      },
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
