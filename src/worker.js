/* ============================================================
   BukuServis — Cloudflare Worker
   - /api/*        → dikendalikan oleh src/api.js
   - semua lain    → fail statik dari ./public
   Binding diperlukan (dashboard → Settings → Bindings):
     DB              → D1 database
     APP_PIN         → PIN log masuk (secret)
     SESSION_SECRET  → kunci tandatangan cookie (secret)
   ============================================================ */

import { onRequest } from './api.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return onRequest({ request, env, ctx });
    }

    return env.ASSETS.fetch(request);
  }
};
