/* ============================================================
   BukuServis — Cloudflare Pages Function
   Laluan: /api/*
   Binding diperlukan:
     DB              → D1 database
     APP_PIN         → PIN untuk log masuk (secret)
     SESSION_SECRET  → kunci tandatangan cookie (secret)
   ============================================================ */

const SESSION_COOKIE = 'bs_session';
const SESSION_DAYS = 30;

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';

  try {
    if (path === '/login' && request.method === 'POST') return await handleLogin(request, env, url);
    if (path === '/logout' && request.method === 'POST') return handleLogout(url);

    const token = getCookie(request, SESSION_COOKIE);
    const ok = await verifySession(token, env);
    if (!ok) return json({ error: 'Sesi tamat. Sila log masuk semula.' }, 401);

    if (path === '/bootstrap' && request.method === 'GET') {
      return json(await bootstrap(env));
    }

    if (path === '/mutate' && request.method === 'POST') {
      const body = await request.json();
      await mutate(env, body);
      return json(await bootstrap(env));
    }

    return json({ error: 'Laluan tidak dijumpai.' }, 404);
  } catch (err) {
    const msg = err && err.message ? err.message : 'Ralat pelayan.';
    return json({ error: msg }, 400);
  }
}

/* ---------------- auth ---------------- */
async function handleLogin(request, env, url) {
  if (!env.APP_PIN) return json({ error: 'APP_PIN belum ditetapkan pada pelayan.' }, 500);
  if (!env.SESSION_SECRET) return json({ error: 'SESSION_SECRET belum ditetapkan pada pelayan.' }, 500);

  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }

  const pin = String(body.pin || '');
  if (!safeEqual(pin, String(env.APP_PIN))) {
    return json({ error: 'PIN salah.' }, 401);
  }

  const token = await createSession(env.SESSION_SECRET);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;

  return json({ ok: true }, 200, { 'set-cookie': cookie });
}

function handleLogout(url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return json({ ok: true }, 200, {
    'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  });
}

async function createSession(secret) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const sig = await hmac(secret, String(exp));
  return `${exp}.${sig}`;
}

async function verifySession(token, env) {
  if (!token || !env.SESSION_SECRET) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  if (!isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmac(env.SESSION_SECRET, parts[0]);
  return safeEqual(expected, parts[1]);
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return b64url(new Uint8Array(sig));
}

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.indexOf(name + '=') === 0) return p.slice(name.length + 1);
  }
  return null;
}

/* ---------------- helpers ---------------- */
function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }, headers || {})
  });
}

