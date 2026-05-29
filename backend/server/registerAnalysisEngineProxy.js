/**
 * Reverse-proxy Microsoft Planetary Computer analysis_engine (`/mpc/*`) for the SPA.
 * Set ANALYSIS_ENGINE_URL (default http://127.0.0.1:8000).
 */
export function registerAnalysisEngineProxy(app) {
  const base = (process.env.ANALYSIS_ENGINE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

  app.use('/api/analysis-engine', async (req, res) => {
    const suffix = req.url || '/';
    const target = `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
    try {
      const headers = { accept: req.headers.accept || 'application/json' };
      if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];

      const init = {
        method: req.method,
        headers,
      };
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        init.body =
          req.rawBody && Buffer.isBuffer(req.rawBody)
            ? req.rawBody
            : req.body != null
              ? JSON.stringify(req.body)
              : undefined;
      }

      const upstream = await fetch(target, init);
      const text = await upstream.text();
      res.status(upstream.status);
      const ct = upstream.headers.get('content-type');
      if (ct) res.setHeader('content-type', ct);
      res.send(text);
    } catch (e) {
      res.status(502).json({
        ok: false,
        error: 'analysis_engine_unreachable',
        detail: e instanceof Error ? e.message : String(e),
        target,
      });
    }
  });
}
