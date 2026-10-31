/* ============================================================
   BukuServis — UI
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- state ---------------- */
  const state = {
    db: null,
    mode: 'local',
    view: 'dashboard',
    vehicleId: null,
    histFilter: 'all',
    period: '6m'
  };

  const CAT = {
    enjin: 'Enjin', brek: 'Brek', tayar: 'Tayar & Roda', elektrik: 'Elektrik',
    penyejuk: 'Penyejuk', transmisi: 'Transmisi', hantar: 'Hantar',
    aksesori: 'Ubah Suai / Aksesori', lain: 'Lain-lain'
  };
  const KINDS = ['Mineral', 'Semi Sintetik', 'Full Sintetik'];
  const FUEL_TYPES = ['RON95', 'RON97', 'RON100', 'Diesel'];
  const STATIONS = ['Petronas', 'Shell', 'BHPetrol', 'Caltex', 'Petron', 'Lain-lain'];

  /* ---------------- utils ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const num = (v) => {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : 0;
  };

  const nf = (n) => Number(n || 0).toLocaleString('ms-MY');
  const money = (n) => 'RM ' + Number(n || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = (n) => 'RM ' + Math.round(Number(n || 0)).toLocaleString('ms-MY');
  const kmText = (n) => nf(Math.round(n)) + ' km';

  function localISO(d) {
    const x = new Date((d || new Date()).getTime() - (d || new Date()).getTimezoneOffset() * 60000);
    return x.toISOString().slice(0, 10);
  }
  const today = () => localISO();
  const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localISO(d); };
  const parseDate = (iso) => new Date(iso + 'T00:00:00');

  const fmtDate = (iso) => (iso ? parseDate(iso).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const fmtDateShort = (iso) => (iso ? parseDate(iso).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' }) : '—');
  const fmtMonth = (iso) => parseDate(iso).toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' });
  const monthShort = (key) => new Date(key + '-01T00:00:00').toLocaleDateString('ms-MY', { month: 'short' });

  const addMonths = (iso, m) => {
    const d = parseDate(iso);
    const day = d.getDate();
    d.setMonth(d.getMonth() + Number(m));
    if (d.getDate() < day) d.setDate(0);
    return localISO(d);
  };
  const daysUntil = (iso) => Math.round((parseDate(iso) - parseDate(today())) / 86400000);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function toast(msg, isErr) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.className = 'toast';
      setTimeout(() => { el.hidden = true; }, 220);
    }, 2400);
  }

  /* ---------------- data helpers ---------------- */
  const vehicleById = (id) => (state.db ? state.db.vehicles.find((v) => v.id === Number(id)) : null);
  const stById = (id) => (state.db ? state.db.service_types.find((t) => t.id === Number(id)) : null);

  function currentVehicle() {
    if (!state.db || !state.db.vehicles.length) return null;
    return vehicleById(state.vehicleId) || state.db.vehicles[0];
  }

  function visitTotal(v) {
    const items = (v.items || []).reduce((s, i) => s + num(i.price), 0);
    return items + num(v.extra_cost);
  }

  function currentOdo(v) {
    if (!v) return 0;
    let max = num(v.odometer_base);
    state.db.visits.forEach((x) => { if (x.vehicle_id === v.id) max = Math.max(max, num(x.odometer)); });
    state.db.fuel_logs.forEach((x) => { if (x.vehicle_id === v.id) max = Math.max(max, num(x.odometer)); });
    state.db.readings.forEach((x) => { if (x.vehicle_id === v.id) max = Math.max(max, num(x.odometer)); });
    return max;
  }

  function lastOdoInfo(v) {
    let best = { odo: num(v.odometer_base), date: null };
    const consider = (odo, date) => {
      const n = num(odo);
      if (n > best.odo || (n === best.odo && date && (!best.date || date > best.date))) best = { odo: n, date: date };
    };
    state.db.visits.forEach((x) => { if (x.vehicle_id === v.id) consider(x.odometer, x.date); });
    state.db.fuel_logs.forEach((x) => { if (x.vehicle_id === v.id) consider(x.odometer, x.date); });
    state.db.readings.forEach((x) => { if (x.vehicle_id === v.id) consider(x.odometer, x.date); });
    return best;
  }

  function itemName(it) {
    if (!it) return '—';
    const t = stById(it.service_type_id);
    return t ? t.name : (String(it.custom_name || '').trim() || 'Item lain');
  }

  // Item 'history' (coverset, ekzos, clutch plate…) direkod tetapi tidak
  // dimasukkan ke senarai perhatian / due supaya dashboard kekal bersih.
  function applicableTypes(v, includeHistory) {
    return state.db.service_types.filter((t) => {
      if (!includeHistory && t.track === 'history') return false;
      if (t.applies_to === 'both' || t.applies_to === v.type) return true;
      return state.db.visits.some((x) => x.vehicle_id === v.id && x.items.some((i) => i.service_type_id === t.id));
    });
  }

  /* ---------------- enjin due ---------------- */
  function dueFor(v, t) {
    let last = null;
    state.db.visits.forEach((x) => {
      if (x.vehicle_id !== v.id) return;
      const it = (x.items || []).find((i) => i.service_type_id === t.id);
      if (!it) return;
      if (!last || num(x.odometer) > num(last.visit.odometer) ||
          (num(x.odometer) === num(last.visit.odometer) && String(x.date) > String(last.visit.date))) {
        last = { visit: x, item: it };
      }
    });

    const odo = currentOdo(v);
    if (!last) {
      return { status: 'none', last: null, dueKm: null, dueDate: null, remKm: null, remDays: null, progress: 0 };
    }

    const dueKm = last.item.next_due_km ? num(last.item.next_due_km)
      : (t.interval_km ? num(last.visit.odometer) + num(t.interval_km) : null);
    const dueDate = last.item.next_due_date ? last.item.next_due_date
      : (t.interval_months ? addMonths(last.visit.date, t.interval_months) : null);

    const remKm = dueKm != null ? dueKm - odo : null;
    const remDays = dueDate ? daysUntil(dueDate) : null;

    let status = 'ok';
    if ((remKm != null && remKm <= 0) || (remDays != null && remDays <= 0)) status = 'bad';
    else if ((remKm != null && remKm <= 500) || (remDays != null && remDays <= 30)) status = 'warn';

    let progress = 0;
    if (remKm != null && t.interval_km) progress = 1 - remKm / num(t.interval_km);
    else if (remDays != null && t.interval_months) progress = 1 - remDays / (num(t.interval_months) * 30.44);
    progress = clamp(progress, 0.02, 1);

    return { status, last, dueKm, dueDate, remKm, remDays, progress };
  }

  function dueLabel(r) {
    const parts = [];
    if (r.remKm != null) {
      if (r.remKm < 0) parts.push('Lewat ' + kmText(Math.abs(r.remKm)));
      else parts.push(kmText(r.remKm) + ' lagi');
    }
    if (r.remDays != null) {
      if (r.remDays < 0) parts.push('Lewat ' + Math.abs(r.remDays) + ' hari');
      else parts.push(r.remDays + ' hari lagi');
    }
    return parts.join(' · ') || '—';
  }

  const pillText = { ok: 'OK', warn: 'Hampir', bad: 'Lewat', none: 'Tiada rekod' };
  const rank = { bad: 3, warn: 2, ok: 1, none: 0 };

  function worstStatus(v) {
    let worst = 'ok';
    applicableTypes(v).forEach((t) => {
      const s = dueFor(v, t).status;
      if (rank[s] > rank[worst]) worst = s;
    });
    return worst;
  }

  /* ---------------- fuel ---------------- */
  function fuelSeries(vid) {
    const logs = state.db.fuel_logs
      .filter((f) => f.vehicle_id === vid)
      .sort((a, b) => num(a.odometer) - num(b.odometer) || String(a.date).localeCompare(String(b.date)));
    const out = [];
    for (let i = 1; i < logs.length; i++) {
      const prev = logs[i - 1];
      const cur = logs[i];
      if (!prev.full_tank || !cur.full_tank) continue;
      const dist = num(cur.odometer) - num(prev.odometer);
      if (dist <= 0 || !num(cur.liters)) continue;
      out.push({
        date: cur.date, odo: num(cur.odometer), liters: num(cur.liters), dist: dist,
        kml: dist / num(cur.liters),
        station: prev.station || '', fuelType: prev.fuel_type || '',
        pricePerL: num(cur.total_cost) / num(cur.liters),
        log: cur
      });
    }
    return out;
  }

  function spendSince(vid, iso) {
    let total = 0;
    state.db.visits.forEach((x) => { if (x.vehicle_id === vid && x.date >= iso) total += visitTotal(x); });
    state.db.fuel_logs.forEach((x) => { if (x.vehicle_id === vid && x.date >= iso) total += num(x.total_cost); });
    return total;
  }

  /* ---------------- events ---------------- */
  function vehicleEvents(vid) {
    const out = [];
    state.db.visits.filter((x) => x.vehicle_id === vid).forEach((x) => {
      const names = (x.items || []).map(itemName);
      out.push({
        kind: 'visit', id: x.id, date: x.date, odo: num(x.odometer),
        title: names.join(' + ') || 'Servis',
        sub: [x.workshop, names.length + ' item'].filter(Boolean).join(' · '),
        amount: visitTotal(x), ref: x
      });
    });
    state.db.fuel_logs.filter((x) => x.vehicle_id === vid).forEach((x) => {
      out.push({
        kind: 'fuel', id: x.id, date: x.date, odo: num(x.odometer),
        title: 'Isi minyak ' + num(x.liters).toFixed(2) + ' L',
        sub: [x.station, x.fuel_type, x.full_tank ? 'Penuh' : 'Sebahagian'].filter(Boolean).join(' · '),
        amount: num(x.total_cost), ref: x
      });
    });
    state.db.readings.filter((x) => x.vehicle_id === vid).forEach((x) => {
      out.push({
        kind: 'reading', id: x.id, date: x.date, odo: num(x.odometer),
        title: 'Bacaan odometer', sub: x.notes || 'Dikemas kini manual',
        amount: null, ref: x
      });
    });
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.odo - a.odo || b.id - a.id);
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    if (!state.db) return;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));

    const view = $('#view');
    if (state.view === 'dashboard') view.innerHTML = dashboardHTML();
    else if (state.view === 'history') view.innerHTML = historyHTML();
    else if (state.view === 'reports') view.innerHTML = reportsHTML();
    else view.innerHTML = settingsHTML();

    window.scrollTo(0, 0);
  }

  function noVehicleHTML() {
    return `
      <div class="empty">
        <div class="big">🚗</div>
        <h3>Belum ada kenderaan</h3>
        <p>Tambah kereta atau motosikal pertama untuk mula merekod servis, mileage dan isi minyak.</p>
        <button class="btn btn-primary" data-act="add-vehicle" type="button">+ Tambah kenderaan</button>
      </div>`;
  }

  /* ---------------- dashboard ---------------- */
  function dashboardHTML() {
    const v = currentVehicle();
    if (!v) return noVehicleHTML();

    const odo = currentOdo(v);
    const info = lastOdoInfo(v);
    const items = applicableTypes(v).map((t) => ({ t: t, due: dueFor(v, t) }));
    const attention = items
      .filter((x) => x.due.status === 'bad' || x.due.status === 'warn')
      .sort((a, b) => rank[b.due.status] - rank[a.due.status] || (a.due.remKm == null ? 1e9 : a.due.remKm) - (b.due.remKm == null ? 1e9 : b.due.remKm));

    const series = fuelSeries(v.id);
    const lastKml = series.length ? series[series.length - 1].kml : null;
    const spend30 = spendSince(v.id, daysAgoISO(30));

    const sorted = items.slice().sort((a, b) => rank[b.due.status] - rank[a.due.status] || b.due.progress - a.due.progress);
    const recent = vehicleEvents(v.id).slice(0, 3);

    return `
      ${vehicleChips()}

      <section class="hero card">
        <div class="hero-top">
          <button class="odo-btn" data-act="odo-history" type="button" title="Lihat sejarah mileage">
            <div class="muted small">${esc(v.make || '')} ${esc(v.model || '')} ${v.plate ? '· ' + esc(v.plate) : ''}</div>
            <div class="odo">${nf(odo)}<span> km</span></div>
            <div class="muted tiny">${info.date ? 'Dikemas kini ' + fmtDate(info.date) : 'Belum ada bacaan odometer'} · <span class="odo-link">Sejarah mileage →</span></div>
          </button>
          <button class="btn btn-soft btn-sm" data-act="add-reading" type="button">+ Bacaan</button>
        </div>
        <div class="hero-stats">
          <div><b>${lastKml ? lastKml.toFixed(1) : '—'}</b><span>km/L terakhir</span></div>
          <div><b>${money0(spend30)}</b><span>30 hari</span></div>
          <div><b>${attention.length}</b><span>perlu perhatian</span></div>
        </div>
      </section>

      ${attention.length ? `
      <section class="section">
        <h2 class="section-title">Perlu perhatian <span class="count">${attention.length}</span></h2>
        <div class="list">
          ${attention.map((x) => `
            <button class="due-row is-${x.due.status}" data-act="service-detail" data-id="${x.t.id}" type="button">
              <div class="due-main">
                <div class="due-name">${esc(x.t.name)}</div>
                <div class="due-sub">${x.due.last ? 'Terakhir ' + fmtDate(x.due.last.visit.date) + ' · ' + nf(x.due.last.visit.odometer) + ' km' : 'Belum ada rekod'}</div>
              </div>
              <div class="due-right"><span class="pill ${x.due.status}">${dueLabel(x.due)}</span></div>
            </button>`).join('')}
        </div>
      </section>` : `
      <section class="section">
        <div class="card" style="padding:16px;display:flex;gap:12px;align-items:center">
          <div style="font-size:22px">✓</div>
          <div>
            <div style="font-weight:650">Semua servis dalam jadual</div>
            <div class="muted small">Tiada item yang hampir atau lewat due.</div>
          </div>
        </div>
      </section>`}

      <section class="section">
        <h2 class="section-title">Item servis <span class="count">${items.length}</span></h2>
        <div class="card" style="padding:4px 14px">
          <div class="items">
            ${sorted.map((x) => itemHTML(v, x.t, x.due)).join('')}
          </div>
        </div>
      </section>

      ${recent.length ? `
      <section class="section">
        <h2 class="section-title">Aktiviti terkini</h2>
        ${recent.map(eventHTML).join('')}
        <button class="btn btn-ghost btn-block btn-sm" data-act="nav" data-view="history" type="button">Lihat semua sejarah</button>
      </section>` : ''}
    `;
  }

  function vehicleChips() {
    return `<div class="chips">
      ${state.db.vehicles.map((v) => `
        <button class="chip ${v.id === currentVehicle().id ? 'active' : ''}" data-act="select-vehicle" data-id="${v.id}" type="button">
          <span class="dot ${worstStatus(v)}"></span>${esc(v.name)}
        </button>`).join('')}
      <button class="chip" data-act="add-vehicle" type="button">+ Kenderaan</button>
    </div>`;
  }

  function itemHTML(v, t, due) {
    const cls = due.status === 'none' ? 'none' : due.status;
    const pct = Math.round(due.progress * 100);
    let range = '';
    if (due.dueKm != null) range = nf(due.last.visit.odometer) + ' → ' + nf(due.dueKm) + ' km';
    else if (due.dueDate) range = 'Due ' + fmtDateShort(due.dueDate);
    else range = 'Tiada interval';

    let lastText = 'Belum ada rekod';
    if (due.last) {
      const brand = [due.last.item.brand, due.last.item.product].filter(Boolean).join(' ');
      lastText = 'Terakhir ' + fmtDateShort(due.last.visit.date) + (brand ? ' · ' + esc(brand) : '');
    }

    return `
      <button class="item item-btn" data-act="service-detail" data-id="${t.id}" type="button">
        <div class="item-head">
          <span>${esc(t.name)}</span>
          <span class="range">${range}</span>
        </div>
        <div class="bar"><span class="bar-fill ${cls}" style="width:${due.status === 'none' ? 4 : pct}%"></span></div>
        <div class="item-foot">
          <span>${lastText}</span>
          <span class="right ${cls}">${due.status === 'none' ? 'Tiada rekod' : dueLabel(due)}</span>
        </div>
      </button>`;
  }

  function eventHTML(e) {
    const ico = e.kind === 'visit' ? '🔧' : e.kind === 'fuel' ? '⛽' : '📍';
    return `
      <button class="event" data-act="event-detail" data-kind="${e.kind}" data-id="${e.id}" type="button">
        <div class="event-icon ${e.kind}">${ico}</div>
        <div class="event-main">
          <div class="event-title">${esc(e.title)}</div>
          <div class="event-sub">${fmtDate(e.date)} · ${nf(e.odo)} km${e.sub ? ' · ' + esc(e.sub) : ''}</div>
        </div>
        <div class="event-amt">${e.amount != null ? money0(e.amount) : ''}</div>
      </button>`;
  }

  /* ---------------- history ---------------- */
  function historyHTML() {
    const v = currentVehicle();
    if (!v) return noVehicleHTML();

    const all = vehicleEvents(v.id);
    const events = all.filter((e) => state.histFilter === 'all' || e.kind === state.histFilter);

    let html = '';
    let cur = '';
    events.forEach((e) => {
      const m = String(e.date).slice(0, 7);
      if (m !== cur) { cur = m; html += `<div class="month-head">${fmtMonth(e.date)}</div>`; }
      html += eventHTML(e);
    });

    const filters = [
      ['all', 'Semua'], ['visit', 'Servis'], ['fuel', 'Minyak'], ['reading', 'Odometer']
    ];

    return `
      ${vehicleChips()}
      <div class="section" style="margin-top:8px">
        <div class="seg">
          ${filters.map((f) => `<button type="button" class="${state.histFilter === f[0] ? 'active' : ''}" data-act="hist-filter" data-f="${f[0]}">${f[1]}</button>`).join('')}
        </div>
      </div>
      ${events.length ? html : `<div class="empty"><div class="big">📄</div><h3>Tiada rekod</h3><p>Belum ada rekod untuk penapis ini.</p></div>`}
    `;
  }

  /* ---------------- reports ---------------- */
  function periodStart() {
    const p = state.period;
    if (p === 'all') return null;
    const m = p === '3m' ? 3 : p === '6m' ? 6 : 12;
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    return localISO(d);
  }

  function monthlySpend(vid, start) {
    const map = new Map();
    const add = (date, amt) => {
      if (!date) return;
      if (start && date < start) return;
      const k = String(date).slice(0, 7);
      map.set(k, (map.get(k) || 0) + amt);
    };
    state.db.visits.forEach((x) => { if (x.vehicle_id === vid) add(x.date, visitTotal(x)); });
    state.db.fuel_logs.forEach((x) => { if (x.vehicle_id === vid) add(x.date, num(x.total_cost)); });

    const keys = Array.from(map.keys()).sort();
    const out = [];
    if (!keys.length) return out;
    const from = start ? new Date(start + 'T00:00:00') : new Date(keys[0] + '-01T00:00:00');
    const to = new Date();
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    let guard = 0;
    while (cursor <= to && guard++ < 36) {
      const k = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0');
      out.push({ key: k, total: map.get(k) || 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }

  function categorySpend(vid, start) {
    const map = new Map();
    state.db.visits.forEach((x) => {
      if (x.vehicle_id !== vid) return;
      if (start && x.date < start) return;
      (x.items || []).forEach((i) => {
        const t = stById(i.service_type_id);
        const cat = t ? (t.category || 'lain') : 'lain';
        map.set(cat, (map.get(cat) || 0) + num(i.price));
      });
    });
    return Array.from(map.entries())
      .map((e) => ({ cat: e[0], total: e[1] }))
      .sort((a, b) => b.total - a.total);
  }

  function oilBrandStats(vid) {
    const rows = [];
    const v = vehicleById(vid);
    if (!v) return [];
    const changes = [];
    state.db.visits.filter((x) => x.vehicle_id === v.id).forEach((x) => {
      (x.items || []).forEach((it) => {
        const t = stById(it.service_type_id);
        if (t && t.code && t.code.indexOf('oil_engine') === 0) {
          changes.push({ odo: num(x.odometer), date: x.date, brand: (it.brand || 'Tanpa jenama'), product: it.product || '', price: num(it.price) });
        }
      });
    });
    changes.sort((a, b) => a.odo - b.odo);
    for (let i = 0; i < changes.length - 1; i++) {
      const a = changes[i];
      const b = changes[i + 1];
      const dist = b.odo - a.odo;
      if (dist < 500 || dist > 25000) continue;
      rows.push({ brand: a.brand, dist: dist, price: a.price, per1000: a.price / dist * 1000 });
    }

    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.brand)) map.set(r.brand, { brand: r.brand, n: 0, total: 0, per1000: 0 });
      const o = map.get(r.brand);
      o.n += 1; o.total += r.price; o.per1000 += r.per1000;
    });
    return Array.from(map.values())
      .map((o) => ({ brand: o.brand, n: o.n, avgPrice: o.total / o.n, avgPer1000: o.per1000 / o.n }))
      .sort((a, b) => a.avgPer1000 - b.avgPer1000);
  }

  function stationStats(vid, start) {
    const map = new Map();
    fuelSeries(vid).forEach((s) => {
      if (start && s.date < start) return;
      const key = s.station || 'Tidak dinyatakan';
      if (!map.has(key)) map.set(key, { station: key, n: 0, kml: 0 });
      const o = map.get(key);
      o.n += 1; o.kml += s.kml;
    });
    return Array.from(map.values())
      .map((o) => ({ station: o.station, n: o.n, avg: o.kml / o.n }))
      .sort((a, b) => b.avg - a.avg);
  }

  function reportsHTML() {
    const v = currentVehicle();
    if (!v) return noVehicleHTML();

    const start = periodStart();
    const visits = state.db.visits.filter((x) => x.vehicle_id === v.id && (!start || x.date >= start));
    const fuel = state.db.fuel_logs.filter((x) => x.vehicle_id === v.id && (!start || x.date >= start));

    const spend = visits.reduce((s, x) => s + visitTotal(x), 0) + fuel.reduce((s, x) => s + num(x.total_cost), 0);
    const odos = visits.map((x) => num(x.odometer))
      .concat(fuel.map((x) => num(x.odometer)))
      .concat(state.db.readings.filter((x) => x.vehicle_id === v.id && (!start || x.date >= start)).map((x) => num(x.odometer)));
    const dist = odos.length > 1 ? Math.max.apply(null, odos) - Math.min.apply(null, odos) : 0;
    const perKm = dist > 0 ? spend / dist : null;

    const series = fuelSeries(v.id).filter((s) => !start || s.date >= start);
    const avgKml = series.length ? series.reduce((s, x) => s + x.kml, 0) / series.length : null;
    const liters = fuel.reduce((s, x) => s + num(x.liters), 0);

    const months = monthlySpend(v.id, start);
    const maxMonth = months.reduce((m, x) => Math.max(m, x.total), 0);
    const cats = categorySpend(v.id, start);
    const oils = oilBrandStats(v.id);
    const stations = stationStats(v.id, start);

    const periods = [['3m', '3 bulan'], ['6m', '6 bulan'], ['12m', '12 bulan'], ['all', 'Semua']];

    return `
      ${vehicleChips()}

      <div class="section" style="margin-top:8px">
        <div class="seg">
          ${periods.map((p) => `<button type="button" class="${state.period === p[0] ? 'active' : ''}" data-act="period" data-p="${p[0]}">${p[1]}</button>`).join('')}
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat"><b>${money0(spend)}</b><span>Jumlah kos</span></div>
        <div class="stat"><b>${perKm != null ? 'RM ' + perKm.toFixed(2) : '—'}</b><span>Kos per km</span></div>
        <div class="stat"><b>${avgKml != null ? avgKml.toFixed(1) : '—'}</b><span>Purata km/L</span></div>
        <div class="stat"><b>${liters ? liters.toFixed(1) + ' L' : '—'}</b><span>Minyak diisi</span></div>
      </div>

      ${months.length ? `
      <section class="section">
        <h2 class="section-title">Kos bulanan</h2>
        <div class="card" style="padding:12px 14px">
          <div class="bars">
            ${months.map((m) => `
              <div class="bar-col" title="${monthShort(m.key)}: ${money(m.total)}">
                <div class="v" style="height:${maxMonth ? Math.max(3, Math.round(m.total / maxMonth * 100)) : 3}%"></div>
                <div class="l">${monthShort(m.key)}</div>
              </div>`).join('')}
          </div>
          <div class="note">Jumlah dalam tempoh: <b>${money(spend)}</b>${dist ? ' · jarak dikesan ' + kmText(dist) : ''}</div>
        </div>
      </section>` : ''}

      ${oils.length ? `
      <section class="section">
        <h2 class="section-title">Minyak hitam — kos per 1,000 km</h2>
        <div class="card" style="padding:6px 14px 10px">
          <table class="tbl">
            <thead><tr><th>Jenama</th><th class="r">Kali</th><th class="r">Purata</th><th class="r">RM / 1,000 km</th></tr></thead>
            <tbody>
              ${oils.map((o) => `<tr>
                <td class="strong">${esc(o.brand)}</td>
                <td class="r">${o.n}</td>
                <td class="r">${money0(o.avgPrice)}</td>
                <td class="r strong">${o.avgPer1000.toFixed(2)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          <div class="note">Dikira dari jarak sebenar antara dua tukar minyak berturut-turut. Semakin rendah, semakin jimat.</div>
        </div>
      </section>` : ''}

      ${stations.length > 1 ? `
      <section class="section">
        <h2 class="section-title">Prestasi ikut stesen minyak</h2>
        <div class="card" style="padding:6px 14px 10px">
          <table class="tbl">
            <thead><tr><th>Stesen</th><th class="r">Isi</th><th class="r">Purata km/L</th></tr></thead>
            <tbody>
              ${stations.map((s) => `<tr>
                <td class="strong">${esc(s.station)}</td>
                <td class="r">${s.n}</td>
                <td class="r strong">${s.avg.toFixed(2)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          <div class="note">km/L dikira daripada tangki yang diisi di stesen tersebut. Perbezaan kecil biasanya disebabkan cara memandu, bukan jenama minyak.</div>
        </div>
      </section>` : ''}

      ${cats.length ? `
      <section class="section">
        <h2 class="section-title">Kos ikut kategori</h2>
        <div class="card" style="padding:6px 14px 10px">
          <table class="tbl">
            <thead><tr><th>Kategori</th><th class="r">Jumlah</th><th class="r">%</th></tr></thead>
            <tbody>
              ${cats.map((c) => `<tr>
                <td>${esc(CAT[c.cat] || c.cat)}</td>
                <td class="r">${money0(c.total)}</td>
                <td class="r">${spend ? Math.round(c.total / spend * 100) : 0}%</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>` : ''}

      ${series.length ? `
      <section class="section">
        <h2 class="section-title">Isi minyak terkini</h2>
        <div class="card" style="padding:6px 14px 10px">
          <table class="tbl">
            <thead><tr><th>Tarikh</th><th class="r">Jarak</th><th class="r">Liter</th><th class="r">km/L</th></tr></thead>
            <tbody>
              ${series.slice(-8).reverse().map((s) => `<tr>
                <td>${fmtDateShort(s.date)}</td>
                <td class="r">${nf(s.dist)}</td>
                <td class="r">${s.liters.toFixed(1)}</td>
                <td class="r strong">${s.kml.toFixed(2)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>` : ''}

      ${!spend ? `<div class="empty"><div class="big">📊</div><h3>Belum ada data</h3><p>Rekod servis atau isi minyak dahulu untuk lihat laporan.</p></div>` : ''}
    `;
  }

  /* ---------------- settings ---------------- */
  function settingsHTML() {
    const vehicles = state.db.vehicles;
    const types = state.db.service_types;

    return `
      <section class="section" style="margin-top:14px">
        <h2 class="section-title">Kenderaan <span class="count">${vehicles.length}</span></h2>
        <div class="list">
          ${vehicles.map((v) => `
            <div class="due-row" style="cursor:default">
              <div class="due-main">
                <div class="due-name">${v.type === 'motorcycle' ? '🏍️' : '🚗'} ${esc(v.name)}</div>
                <div class="due-sub">${esc([v.make, v.model, v.plate].filter(Boolean).join(' · ') || 'Tiada butiran')}</div>
              </div>
              <div class="row" style="gap:6px">
                <button class="btn btn-ghost btn-sm" data-act="edit-vehicle" data-id="${v.id}" type="button">Edit</button>
              </div>
            </div>`).join('')}
        </div>
        <button class="btn btn-ghost btn-block btn-sm" style="margin-top:10px" data-act="add-vehicle" type="button">+ Tambah kenderaan</button>
      </section>

      <section class="section">
        <h2 class="section-title">Katalog servis <span class="count">${types.length}</span></h2>
        <div class="card" style="padding:6px 14px">
          ${['motorcycle', 'car', 'both'].map((grp) => {
            const list = types.filter((t) => t.applies_to === grp);
            if (!list.length) return '';
            const label = grp === 'motorcycle' ? 'Motosikal' : grp === 'car' ? 'Kereta' : 'Umum';
            const row = (t) => `
              <div class="item" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
                <div>
                  <div style="font-size:14px;font-weight:600">${esc(t.name)}${t.track === 'history' ? ' <span class="pill none">sekali</span>' : ''}</div>
                  <div class="tiny muted">${intervalText(t)}</div>
                </div>
                <button class="icon-btn" data-act="edit-st" data-id="${t.id}" type="button" title="Edit">✎</button>
              </div>`;
            const interval = list.filter((t) => t.track !== 'history');
            const history = list.filter((t) => t.track === 'history');
            return `
              <div class="month-head" style="position:static;background:transparent;padding:12px 0 6px">${label}</div>
              ${interval.map(row).join('')}
              ${history.length ? `<div class="tiny muted" style="padding:8px 0 2px">Barang &amp; ubah suai</div>${history.map(row).join('')}` : ''}
            `;
          }).join('')}
        </div>
        <button class="btn btn-ghost btn-block btn-sm" style="margin-top:10px" data-act="add-st" type="button">+ Tambah item servis</button>
        <div class="note">Interval ini ialah nilai lalai. Boleh override bila merekod servis.</div>
      </section>

      <section class="section">
        <h2 class="section-title">Paparan</h2>
        <div class="card" style="padding:14px">
          <div class="row" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-weight:650;font-size:14px">Tema</div>
              <div class="tiny muted">Ikut sistem, cerah atau gelap.</div>
            </div>
            <div class="seg">
              ${[['auto', 'Auto'], ['light', 'Cerah'], ['dark', 'Gelap']].map(([k, label]) => `
                <button type="button" class="${themePref() === k ? 'active' : ''}" data-act="theme" data-p="${k}">${label}</button>`).join('')}
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Data</h2>
        <div class="card" style="padding:14px">
          <div class="row" style="flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" data-act="export" type="button">⬇ Eksport JSON</button>
            ${state.mode === 'local' ? `
              <button class="btn btn-ghost btn-sm" data-act="import" type="button">⬆ Import JSON</button>
              <button class="btn btn-danger btn-sm" data-act="reset" type="button">Reset data demo</button>` : ''}
            ${state.mode === 'remote' ? `<button class="btn btn-ghost btn-sm" data-act="logout" type="button">Log keluar</button>` : ''}
          </div>
          <div class="note">
            ${state.mode === 'remote'
              ? 'Data disimpan dalam Cloudflare D1 dan disegerakkan ke semua peranti.'
              : 'Mod demo: data disimpan dalam browser ini sahaja (localStorage). Sambung ke Cloudflare D1 untuk sync antara peranti.'}
          </div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Tentang</h2>
        <div class="card" style="padding:14px">
          <div class="kv"><span class="k">Versi</span><span class="v">1.3.1</span></div>
          <div class="kv"><span class="k">Mod</span><span class="v">${state.mode === 'remote' ? 'Cloudflare D1' : 'Demo (localStorage)'}</span></div>
          <div class="note">BukuServis — rekod servis, mileage dan isi minyak untuk kereta &amp; motosikal. Semua rekod boleh diedit semula bila-bila masa.</div>
        </div>
      </section>
    `;
  }

  function intervalText(t) {
    if (t.track === 'history') return 'Rekod sahaja · tiada peringatan';
    const parts = [];
    if (t.interval_km) parts.push(nf(t.interval_km) + ' km');
    if (t.interval_months) parts.push(t.interval_months + ' bulan');
    return parts.length ? parts.join(' atau ') : 'Tiada interval';
  }

  /* ============================================================
     SHEET
     ============================================================ */
  function closeSheet() {
    const root = $('#modal-root');
    root.classList.remove('open');
    root.innerHTML = '';
    document.body.style.overflow = '';
  }

  function sheet(opts) {
    const root = $('#modal-root');
    const withForm = opts.submit !== false;
    const body = withForm
      ? `<form id="sheet-form" novalidate>${opts.body}
           <div class="sheet-foot">
             ${opts.danger ? `<button type="button" class="btn btn-danger" data-danger>${esc(opts.danger)}</button>` : ''}
             <button type="button" class="btn btn-ghost" data-close>Batal</button>
             <button type="submit" class="btn btn-primary">${esc(opts.submit || 'Simpan')}</button>
           </div>
         </form>`
      : `<div class="sheet-body">${opts.body}</div>`;

    root.innerHTML = `
      <div class="sheet-backdrop" data-close></div>
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet-head">
          <h2>${esc(opts.title)}</h2>
          <button class="icon-btn" type="button" data-close aria-label="Tutup">✕</button>
        </div>
        ${withForm ? `<div class="sheet-body">${body}</div>` : body}
      </div>`;

    root.classList.add('open');
    document.body.style.overflow = 'hidden';

    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));

    if (withForm) {
      const form = $('#sheet-form');
      const btn = form.querySelector('button[type="submit"]');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        btn.disabled = true;
        const orig = btn.textContent;
        btn.textContent = 'Menyimpan…';
        try {
          await opts.onSubmit(form);
          closeSheet();
        } catch (err) {
          toast(err.message || 'Ralat', true);
          btn.disabled = false;
          btn.textContent = orig;
        }
      });
      const danger = form.querySelector('[data-danger]');
      if (danger && opts.onDanger) danger.addEventListener('click', () => opts.onDanger());
    }

    const first = root.querySelector('input, select, textarea');
    if (first && window.innerWidth > 640) setTimeout(() => first.focus(), 50);
  }

  /* ============================================================
     FORMS
     ============================================================ */
  function vehicleOptions(selectedId) {
    return state.db.vehicles.map((v) =>
      `<option value="${v.id}" ${Number(selectedId) === v.id ? 'selected' : ''}>${esc(v.name)}${v.plate ? ' — ' + esc(v.plate) : ''}</option>`
    ).join('');
  }

  function listOptions(list, current) {
    const arr = list.slice();
    if (current && arr.indexOf(current) === -1) arr.unshift(current);
    return arr.map((x) => `<option ${x === current ? 'selected' : ''}>${esc(x)}</option>`).join('');
  }

  function serviceOptions(selectedId, vehicleType) {
    const isCustom = selectedId === 0 || selectedId === '0';
    const selected = stById(selectedId);
    const applies = (t) => (selected && t.id === selected.id) || !vehicleType || t.applies_to === 'both' || t.applies_to === vehicleType;
    const opt = (t) => `<option value="${t.id}" ${Number(selectedId) === t.id ? 'selected' : ''}>${esc(t.name)}</option>`;

    const interval = state.db.service_types.filter((t) => applies(t) && t.track !== 'history');
    const history = state.db.service_types.filter((t) => applies(t) && t.track === 'history');

    return `<option value="">— Pilih item —</option>`
      + (interval.length ? `<optgroup label="Servis berkala">${interval.map(opt).join('')}</optgroup>` : '')
      + (history.length ? `<optgroup label="Barang &amp; ubah suai">${history.map(opt).join('')}</optgroup>` : '')
      + `<option value="0" ${isCustom ? 'selected' : ''}>+ Item lain (taip sendiri)…</option>`;
  }

  function itemRowHTML(selectedId, vehicleType, item) {
    const it = item || {};
    const hasItem = !!item;
    const sel = hasItem
      ? (it.service_type_id != null ? it.service_type_id : 0)
      : (selectedId === 0 || selectedId === '0' ? 0 : (selectedId || ''));
    const isCustom = Number(sel) === 0;
    return `
      <div class="item-row" data-row>
        <div class="item-row-head">
          <select class="input st-select">${serviceOptions(sel, vehicleType)}</select>
          <button class="icon-btn" type="button" data-act="del-row" title="Buang">✕</button>
        </div>
        <div class="custom-wrap" ${isCustom ? '' : 'hidden'}>
          <input class="input custom-name" value="${esc(it.custom_name || '')}" placeholder="Nama item (cth: Coverset R25)" autocomplete="off">
        </div>
        <div class="grid-2">
          <input class="input brand" value="${esc(it.brand || '')}" placeholder="Jenama (cth: Shell)" autocomplete="off">
          <input class="input product" value="${esc(it.product || '')}" placeholder="Produk / gred (cth: Helix 5W-30)" autocomplete="off">
        </div>
        <div class="grid-2">
          <select class="input kind">
            <option value="">Jenis</option>
            ${KINDS.map((k) => `<option ${it.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
          </select>
          <input class="input price" type="number" inputmode="decimal" step="0.01" min="0" value="${it.price ? it.price : ''}" placeholder="Harga RM">
        </div>
      </div>`;
  }

  function openVisitForm(preselectId, existing) {
    const isEdit = !!existing;
    const v = isEdit ? vehicleById(existing.vehicle_id) : currentVehicle();
    if (!v) return openVehicleForm(null);

    const rows = isEdit && existing.items && existing.items.length
      ? existing.items.map((i) => itemRowHTML('', v.type, i)).join('')
      : itemRowHTML(preselectId || '', v.type);
    const initialTotal = isEdit ? visitTotal(existing) : 0;

    sheet({
      title: isEdit ? 'Edit rekod servis' : 'Rekod servis',
      submit: isEdit ? 'Simpan perubahan' : 'Simpan servis',
      body: `
        <div class="field">
          <label class="label">Kenderaan</label>
          <select class="input" name="vehicle_id" required>${vehicleOptions(isEdit ? existing.vehicle_id : v.id)}</select>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Tarikh</label>
            <input class="input" type="date" name="date" value="${isEdit ? esc(existing.date) : today()}" required>
          </div>
          <div class="field">
            <label class="label">Odometer (km)</label>
            <input class="input" type="number" inputmode="numeric" name="odometer" min="0" value="${isEdit ? num(existing.odometer) : currentOdo(v)}" required>
          </div>
        </div>
        <div class="field">
          <label class="label">Bengkel (pilihan)</label>
          <input class="input" name="workshop" value="${esc(existing ? existing.workshop : '')}" placeholder="cth: Bengkel Ah Seng" autocomplete="off">
        </div>

        <div class="field">
          <label class="label">Item servis</label>
          <div id="items-wrap">${rows}</div>
          <button class="btn btn-ghost btn-sm" type="button" data-act="add-row">+ Tambah item</button>
        </div>

        <div class="grid-2">
          <div class="field">
            <label class="label">Kos lain / upah (RM)</label>
            <input class="input" type="number" inputmode="decimal" step="0.01" min="0" name="extra_cost" value="${existing && num(existing.extra_cost) ? num(existing.extra_cost) : ''}" placeholder="0.00">
          </div>
          <div class="field">
            <label class="label">Jumlah</label>
            <input class="input" id="visit-total" value="${money(initialTotal)}" readonly tabindex="-1">
          </div>
        </div>

        <div class="field">
          <label class="label">Nota (pilihan)</label>
          <textarea class="input" name="notes" placeholder="cth: bengkel cadang tukar tayar bulan depan">${esc(existing ? existing.notes : '')}</textarea>
        </div>

        <div class="note">Tip: tukar jenama minyak? Kekalkan item <b>Minyak Hitam Enjin</b>, cuma tukar medan jenama. Untuk coverset, ekzos atau up-spec, pilih <b>+ Item lain</b> — ia direkod dalam sejarah tanpa menambah senarai perhatian.</div>
      `,
      onSubmit: async (form) => {
        const items = $$('.item-row', form).map((row) => {
          const stVal = Number($('.st-select', row).value);
          return {
            service_type_id: stVal,
            custom_name: stVal === 0 ? $('.custom-name', row).value : '',
            brand: $('.brand', row).value,
            product: $('.product', row).value,
            kind: $('.kind', row).value,
            price: num($('.price', row).value)
          };
        }).filter((i) => i.service_type_id > 0 || i.custom_name.trim());

        if (!items.length) throw new Error('Pilih item servis atau taip nama item lain.');

        const fd = new FormData(form);
        const odo = num(fd.get('odometer'));
        if (odo <= 0) throw new Error('Masukkan bacaan odometer.');

        const db = await API.mutate('visit', isEdit ? 'update' : 'create', {
          id: isEdit ? existing.id : undefined,
          vehicle_id: Number(fd.get('vehicle_id')),
          date: fd.get('date'),
          odometer: odo,
          workshop: fd.get('workshop'),
          extra_cost: num(fd.get('extra_cost')),
          notes: fd.get('notes'),
          items: items
        });
        afterMutate(db, isEdit ? 'Rekod servis dikemas kini' : 'Servis disimpan');
      }
    });

    wireVisitForm();
  }

  function rebuildItemRows(form, vehicleId) {
    const v = vehicleById(vehicleId);
    const vt = v ? v.type : null;
    $$('.item-row', form).forEach((row) => {
      const sel = $('.st-select', row);
      const cur = sel.value;
      sel.innerHTML = serviceOptions(cur, vt);
      if (!sel.value) sel.value = '';
      const wrap = $('.custom-wrap', row);
      if (wrap) wrap.hidden = sel.value !== '0';
    });
  }

  function wireVisitForm() {
    const form = $('#sheet-form');
    if (!form) return;

    const recalc = () => {
      let total = 0;
      $$('.item-row', form).forEach((row) => { total += num($('.price', row).value); });
      total += num(form.querySelector('[name="extra_cost"]').value);
      const out = $('#visit-total', form);
      if (out) out.value = money(total);
    };

    form.addEventListener('input', (e) => {
      if (e.target.classList.contains('price') || e.target.name === 'extra_cost') recalc();
    });

    form.addEventListener('change', (e) => {
      if (e.target.classList.contains('st-select')) {
        const row = e.target.closest('.item-row');
        const wrap = $('.custom-wrap', row);
        const custom = e.target.value === '0';
        if (wrap) wrap.hidden = !custom;
        if (custom) {
          const input = $('.custom-name', row);
          if (input) input.focus();
        }
      }
      if (e.target.name === 'vehicle_id') rebuildItemRows(form, e.target.value);
    });

    form.addEventListener('click', (e) => {
      const del = e.target.closest('[data-act="del-row"]');
      if (del) {
        const rows = $$('.item-row', form);
        if (rows.length > 1) del.closest('.item-row').remove();
        recalc();
      }
      const add = e.target.closest('[data-act="add-row"]');
      if (add) {
        const wrap = $('#items-wrap', form);
        const vid = form.querySelector('[name="vehicle_id"]').value;
        const vv = vehicleById(vid);
        wrap.insertAdjacentHTML('beforeend', itemRowHTML('', vv ? vv.type : null));
        recalc();
      }
    });
  }

  function openFuelForm(existing) {
    const isEdit = !!existing;
    const v = isEdit ? vehicleById(existing.vehicle_id) : currentVehicle();
    if (!v) return openVehicleForm(null);

    sheet({
      title: isEdit ? 'Edit isi minyak' : 'Isi minyak',
      submit: isEdit ? 'Simpan perubahan' : 'Simpan isi minyak',
      body: `
        <div class="field">
          <label class="label">Kenderaan</label>
          <select class="input" name="vehicle_id" required>${vehicleOptions(isEdit ? existing.vehicle_id : v.id)}</select>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Tarikh</label>
            <input class="input" type="date" name="date" value="${isEdit ? esc(existing.date) : today()}" required>
          </div>
          <div class="field">
            <label class="label">Odometer (km)</label>
            <input class="input" type="number" inputmode="numeric" name="odometer" min="0" value="${isEdit ? num(existing.odometer) : currentOdo(v)}" required>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Liter</label>
            <input class="input" type="number" inputmode="decimal" step="0.01" min="0" name="liters" value="${existing && num(existing.liters) ? num(existing.liters) : ''}" placeholder="0.00" required>
          </div>
          <div class="field">
            <label class="label">Jumlah (RM)</label>
            <input class="input" type="number" inputmode="decimal" step="0.01" min="0" name="total_cost" value="${existing && num(existing.total_cost) ? num(existing.total_cost) : ''}" placeholder="0.00" required>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Jenis minyak</label>
            <select class="input" name="fuel_type">${listOptions(FUEL_TYPES, existing ? existing.fuel_type : FUEL_TYPES[0])}</select>
          </div>
          <div class="field">
            <label class="label">Stesen</label>
            <select class="input" name="station">${listOptions(STATIONS, existing ? existing.station : STATIONS[0])}</select>
          </div>
        </div>
        <label class="check"><input type="checkbox" name="full_tank" ${existing ? (num(existing.full_tank) ? 'checked' : '') : 'checked'}> Isi penuh (tank penuh)</label>
        <div class="note" id="fuel-hint">Isi penuh diperlukan untuk kiraan km/L yang tepat.</div>
        <div class="field" style="margin-top:12px">
          <label class="label">Nota (pilihan)</label>
          <input class="input" name="notes" value="${esc(existing ? existing.notes : '')}" placeholder="cth: perjalanan KL–Penang">
        </div>
      `,
      onSubmit: async (form) => {
        const fd = new FormData(form);
        const liters = num(fd.get('liters'));
        const total = num(fd.get('total_cost'));
        const odo = num(fd.get('odometer'));
        if (liters <= 0) throw new Error('Masukkan jumlah liter.');
        if (odo <= 0) throw new Error('Masukkan bacaan odometer.');

        const db = await API.mutate('fuel', isEdit ? 'update' : 'create', {
          id: isEdit ? existing.id : undefined,
          vehicle_id: Number(fd.get('vehicle_id')),
          date: fd.get('date'),
          odometer: odo,
          liters: liters,
          total_cost: total,
          fuel_type: fd.get('fuel_type'),
          station: fd.get('station'),
          full_tank: fd.get('full_tank') ? 1 : 0,
          notes: fd.get('notes')
        });
        afterMutate(db, isEdit ? 'Rekod minyak dikemas kini' : 'Isi minyak disimpan');
      }
    });
  }

  function openReadingForm(existing) {
    const isEdit = !!existing;
    const v = isEdit ? vehicleById(existing.vehicle_id) : currentVehicle();
    if (!v) return openVehicleForm(null);

    sheet({
      title: isEdit ? 'Edit bacaan odometer' : 'Bacaan odometer',
      submit: isEdit ? 'Simpan perubahan' : 'Simpan bacaan',
      body: `
        <div class="field">
          <label class="label">Kenderaan</label>
          <select class="input" name="vehicle_id" required>${vehicleOptions(isEdit ? existing.vehicle_id : v.id)}</select>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Tarikh</label>
            <input class="input" type="date" name="date" value="${isEdit ? esc(existing.date) : today()}" required>
          </div>
          <div class="field">
            <label class="label">Odometer (km)</label>
            <input class="input" type="number" inputmode="numeric" name="odometer" min="0" value="${isEdit ? num(existing.odometer) : currentOdo(v)}" required>
          </div>
        </div>
        <div class="field">
          <label class="label">Nota (pilihan)</label>
          <input class="input" name="notes" value="${esc(existing ? existing.notes : '')}" placeholder="cth: hantar servis">
        </div>
      `,
      onSubmit: async (form) => {
        const fd = new FormData(form);
        const odo = num(fd.get('odometer'));
        if (odo <= 0) throw new Error('Masukkan bacaan odometer.');
        const db = await API.mutate('reading', isEdit ? 'update' : 'create', {
          id: isEdit ? existing.id : undefined,
          vehicle_id: Number(fd.get('vehicle_id')),
          date: fd.get('date'),
          odometer: odo,
          notes: fd.get('notes')
        });
        afterMutate(db, isEdit ? 'Bacaan dikemas kini' : 'Bacaan disimpan');
      }
    });
  }

  function openVehicleForm(vehicle) {
    const isEdit = !!vehicle;
    const v = vehicle || { name: '', type: 'car', plate: '', make: '', model: '', year: '', odometer_base: 0 };

    sheet({
      title: isEdit ? 'Edit kenderaan' : 'Tambah kenderaan',
      submit: isEdit ? 'Simpan perubahan' : 'Tambah',
      danger: isEdit ? 'Buang kenderaan' : null,
      body: `
        <div class="field">
          <label class="label">Nama panggilan</label>
          <input class="input" name="name" value="${esc(v.name)}" placeholder="cth: Myvi" required>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Jenis</label>
            <select class="input" name="type">
              <option value="car" ${v.type === 'car' ? 'selected' : ''}>Kereta</option>
              <option value="motorcycle" ${v.type === 'motorcycle' ? 'selected' : ''}>Motosikal</option>
            </select>
          </div>
          <div class="field">
            <label class="label">No. plat</label>
            <input class="input" name="plate" value="${esc(v.plate)}" placeholder="WXY 1234" autocomplete="off">
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Jenama</label>
            <input class="input" name="make" value="${esc(v.make)}" placeholder="Perodua" autocomplete="off">
          </div>
          <div class="field">
            <label class="label">Model</label>
            <input class="input" name="model" value="${esc(v.model)}" placeholder="Myvi 1.5" autocomplete="off">
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Tahun</label>
            <input class="input" type="number" name="year" value="${v.year || ''}" placeholder="2019" min="1950" max="2100">
          </div>
          <div class="field">
            <label class="label">Odometer asas (km)</label>
            <input class="input" type="number" name="odometer_base" value="${v.odometer_base || 0}" min="0">
          </div>
        </div>
        <div class="note">Odometer asas digunakan jika kau mula guna BukuServis pada bacaan semasa.</div>
      `,
      onSubmit: async (form) => {
        const fd = new FormData(form);
        if (!String(fd.get('name') || '').trim()) throw new Error('Masukkan nama kenderaan.');
        const payload = {
          id: isEdit ? v.id : undefined,
          name: fd.get('name'),
          type: fd.get('type'),
          plate: fd.get('plate'),
          make: fd.get('make'),
          model: fd.get('model'),
          year: fd.get('year'),
          odometer_base: num(fd.get('odometer_base'))
        };
        const db = await API.mutate('vehicle', isEdit ? 'update' : 'create', payload);
        if (!isEdit) state.vehicleId = null;
        afterMutate(db, isEdit ? 'Kenderaan dikemas kini' : 'Kenderaan ditambah');
      },
      onDanger: async () => {
        if (!confirm('Buang ' + v.name + '? Semua rekod servis, minyak dan bacaan untuk kenderaan ini akan dipadam.')) return;
        try {
          const db = await API.mutate('vehicle', 'delete', { id: v.id });
          closeSheet();
          state.vehicleId = null;
          afterMutate(db, 'Kenderaan dibuang');
        } catch (err) { toast(err.message, true); }
      }
    });
  }

  function openServiceTypeForm(t) {
    const isEdit = !!t;
    const s = t || { name: '', category: 'enjin', applies_to: 'both', track: 'interval', interval_km: '', interval_months: '' };

    sheet({
      title: isEdit ? 'Edit item servis' : 'Tambah item servis',
      submit: 'Simpan',
      body: `
        <div class="field">
          <label class="label">Nama item</label>
          <input class="input" name="name" value="${esc(s.name)}" placeholder="cth: Minyak Gearbox" required>
        </div>
        <div class="field">
          <label class="label">Jenis rekod</label>
          <select class="input" name="track">
            <option value="interval" ${s.track !== 'history' ? 'selected' : ''}>Servis berkala — ada due / peringatan</option>
            <option value="history" ${s.track === 'history' ? 'selected' : ''}>Barang / ubah suai — rekod sahaja</option>
          </select>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Kategori</label>
            <select class="input" name="category">
              ${Object.keys(CAT).map((k) => `<option value="${k}" ${s.category === k ? 'selected' : ''}>${CAT[k]}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="label">Untuk</label>
            <select class="input" name="applies_to">
              <option value="both" ${s.applies_to === 'both' ? 'selected' : ''}>Kedua-dua</option>
              <option value="car" ${s.applies_to === 'car' ? 'selected' : ''}>Kereta</option>
              <option value="motorcycle" ${s.applies_to === 'motorcycle' ? 'selected' : ''}>Motosikal</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Interval (km)</label>
            <input class="input" type="number" name="interval_km" min="0" value="${s.interval_km || ''}" placeholder="cth: 8000">
          </div>
          <div class="field">
            <label class="label">Interval (bulan)</label>
            <input class="input" type="number" name="interval_months" min="0" value="${s.interval_months || ''}" placeholder="cth: 6">
          </div>
        </div>
        <div class="note">Pilih <b>Servis berkala</b> untuk item yang perlu diingatkan (minyak, tayar, brek). Pilih <b>Barang / ubah suai</b> untuk coverset, ekzos, clutch plate atau up-spec — ia direkod tetapi tidak masuk senarai perhatian.</div>
      `,
      onSubmit: async (form) => {
        const fd = new FormData(form);
        const db = await API.mutate('serviceType', isEdit ? 'update' : 'create', {
          id: isEdit ? s.id : undefined,
          name: fd.get('name'),
          category: fd.get('category'),
          applies_to: fd.get('applies_to'),
          track: fd.get('track'),
          interval_km: num(fd.get('interval_km')) || null,
          interval_months: num(fd.get('interval_months')) || null
        });
        afterMutate(db, 'Katalog servis dikemas kini');
      }
    });
  }

  /* ---------------- detail sheets ---------------- */
  function openEventDetail(kind, id) {
    if (kind === 'visit') openVisitDetail(id);
    else if (kind === 'fuel') openFuelDetail(id);
    else openReadingDetail(id);
  }

  function openVisitDetail(id) {
    const x = state.db.visits.find((v) => v.id === id);
    if (!x) return;
    const v = vehicleById(x.vehicle_id);

    sheet({
      title: 'Rekod servis',
      submit: false,
      body: `
        <div class="kv"><span class="k">Kenderaan</span><span class="v">${esc(v ? v.name : '—')}</span></div>
        <div class="kv"><span class="k">Tarikh</span><span class="v">${fmtDate(x.date)}</span></div>
        <div class="kv"><span class="k">Odometer</span><span class="v">${kmText(x.odometer)}</span></div>
        ${x.workshop ? `<div class="kv"><span class="k">Bengkel</span><span class="v">${esc(x.workshop)}</span></div>` : ''}
        ${x.notes ? `<div class="kv"><span class="k">Nota</span><span class="v">${esc(x.notes)}</span></div>` : ''}
        <div class="section" style="margin:16px 0 0">
          <h2 class="section-title">Item</h2>
          <table class="tbl">
            <thead><tr><th>Item</th><th>Jenama / produk</th><th class="r">Harga</th></tr></thead>
            <tbody>
              ${(x.items || []).map((i) => `
                <tr>
                  <td class="strong">${esc(itemName(i))}</td>
                  <td>${esc([i.brand, i.product, i.kind].filter(Boolean).join(' · ') || '—')}</td>
                  <td class="r">${money0(i.price)}</td>
                </tr>`).join('')}
              ${num(x.extra_cost) ? `<tr><td colspan="2">Kos lain / upah</td><td class="r">${money0(x.extra_cost)}</td></tr>` : ''}
              <tr><td colspan="2" class="strong">Jumlah</td><td class="r strong">${money(visitTotal(x))}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="sheet-foot">
          <button class="btn btn-danger" type="button" data-act="del-visit" data-id="${x.id}">Buang rekod</button>
          <button class="btn btn-ghost" type="button" data-close>Tutup</button>
          <button class="btn btn-primary" type="button" data-act="edit-visit" data-id="${x.id}">Edit</button>
        </div>
      `
    });
  }

  function openFuelDetail(id) {
    const x = state.db.fuel_logs.find((f) => f.id === id);
    if (!x) return;
    const v = vehicleById(x.vehicle_id);
    const ppm = num(x.liters) ? num(x.total_cost) / num(x.liters) : 0;
    const series = fuelSeries(x.vehicle_id).find((s) => s.log.id === x.id);

    sheet({
      title: 'Isi minyak',
      submit: false,
      body: `
        <div class="kv"><span class="k">Kenderaan</span><span class="v">${esc(v ? v.name : '—')}</span></div>
        <div class="kv"><span class="k">Tarikh</span><span class="v">${fmtDate(x.date)}</span></div>
        <div class="kv"><span class="k">Odometer</span><span class="v">${kmText(x.odometer)}</span></div>
        <div class="kv"><span class="k">Liter</span><span class="v">${num(x.liters).toFixed(2)} L</span></div>
        <div class="kv"><span class="k">Harga / liter</span><span class="v">RM ${ppm.toFixed(2)}</span></div>
        <div class="kv"><span class="k">Jumlah</span><span class="v">${money(x.total_cost)}</span></div>
        <div class="kv"><span class="k">Stesen</span><span class="v">${esc(x.station || '—')}</span></div>
        <div class="kv"><span class="k">Jenis</span><span class="v">${esc(x.fuel_type || '—')}</span></div>
        <div class="kv"><span class="k">Status</span><span class="v">${x.full_tank ? 'Tank penuh' : 'Sebahagian'}</span></div>
        ${series ? `<div class="kv"><span class="k">Kiraan</span><span class="v">${nf(series.dist)} km · ${series.kml.toFixed(2)} km/L</span></div>` : ''}
        ${x.notes ? `<div class="kv"><span class="k">Nota</span><span class="v">${esc(x.notes)}</span></div>` : ''}
        <div class="sheet-foot">
          <button class="btn btn-danger" type="button" data-act="del-fuel" data-id="${x.id}">Buang rekod</button>
          <button class="btn btn-ghost" type="button" data-close>Tutup</button>
          <button class="btn btn-primary" type="button" data-act="edit-fuel" data-id="${x.id}">Edit</button>
        </div>
      `
    });
  }

  function openReadingDetail(id) {
    const x = state.db.readings.find((r) => r.id === id);
    if (!x) return;
    const v = vehicleById(x.vehicle_id);

    sheet({
      title: 'Bacaan odometer',
      submit: false,
      body: `
        <div class="kv"><span class="k">Kenderaan</span><span class="v">${esc(v ? v.name : '—')}</span></div>
        <div class="kv"><span class="k">Tarikh</span><span class="v">${fmtDate(x.date)}</span></div>
        <div class="kv"><span class="k">Odometer</span><span class="v">${kmText(x.odometer)}</span></div>
        ${x.notes ? `<div class="kv"><span class="k">Nota</span><span class="v">${esc(x.notes)}</span></div>` : ''}
        <div class="sheet-foot">
          <button class="btn btn-danger" type="button" data-act="del-reading" data-id="${x.id}">Buang rekod</button>
          <button class="btn btn-ghost" type="button" data-close>Tutup</button>
          <button class="btn btn-primary" type="button" data-act="edit-reading" data-id="${x.id}">Edit</button>
        </div>
      `
    });
  }

  /* ---------------- sejarah mileage ---------------- */
  function odoPoints(v) {
    const pts = [];
    state.db.visits.forEach((x) => {
      if (x.vehicle_id !== v.id || num(x.odometer) <= 0) return;
      const names = (x.items || []).map(itemName);
      pts.push({ date: x.date, odo: num(x.odometer), kind: 'visit', label: names.join(' + ') || 'Servis' });
    });
    state.db.fuel_logs.forEach((x) => {
      if (x.vehicle_id !== v.id || num(x.odometer) <= 0) return;
      pts.push({ date: x.date, odo: num(x.odometer), kind: 'fuel', label: 'Isi minyak ' + num(x.liters).toFixed(2) + ' L' });
    });
    state.db.readings.forEach((x) => {
      if (x.vehicle_id !== v.id || num(x.odometer) <= 0) return;
      pts.push({ date: x.date, odo: num(x.odometer), kind: 'reading', label: String(x.notes || '').trim() || 'Bacaan manual' });
    });
    pts.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.odo - b.odo);
    return pts;
  }

  function odoAt(pts, iso, base) {
    let best = null;
    pts.forEach((p) => {
      if (String(p.date) > iso) return;
      if (!best || p.odo > best.odo || (p.odo === best.odo && p.date > best.date)) best = p;
    });
    if (best) return best;
    return base > 0 ? { date: null, odo: base, kind: 'base', label: 'Odometer asas' } : null;
  }

  function openOdoHistory() {
    const v = currentVehicle();
    if (!v) return openVehicleForm(null);

    const pts = odoPoints(v);
    const base = num(v.odometer_base);
    const odoNow = currentOdo(v);

    const milestones = [
      ['7 hari lepas', 7],
      ['30 hari lepas', 30],
      ['3 bulan lepas', 90],
      ['6 bulan lepas', 180],
      ['1 tahun lepas', 365]
    ];

    const milestoneHTML = milestones.map((m) => {
      const iso = daysAgoISO(m[1]);
      const p = odoAt(pts, iso, base);
      const sub = p
        ? (p.kind === 'base' ? 'anggaran dari odometer asas' : 'rekod ' + fmtDate(p.date))
        : 'tiada rekod lagi';
      return `
        <div class="kv">
          <span class="k">${m[0]}<br><span class="muted tiny">${fmtDate(iso)}</span></span>
          <span class="v">${p ? nf(p.odo) + ' km' : '—'}<br><span class="muted tiny">${sub}</span></span>
        </div>`;
    }).join('');

    let timeline = '';
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      const prev = i > 0 ? pts[i - 1] : null;
      const delta = prev ? p.odo - prev.odo : null;
      const kindText = p.kind === 'visit' ? 'Servis' : p.kind === 'fuel' ? 'Isi minyak' : 'Bacaan';
      const deltaText = delta != null ? ' · ' + (delta < 0 ? '−' : '+') + nf(Math.abs(delta)) + ' km' : '';
      timeline += `
        <div class="kv">
          <span class="k">${fmtDate(p.date)} · ${esc(p.label)}<br><span class="muted tiny">${kindText}${deltaText}</span></span>
          <span class="v">${nf(p.odo)} km</span>
        </div>`;
    }

    if (base > 0) {
      timeline += `
        <div class="kv">
          <span class="k">Odometer asas<br><span class="muted tiny">nilai permulaan</span></span>
          <span class="v">${nf(base)} km</span>
        </div>`;
    }

    sheet({
      title: 'Sejarah mileage',
      submit: false,
      body: `
        <div class="kv"><span class="k">Kenderaan</span><span class="v">${esc(v.name)}</span></div>
        <div class="kv"><span class="k">Odometer semasa</span><span class="v">${nf(odoNow)} km</span></div>
        <div class="kv"><span class="k">Jarak direkod</span><span class="v">${pts.length > 1 ? nf(pts[pts.length - 1].odo - pts[0].odo) + ' km' : '—'}</span></div>

        <div class="section" style="margin:18px 0 0">
          <h2 class="section-title">Mileage pada tarikh</h2>
          ${milestoneHTML}
        </div>

        <div class="section" style="margin:18px 0 0">
          <h2 class="section-title">Semua bacaan <span class="count">${pts.length}</span></h2>
          ${timeline || `<div class="note">Belum ada rekod mileage. Tambah bacaan pertama untuk mula.</div>`}
        </div>

        <div class="note">Nilai ini dikira daripada rekod yang kau masukkan, bukan bacaan meter hidup. Jika tiada rekod pada tarikh itu, sistem guna rekod terakhir sebelum tarikh tersebut.</div>

        <div class="sheet-foot">
          <button class="btn btn-ghost" type="button" data-close>Tutup</button>
          <button class="btn btn-primary" type="button" data-act="add-reading">+ Bacaan baru</button>
        </div>
      `
    });
  }

  function openServiceDetail(stId) {
    const v = currentVehicle();
    const t = stById(stId);
    if (!v || !t) return;

    const records = [];
    state.db.visits.forEach((x) => {
      if (x.vehicle_id !== v.id) return;
      (x.items || []).forEach((i) => {
        if (i.service_type_id === t.id) records.push({ visit: x, item: i });
      });
    });
    records.sort((a, b) => num(b.visit.odometer) - num(a.visit.odometer));

    const due = dueFor(v, t);

    sheet({
      title: t.name,
      submit: false,
      body: `
        <div class="kv"><span class="k">Kenderaan</span><span class="v">${esc(v.name)}</span></div>
        <div class="kv"><span class="k">Interval</span><span class="v">${intervalText(t)}</span></div>
        <div class="kv"><span class="k">Status</span><span class="v">${due.status === 'none' ? 'Tiada rekod' : dueLabel(due)}</span></div>
        ${due.dueKm != null ? `<div class="kv"><span class="k">Due pada</span><span class="v">${kmText(due.dueKm)}</span></div>` : ''}
        ${due.dueDate ? `<div class="kv"><span class="k">Due tarikh</span><span class="v">${fmtDate(due.dueDate)}</span></div>` : ''}

        <div class="section" style="margin:18px 0 0">
          <h2 class="section-title">Sejarah item ini <span class="count">${records.length}</span></h2>
          ${records.length ? records.map((r) => `
            <div class="kv">
              <span class="k">${fmtDate(r.visit.date)} · ${kmText(r.visit.odometer)}</span>
              <span class="v">${esc([r.item.brand, r.item.product].filter(Boolean).join(' ') || '—')}</span>
            </div>`).join('') : `<div class="note">Belum ada rekod untuk item ini.</div>`}
        </div>

        <div class="sheet-foot">
          <button class="btn btn-ghost" type="button" data-act="edit-st" data-id="${t.id}">Edit interval</button>
          <button class="btn btn-primary" type="button" data-act="add-visit" data-st="${t.id}">+ Rekod servis</button>
        </div>
      `
    });
  }

  /* ---------------- add menu ---------------- */
  function openAddMenu() {
    if (!state.db.vehicles.length) return openVehicleForm(null);
    sheet({
      title: 'Tambah rekod',
      submit: false,
      body: `
        <div class="list">
          <button class="due-row" type="button" data-act="add-visit">
            <div class="due-main"><div class="due-name">🔧 Rekod servis</div><div class="due-sub">Minyak hitam, spark plug, tayar, brek…</div></div>
          </button>
          <button class="due-row" type="button" data-act="add-fuel">
            <div class="due-main"><div class="due-name">⛽ Isi minyak</div><div class="due-sub">Liter, harga dan kiraan km/L</div></div>
          </button>
          <button class="due-row" type="button" data-act="add-reading">
            <div class="due-main"><div class="due-name">📍 Bacaan odometer</div><div class="due-sub">Kemas kini mileage tanpa servis</div></div>
          </button>
          <button class="due-row" type="button" data-act="odo-history">
            <div class="due-main"><div class="due-name">📈 Sejarah mileage</div><div class="due-sub">Lihat bacaan pada hari, minggu atau bulan lepas</div></div>
          </button>
        </div>
        <div class="note">Semua rekod akan disimpan pada kenderaan yang sedang dipilih.</div>
      `
    });
  }

  /* ---------------- after mutate ---------------- */
  function afterMutate(db, msg) {
    state.db = db;
    if (!state.db.vehicles.some((v) => v.id === state.vehicleId)) {
      state.vehicleId = state.db.vehicles.length ? state.db.vehicles[0].id : null;
    }
    render();
    toast(msg || 'Disimpan');
  }

  async function mutate(type, action, data, msg) {
    try {
      const db = await API.mutate(type, action, data);
      afterMutate(db, msg);
    } catch (err) {
      toast(err.message || 'Ralat', true);
      if (err.code === 401) renderLogin();
    }
  }

  /* ============================================================
     ACTIONS
     ============================================================ */
  function wireGlobal() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;

      if (act === 'nav') {
        state.view = el.dataset.view;
        render();
        return;
      }
      if (act === 'select-vehicle') {
        state.vehicleId = Number(el.dataset.id);
        render();
        return;
      }
      if (act === 'hist-filter') {
        state.histFilter = el.dataset.f;
        render();
        return;
      }
      if (act === 'period') {
        state.period = el.dataset.p;
        render();
        return;
      }
      if (act === 'theme') {
        setTheme(el.dataset.p);
        render();
        return;
      }
      if (act === 'add-menu') { openAddMenu(); return; }
      if (act === 'add-visit') {
        const st = el.dataset.st ? Number(el.dataset.st) : '';
        closeSheet();
        setTimeout(() => openVisitForm(st), 60);
        return;
      }
      if (act === 'add-fuel') { closeSheet(); setTimeout(openFuelForm, 60); return; }
      if (act === 'add-reading') { closeSheet(); setTimeout(openReadingForm, 60); return; }
      if (act === 'add-vehicle') { openVehicleForm(null); return; }
      if (act === 'edit-vehicle') { openVehicleForm(vehicleById(el.dataset.id)); return; }
      if (act === 'odo-history') { closeSheet(); setTimeout(openOdoHistory, 60); return; }
      if (act === 'edit-visit') {
        const x = state.db.visits.find((v) => v.id === Number(el.dataset.id));
        if (!x) return;
        closeSheet();
        setTimeout(() => openVisitForm('', x), 60);
        return;
      }
      if (act === 'edit-fuel') {
        const x = state.db.fuel_logs.find((f) => f.id === Number(el.dataset.id));
        if (!x) return;
        closeSheet();
        setTimeout(() => openFuelForm(x), 60);
        return;
      }
      if (act === 'edit-reading') {
        const x = state.db.readings.find((r) => r.id === Number(el.dataset.id));
        if (!x) return;
        closeSheet();
        setTimeout(() => openReadingForm(x), 60);
        return;
      }
      if (act === 'add-st') { openServiceTypeForm(null); return; }
      if (act === 'edit-st') { closeSheet(); setTimeout(() => openServiceTypeForm(stById(el.dataset.id)), 60); return; }
      if (act === 'service-detail') { openServiceDetail(Number(el.dataset.id)); return; }
      if (act === 'event-detail') { openEventDetail(el.dataset.kind, Number(el.dataset.id)); return; }

      if (act === 'del-visit') {
        if (!confirm('Buang rekod servis ini?')) return;
        closeSheet();
        mutate('visit', 'delete', { id: Number(el.dataset.id) }, 'Rekod dibuang');
        return;
      }
      if (act === 'del-fuel') {
        if (!confirm('Buang rekod isi minyak ini?')) return;
        closeSheet();
        mutate('fuel', 'delete', { id: Number(el.dataset.id) }, 'Rekod dibuang');
        return;
      }
      if (act === 'del-reading') {
        if (!confirm('Buang bacaan ini?')) return;
        closeSheet();
        mutate('reading', 'delete', { id: Number(el.dataset.id) }, 'Rekod dibuang');
        return;
      }
      if (act === 'export') {
        const blob = new Blob([API.exportJSON(state.db)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'bukuservis-' + today() + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        return;
      }
      if (act === 'import') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', () => {
          const file = input.files && input.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              state.db = API.importJSON(String(reader.result));
              state.vehicleId = null;
              render();
              toast('Data diimport');
            } catch (err) { toast(err.message, true); }
          };
          reader.readAsText(file);
        });
        input.click();
        return;
      }
      if (act === 'reset') {
        if (!confirm('Padam semua data demo dan mula semula dengan data contoh?')) return;
        state.db = API.resetDemo();
        state.vehicleId = null;
        render();
        toast('Data demo direset');
        return;
      }
      if (act === 'logout') {
        if (!confirm('Log keluar?')) return;
        API.logout().then(() => { state.db = null; renderLogin(); });
        return;
      }
    });
  }

  /* ============================================================
     LOGIN
     ============================================================ */
  function renderLogin() {
    const fab = $('#fab');
    const tabs = $('.tabbar');
    if (fab) fab.hidden = true;
    if (tabs) tabs.style.display = 'none';

    $('#view').innerHTML = `
      <div class="login">
        <div class="brand-mark">BS</div>
        <h1>BukuServis</h1>
        <p>Masukkan PIN atau kata laluan untuk buka buku servis kau.</p>
        <div class="card">
          <form id="login-form">
            <div class="field">
              <label class="label">PIN / kata laluan</label>
              <input class="input" type="password" name="pin" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Huruf dan nombor" required>
            </div>
            <button class="btn btn-primary btn-block" type="submit">Buka</button>
          </form>
        </div>
        <div class="note">Data disimpan dalam akaun Cloudflare kau sendiri.</div>
      </div>`;

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      const pin = e.target.pin.value;
      btn.disabled = true;
      btn.textContent = 'Membuka…';
      try {
        const db = await API.login(pin);
        state.db = db;
        state.mode = 'remote';
        state.vehicleId = null;
        if (fab) fab.hidden = false;
        if (tabs) tabs.style.display = '';
        if (!state.db.vehicles.some((v) => v.id === state.vehicleId)) {
          state.vehicleId = state.db.vehicles.length ? state.db.vehicles[0].id : null;
        }
        render();
      } catch (err) {
        if (err && err.loggedIn) {
          renderBootError(err.message);
          return;
        }
        toast(err.message || 'PIN salah', true);
        btn.disabled = false;
        btn.textContent = 'Buka';
      }
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function themePref() {
    let p = 'auto';
    try { p = localStorage.getItem('bs.theme') || 'auto'; } catch (_) { /* ignore */ }
    return (p === 'light' || p === 'dark') ? p : 'auto';
  }

  function resolvedTheme(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function applyTheme() {
    const pref = themePref();
    const resolved = resolvedTheme(pref);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePref = pref;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#131311' : '#f6f5f2');

    const btn = $('#theme-btn');
    if (btn) {
      btn.textContent = resolved === 'dark' ? '☾' : '☀';
      btn.title = resolved === 'dark' ? 'Tema gelap — klik untuk cerah' : 'Tema cerah — klik untuk gelap';
      btn.setAttribute('aria-label', btn.title);
    }
  }

  function setTheme(pref) {
    try { localStorage.setItem('bs.theme', pref); } catch (_) { /* ignore */ }
    applyTheme();
  }

  function hideSplash(started) {
    const el = document.getElementById('splash');
    if (!el) return;
    const wait = Math.max(0, 550 - (Date.now() - started));
    setTimeout(() => {
      el.classList.add('done');
      setTimeout(() => el.remove(), 420);
    }, wait);
  }

  function renderBootError(message) {
    const fab = $('#fab');
    const tabs = $('.tabbar');
    if (fab) fab.hidden = true;
    if (tabs) tabs.style.display = 'none';

    const isBinding = /binding|pangkalan data d1/i.test(String(message || ''));
    const help = isBinding
      ? `<a class="btn btn-ghost btn-block" href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" rel="noopener">Buka dashboard Cloudflare</a>`
      : '';

    $('#view').innerHTML = `
      <div class="empty">
        <div class="big">⚠️</div>
        <h3>Tidak dapat dimuatkan</h3>
        <p>${esc(message || 'Ralat tidak diketahui')}</p>
        <button class="btn btn-primary btn-block" type="button" onclick="location.reload()">Muat semula</button>
        ${help}
      </div>`;
  }

  async function boot() {
    const started = Date.now();
    // jangan biar splash tersangkut jika rangkaian lambat
    setTimeout(() => hideSplash(started), 8000);
    applyTheme();
    wireGlobal();

    $('#theme-btn').addEventListener('click', () => {
      setTheme(resolvedTheme(themePref()) === 'dark' ? 'light' : 'dark');
    });

    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onScheme = () => { if (themePref() === 'auto') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onScheme);
      else if (mq.addListener) mq.addListener(onScheme);
    }

    $('#fab').addEventListener('click', openAddMenu);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSheet();
    });

    try {
      const res = await API.init();
      state.mode = res.mode;

      if (res.needsLogin) {
        renderLogin();
        return;
      }

      state.db = res.db;
      if (state.mode === 'local') {
        const b = $('#mode-badge');
        b.hidden = false;
        b.textContent = 'Demo';
        b.title = 'Data disimpan dalam browser ini sahaja';
      }

      state.vehicleId = state.db.vehicles.length ? state.db.vehicles[0].id : null;
      render();
    } catch (err) {
      renderBootError(err && err.message ? err.message : 'Ralat tidak diketahui');
    } finally {
      hideSplash(started);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