function num(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function str(v, max) {
  const s = String(v == null ? '' : v).trim();
  return max ? s.slice(0, max) : s;
}

function nullableNum(v) {
  const n = num(v);
  return n > 0 ? n : null;
}

/* ---------------- bootstrap ---------------- */
async function bootstrap(env) {
  const db = env.DB;

  const [vehicles, types, visits, items, fuel, readings] = await Promise.all([
    db.prepare('SELECT * FROM vehicles ORDER BY id').all(),
    db.prepare('SELECT * FROM service_types ORDER BY sort_order, id').all(),
    db.prepare('SELECT * FROM visits ORDER BY date DESC, odometer DESC').all(),
    db.prepare('SELECT * FROM visit_items ORDER BY id').all(),
    db.prepare('SELECT * FROM fuel_logs ORDER BY date DESC, odometer DESC').all(),
    db.prepare('SELECT * FROM readings ORDER BY date DESC, odometer DESC').all()
  ]);

  const byVisit = new Map();
  (items.results || []).forEach((i) => {
    if (!byVisit.has(i.visit_id)) byVisit.set(i.visit_id, []);
    byVisit.get(i.visit_id).push(i);
  });

  return {
    vehicles: vehicles.results || [],
    service_types: types.results || [],
    visits: (visits.results || []).map((v) => Object.assign({}, v, { items: byVisit.get(v.id) || [] })),
    fuel_logs: fuel.results || [],
    readings: readings.results || []
  };
}

/* ---------------- mutasi ---------------- */
async function mutate(env, body) {
  const db = env.DB;
  const type = body && body.type;
  const action = body && body.action;
  const data = (body && body.data) || {};

  if (type === 'vehicle') {
    if (action === 'create') {
      await db.prepare(
        'INSERT INTO vehicles (name, type, plate, make, model, year, odometer_base, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        str(data.name, 60) || 'Kenderaan',
        data.type === 'motorcycle' ? 'motorcycle' : 'car',
        str(data.plate, 20),
        str(data.make, 40),
        str(data.model, 60),
        data.year ? Number(data.year) : null,
        num(data.odometer_base),
        new Date().toISOString()
      ).run();
      return;
    }

    if (action === 'update') {
      await db.prepare(
        'UPDATE vehicles SET name = ?, type = ?, plate = ?, make = ?, model = ?, year = ?, odometer_base = ? WHERE id = ?'
      ).bind(
        str(data.name, 60) || 'Kenderaan',
        data.type === 'motorcycle' ? 'motorcycle' : 'car',
        str(data.plate, 20),
        str(data.make, 40),
        str(data.model, 60),
        data.year ? Number(data.year) : null,
        num(data.odometer_base),
        Number(data.id)
      ).run();
      return;
    }

    if (action === 'delete') {
      const id = Number(data.id);
      await db.batch([
        db.prepare('DELETE FROM visit_items WHERE visit_id IN (SELECT id FROM visits WHERE vehicle_id = ?)').bind(id),
        db.prepare('DELETE FROM visits WHERE vehicle_id = ?').bind(id),
        db.prepare('DELETE FROM fuel_logs WHERE vehicle_id = ?').bind(id),
        db.prepare('DELETE FROM readings WHERE vehicle_id = ?').bind(id),
        db.prepare('DELETE FROM vehicles WHERE id = ?').bind(id)
      ]);
      return;
    }
  }

  if (type === 'visit') {
    if (action === 'create') {
      const items = (data.items || []).filter((i) => Number(i.service_type_id) > 0 || str(i.custom_name));
      if (!items.length) throw new Error('Tambah sekurang-kurangnya satu item servis.');

      const res = await db.prepare(
        'INSERT INTO visits (vehicle_id, date, odometer, workshop, extra_cost, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        Number(data.vehicle_id),
        str(data.date, 10),
        num(data.odometer),
        str(data.workshop, 80),
        num(data.extra_cost),
        str(data.notes, 500),
        new Date().toISOString()
      ).run();

      const visitId = res.meta.last_row_id;
      const stmts = items.map((i) => db.prepare(
        'INSERT INTO visit_items (visit_id, service_type_id, custom_name, brand, product, kind, qty, price, next_due_km, next_due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        visitId,
        Number(i.service_type_id) > 0 ? Number(i.service_type_id) : null,
        str(i.custom_name, 80),
        str(i.brand, 60),
        str(i.product, 80),
        str(i.kind, 40),
        num(i.qty) || 1,
        num(i.price),
        i.next_due_km ? Number(i.next_due_km) : null,
        i.next_due_date ? str(i.next_due_date, 10) : null,
        str(i.notes, 300)
      ));
      await db.batch(stmts);
      return;
    }

    if (action === 'update') {
      const id = Number(data.id);
      if (!id) throw new Error('Rekod servis tidak dijumpai.');

      const items = (data.items || []).filter((i) => Number(i.service_type_id) > 0 || str(i.custom_name));
      if (!items.length) throw new Error('Tambah sekurang-kurangnya satu item servis.');

      const stmts = [
        db.prepare(
          'UPDATE visits SET vehicle_id = ?, date = ?, odometer = ?, workshop = ?, extra_cost = ?, notes = ? WHERE id = ?'
        ).bind(
          Number(data.vehicle_id),
          str(data.date, 10),
          num(data.odometer),
          str(data.workshop, 80),
          num(data.extra_cost),
          str(data.notes, 500),
          id
        ),
        db.prepare('DELETE FROM visit_items WHERE visit_id = ?').bind(id)
      ];

      items.forEach((i) => {
        stmts.push(db.prepare(
          'INSERT INTO visit_items (visit_id, service_type_id, custom_name, brand, product, kind, qty, price, next_due_km, next_due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          id,
          Number(i.service_type_id) > 0 ? Number(i.service_type_id) : null,
          str(i.custom_name, 80),
          str(i.brand, 60),
          str(i.product, 80),
          str(i.kind, 40),
          num(i.qty) || 1,
          num(i.price),
          i.next_due_km ? Number(i.next_due_km) : null,
          i.next_due_date ? str(i.next_due_date, 10) : null,
          str(i.notes, 300)
        ));
      });

      await db.batch(stmts);
      return;
    }

    if (action === 'delete') {
      const id = Number(data.id);
      await db.batch([
        db.prepare('DELETE FROM visit_items WHERE visit_id = ?').bind(id),
        db.prepare('DELETE FROM visits WHERE id = ?').bind(id)
      ]);
      return;
    }
  }

  if (type === 'fuel') {
    if (action === 'create') {
      await db.prepare(
        'INSERT INTO fuel_logs (vehicle_id, date, odometer, liters, total_cost, fuel_type, station, full_tank, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        Number(data.vehicle_id),
        str(data.date, 10),
        num(data.odometer),
        num(data.liters),
        num(data.total_cost),
        str(data.fuel_type, 20),
        str(data.station, 30),
        data.full_tank ? 1 : 0,
        str(data.notes, 300)
      ).run();
      return;
    }

    if (action === 'update') {
      const id = Number(data.id);
      if (!id) throw new Error('Rekod minyak tidak dijumpai.');
      await db.prepare(
        'UPDATE fuel_logs SET vehicle_id = ?, date = ?, odometer = ?, liters = ?, total_cost = ?, fuel_type = ?, station = ?, full_tank = ?, notes = ? WHERE id = ?'
      ).bind(
        Number(data.vehicle_id),
        str(data.date, 10),
        num(data.odometer),
        num(data.liters),
        num(data.total_cost),
        str(data.fuel_type, 20),
        str(data.station, 30),
        data.full_tank ? 1 : 0,
        str(data.notes, 300),
        id
      ).run();
      return;
    }

    if (action === 'delete') {
      await db.prepare('DELETE FROM fuel_logs WHERE id = ?').bind(Number(data.id)).run();
      return;
    }
  }

  if (type === 'reading') {
    if (action === 'create') {
      await db.prepare(
        'INSERT INTO readings (vehicle_id, date, odometer, notes) VALUES (?, ?, ?, ?)'
      ).bind(
        Number(data.vehicle_id),
        str(data.date, 10),
        num(data.odometer),
        str(data.notes, 300)
      ).run();
      return;
    }

    if (action === 'update') {
      const id = Number(data.id);
      if (!id) throw new Error('Bacaan tidak dijumpai.');
      await db.prepare(
        'UPDATE readings SET vehicle_id = ?, date = ?, odometer = ?, notes = ? WHERE id = ?'
      ).bind(
        Number(data.vehicle_id),
        str(data.date, 10),
        num(data.odometer),
        str(data.notes, 300),
        id
      ).run();
      return;
    }

    if (action === 'delete') {
      await db.prepare('DELETE FROM readings WHERE id = ?').bind(Number(data.id)).run();
      return;
    }
  }

  if (type === 'serviceType') {
    if (action === 'create') {
      const max = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM service_types').first();
      await db.prepare(
        'INSERT INTO service_types (code, name, category, applies_to, track, interval_km, interval_months, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        null,
        str(data.name, 60) || 'Servis',
        str(data.category, 20) || 'lain',
        str(data.applies_to, 20) || 'both',
        data.track === 'history' ? 'history' : 'interval',
        nullableNum(data.interval_km),
        nullableNum(data.interval_months),
        '',
        (max && max.m ? max.m : 0) + 1
      ).run();
      return;
    }

    if (action === 'update') {
      await db.prepare(
        'UPDATE service_types SET name = ?, category = ?, applies_to = ?, track = ?, interval_km = ?, interval_months = ? WHERE id = ?'
      ).bind(
        str(data.name, 60) || 'Servis',
        str(data.category, 20) || 'lain',
        str(data.applies_to, 20) || 'both',
        data.track === 'history' ? 'history' : 'interval',
        nullableNum(data.interval_km),
        nullableNum(data.interval_months),
        Number(data.id)
      ).run();
      return;
    }

    if (action === 'delete') {
      const id = Number(data.id);
      const used = await db.prepare('SELECT COUNT(*) AS n FROM visit_items WHERE service_type_id = ?').bind(id).first();
      if (used && used.n > 0) throw new Error('Item ini sudah digunakan dalam rekod. Ia tidak boleh dibuang.');
      await db.prepare('DELETE FROM service_types WHERE id = ?').bind(id).run();
      return;
    }
  }

  throw new Error('Jenis data tidak dikenali.');
}
