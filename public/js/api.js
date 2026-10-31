/* ============================================================
   BukuServis — lapisan data
   Dua mod:
     - "local"  : data dalam localStorage (mod demo / preview)
     - "remote" : data dalam Cloudflare D1 melalui /api/*
   Bentuk data sama dalam kedua-dua mod.
   ============================================================ */
(function (global) {
  'use strict';

  const LS_KEY = 'bukuservis.db.v1';
  const DB_VERSION = 2;
  let mode = 'local';

  /* ---------------- helpers ---------------- */
  function localISO(d = new Date()) {
    const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return x.toISOString().slice(0, 10);
  }
  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return localISO(d);
  }
  function nextId(arr) {
    return arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
  }
  function num(v) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  /* ---------------- katalog servis ---------------- */
  const SERVICE_SEED = [
    // ---- motosikal ----
    { code: 'oil_engine_moto',  name: 'Minyak Hitam Enjin',  category: 'enjin',     applies_to: 'motorcycle', interval_km: 3000,  interval_months: 3 },
    { code: 'oil_filter_moto',  name: 'Oil Filter',          category: 'enjin',     applies_to: 'motorcycle', interval_km: 10000, interval_months: null },
    { code: 'air_filter_moto',  name: 'Penapis Udara',       category: 'enjin',     applies_to: 'motorcycle', interval_km: 10000, interval_months: 12 },
    { code: 'spark_plug_moto',  name: 'Spark Plug',          category: 'enjin',     applies_to: 'motorcycle', interval_km: 8000,  interval_months: null },
    { code: 'chain_moto',       name: 'Rantai & Sproket',    category: 'hantar',    applies_to: 'motorcycle', interval_km: 20000, interval_months: null },
    { code: 'brake_pad_moto',   name: 'Brake Pad',           category: 'brek',      applies_to: 'motorcycle', interval_km: 12000, interval_months: null },
    { code: 'brake_fluid_moto', name: 'Brake Fluid',         category: 'brek',      applies_to: 'motorcycle', interval_km: null,  interval_months: 24 },
    { code: 'coolant_moto',     name: 'Coolant',             category: 'penyejuk',  applies_to: 'motorcycle', interval_km: 20000, interval_months: 24 },
    { code: 'tyre_moto',        name: 'Tayar',               category: 'tayar',     applies_to: 'motorcycle', interval_km: 18000, interval_months: 36 },
    { code: 'battery_moto',     name: 'Bateri',              category: 'elektrik',  applies_to: 'motorcycle', interval_km: null,  interval_months: 30 },
    { code: 'cvt_belt_moto',    name: 'CVT Belt',            category: 'hantar',    applies_to: 'motorcycle', interval_km: 20000, interval_months: null },
    { code: 'cvt_roller_moto',  name: 'Roller CVT',          category: 'hantar',    applies_to: 'motorcycle', interval_km: 15000, interval_months: null },

    // ---- kereta ----
    { code: 'oil_engine_car',   name: 'Minyak Hitam Enjin',  category: 'enjin',     applies_to: 'car', interval_km: 8000,  interval_months: 6 },
    { code: 'oil_filter_car',   name: 'Oil Filter',          category: 'enjin',     applies_to: 'car', interval_km: 8000,  interval_months: 6 },
    { code: 'air_filter_car',   name: 'Penapis Udara',       category: 'enjin',     applies_to: 'car', interval_km: 25000, interval_months: 12 },
    { code: 'cabin_filter_car', name: 'Penapis Cabin',       category: 'enjin',     applies_to: 'car', interval_km: 20000, interval_months: 12 },
    { code: 'spark_plug_car',   name: 'Spark Plug',          category: 'enjin',     applies_to: 'car', interval_km: 40000, interval_months: null },
    { code: 'brake_pad_car',    name: 'Brake Pad',           category: 'brek',      applies_to: 'car', interval_km: 40000, interval_months: null },
    { code: 'brake_fluid_car',  name: 'Brake Fluid',         category: 'brek',      applies_to: 'car', interval_km: 40000, interval_months: 24 },
    { code: 'coolant_car',      name: 'Coolant',             category: 'penyejuk',  applies_to: 'car', interval_km: 60000, interval_months: 36 },
    { code: 'atf_car',          name: 'ATF / CVT Fluid',     category: 'transmisi', applies_to: 'car', interval_km: 50000, interval_months: null },
    { code: 'timing_belt_car',  name: 'Timing Belt',         category: 'enjin',     applies_to: 'car', interval_km: 90000, interval_months: 60 },
    { code: 'tyre_car',         name: 'Tayar',               category: 'tayar',     applies_to: 'car', interval_km: 45000, interval_months: 60 },
    { code: 'battery_car',      name: 'Bateri',              category: 'elektrik',  applies_to: 'car', interval_km: null,  interval_months: 30 },
    { code: 'fuel_filter_car',  name: 'Fuel Filter',         category: 'enjin',     applies_to: 'car', interval_km: 50000, interval_months: null },

    // ---- barang & ubah suai (tiada due, rekod sahaja) ----
    { code: 'clutch_plate_moto', name: 'Clutch Plate',       category: 'hantar',    applies_to: 'motorcycle', interval_km: null, interval_months: null, track: 'history' },
    { code: 'coverset_moto',     name: 'Coverset',           category: 'aksesori',  applies_to: 'motorcycle', interval_km: null, interval_months: null, track: 'history' },
    { code: 'exhaust_moto',      name: 'Ekzos',              category: 'aksesori',  applies_to: 'motorcycle', interval_km: null, interval_months: null, track: 'history' },
    { code: 'suspension_moto',   name: 'Suspension / Shock', category: 'hantar',    applies_to: 'motorcycle', interval_km: null, interval_months: null, track: 'history' },

    { code: 'clutch_plate_car',  name: 'Clutch Plate',       category: 'transmisi', applies_to: 'car', interval_km: null, interval_months: null, track: 'history' },
    { code: 'suspension_car',    name: 'Suspension / Absorber', category: 'hantar', applies_to: 'car', interval_km: null, interval_months: null, track: 'history' },
    { code: 'water_pump_car',    name: 'Water Pump',         category: 'penyejuk',  applies_to: 'car', interval_km: null, interval_months: null, track: 'history' },
    { code: 'alternator_car',    name: 'Alternator',         category: 'elektrik',  applies_to: 'car', interval_km: null, interval_months: null, track: 'history' },
    { code: 'starter_car',       name: 'Starter',            category: 'elektrik',  applies_to: 'car', interval_km: null, interval_months: null, track: 'history' },
    { code: 'radiator_car',      name: 'Radiator',           category: 'penyejuk',  applies_to: 'car', interval_km: null, interval_months: null, track: 'history' },
    { code: 'exhaust_car',       name: 'Ekzos',              category: 'aksesori',  applies_to: 'car', interval_km: null, interval_months: null, track: 'history' }
  ];

  /* ---------------- data contoh ---------------- */
  function seed() {
    const types = SERVICE_SEED.map((s, i) => Object.assign({
      id: i + 1, notes: '', sort_order: i + 1, track: 'interval'
    }, s));

    const db = { vehicles: [], service_types: types, visits: [], fuel_logs: [], readings: [], version: DB_VERSION };
    const stId = (code) => types.find((t) => t.code === code).id;

    db.vehicles.push(
      { id: 1, name: 'Myvi', type: 'car', plate: 'WXY 1234', make: 'Perodua', model: 'Myvi 1.5', year: 2019, odometer_base: 0, created_at: new Date().toISOString() },
      { id: 2, name: 'Wave', type: 'motorcycle', plate: 'BKM 8899', make: 'Honda', model: 'Wave 125', year: 2021, odometer_base: 0, created_at: new Date().toISOString() }
    );

    let vid = 0;
    function addVisit(vehicle_id, date, odometer, workshop, items, extra) {
      vid += 1;
      db.visits.push({
        id: vid, vehicle_id, date, odometer, workshop: workshop || '',
        extra_cost: extra || 0, notes: '', created_at: new Date().toISOString(),
        items: items.map((it, ix) => ({
          id: vid * 100 + ix + 1,
          service_type_id: it.code ? stId(it.code) : null,
          custom_name: it.name || '',
          brand: it.brand || '',
          product: it.product || '',
          kind: it.kind || '',
          qty: 1,
          price: it.price || 0,
          next_due_km: null,
          next_due_date: null,
          notes: ''
        }))
      });
    }

    let fid = 0;
    function addFuel(vehicle_id, date, odometer, liters, total, station, fuel_type) {
      fid += 1;
      db.fuel_logs.push({
        id: fid, vehicle_id, date, odometer, liters, total_cost: total,
        fuel_type: fuel_type || 'RON95', station: station || '', full_tank: 1, notes: ''
      });
    }

    function addReading(vehicle_id, date, odometer, notes) {
      db.readings.push({
        id: db.readings.length + 1, vehicle_id, date, odometer, notes: notes || ''
      });
    }

    /* ---- Myvi ---- */
    addVisit(1, daysAgo(1000), 40000, 'Service Centre Perodua', [
      { code: 'spark_plug_car', brand: 'Denso', product: 'Iridium IK20', price: 220 },
      { code: 'battery_car', brand: 'Yuasa', product: 'DIN55', price: 380 }
    ]);
    addVisit(1, daysAgo(800), 60000, 'Service Centre Perodua', [
      { code: 'air_filter_car', brand: 'Bosch', product: 'Air filter', price: 45 }
    ]);
    addVisit(1, daysAgo(420), 72000, 'Bengkel Ah Seng', [
      { code: 'brake_fluid_car', brand: 'Bosch', product: 'DOT 4', price: 55 },
      { code: 'oil_engine_car', brand: 'Shell', product: 'Helix Ultra 5W-30', kind: 'Full Sintetik', price: 205 }
    ]);
    addVisit(1, daysAgo(300), 74000, 'Kedai Sport Rim', [
      { name: 'Sport Rim 17"', brand: 'Advanti', product: 'Storm Series', price: 1800 }
    ]);
    addVisit(1, daysAgo(150), 75600, 'Bengkel Ah Seng', [
      { code: 'oil_engine_car', brand: 'Motul', product: '8100 Eco-Lite 5W-30', kind: 'Full Sintetik', price: 245 },
      { code: 'oil_filter_car', brand: 'Perodua', product: 'Oil filter original', price: 28 }
    ]);
    addVisit(1, daysAgo(90), 77600, 'Bengkel Ah Seng', [
      { code: 'brake_pad_car', brand: 'Bendix', product: 'General CT', price: 185 }
    ], 40);
    addVisit(1, daysAgo(45), 79000, 'Tayar Jaya', [
      { code: 'tyre_car', brand: 'Michelin', product: 'Primacy 4 195/60R15', price: 980 }
    ]);
    addVisit(1, daysAgo(35), 80800, 'Bengkel Ah Seng', [
      { code: 'oil_engine_car', brand: 'Castrol', product: 'Magnatec 5W-30', kind: 'Full Sintetik', price: 195 },
      { code: 'oil_filter_car', brand: 'Bosch', product: 'Oil filter', price: 32 },
      { code: 'air_filter_car', brand: 'Bosch', product: 'Air filter', price: 48 }
    ]);

    addFuel(1, daysAgo(60), 79600, 37.5, 78.75, 'Petronas', 'RON95');
    addFuel(1, daysAgo(50), 80120, 37.0, 77.70, 'Shell', 'RON95');
    addFuel(1, daysAgo(40), 80640, 36.8, 77.28, 'BHPetrol', 'RON95');
    addFuel(1, daysAgo(30), 81160, 37.2, 78.12, 'Petronas', 'RON95');
    addFuel(1, daysAgo(20), 81700, 36.5, 76.65, 'Shell', 'RON95');
    addFuel(1, daysAgo(10), 82240, 37.0, 77.70, 'Petronas', 'RON95');

    addReading(1, daysAgo(5), 82380, '');
    addReading(1, daysAgo(2), 82400, '');

    /* ---- Wave ---- */
    addVisit(2, daysAgo(400), 12000, 'Honda Service', [
      { code: 'air_filter_moto', brand: 'Honda', product: 'Air filter original', price: 25 }
    ]);
    addVisit(2, daysAgo(260), 16500, 'Honda Service', [
      { code: 'battery_moto', brand: 'Yuasa', product: 'YTZ5S', price: 85 }
    ]);
    addVisit(2, daysAgo(200), 18400, 'Bengkel Motor Jaya', [
      { code: 'chain_moto', brand: 'DID', product: 'Chain set 428', price: 95 }
    ]);
    addVisit(2, daysAgo(120), 20000, 'Kedai Motor Jaya', [
      { name: 'Coverset R25', brand: 'Yamaha', product: 'Coverset original', price: 280 },
      { code: 'exhaust_moto', brand: 'Yoshimura', product: 'Slip-on R77', price: 650 }
    ]);
    addVisit(2, daysAgo(70), 21000, 'Bengkel Motor Jaya', [
      { code: 'oil_engine_moto', brand: 'Shell', product: 'Advance AX7 10W-40', kind: 'Semi Sintetik', price: 42 },
      { code: 'spark_plug_moto', brand: 'NGK', product: 'CPR9EA-9', price: 18 }
    ]);
    addVisit(2, daysAgo(25), 22800, 'Bengkel Motor Jaya', [
      { code: 'oil_engine_moto', brand: 'Motul', product: '5100 10W-40', kind: 'Semi Sintetik', price: 48 }
    ]);

    addFuel(2, daysAgo(50), 22000, 3.6, 7.56, 'Petronas', 'RON95');
    addFuel(2, daysAgo(45), 22160, 3.7, 7.77, 'Shell', 'RON95');
    addFuel(2, daysAgo(40), 22320, 3.8, 7.98, 'Petronas', 'RON95');
    addFuel(2, daysAgo(35), 22480, 3.6, 7.56, 'BHPetrol', 'RON95');
    addFuel(2, daysAgo(30), 22640, 3.7, 7.77, 'Petronas', 'RON95');
    addFuel(2, daysAgo(25), 22800, 3.6, 7.56, 'Shell', 'RON95');
    addFuel(2, daysAgo(20), 22960, 3.7, 7.77, 'Petronas', 'RON95');
    addFuel(2, daysAgo(15), 23120, 3.6, 7.56, 'BHPetrol', 'RON95');
    addFuel(2, daysAgo(10), 23280, 3.8, 7.98, 'Petronas', 'RON95');
    addFuel(2, daysAgo(5), 23440, 3.5, 7.35, 'Shell', 'RON95');

    addReading(2, daysAgo(2), 23500, '');

    return db;
  }

  /* ---------------- localStorage ---------------- */
  function migrate(db) {
    let changed = false;

    if (!Array.isArray(db.service_types)) { db.service_types = []; changed = true; }
    if (!Array.isArray(db.visits)) { db.visits = []; changed = true; }
    if (!Array.isArray(db.fuel_logs)) { db.fuel_logs = []; changed = true; }
    if (!Array.isArray(db.readings)) { db.readings = []; changed = true; }

    if (db.version !== DB_VERSION) {
      SERVICE_SEED.forEach((s) => {
        const exists = db.service_types.some((t) =>
          (t.code && t.code === s.code) ||
          (!t.code && t.name === s.name && t.applies_to === s.applies_to));
        if (!exists) {
          db.service_types.push(Object.assign({
            id: nextId(db.service_types), notes: '', sort_order: db.service_types.length + 1, track: 'interval'
          }, s));
          changed = true;
        }
      });

      db.service_types.forEach((t) => {
        if (!t.track) { t.track = 'interval'; changed = true; }
      });
      db.visits.forEach((v) => (v.items || []).forEach((i) => {
        if (i.custom_name == null) { i.custom_name = ''; changed = true; }
      }));

      db.version = DB_VERSION;
      changed = true;
    }

    return changed;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const db = JSON.parse(raw);
        if (db && Array.isArray(db.vehicles)) {
          if (migrate(db)) saveLocal(db);
          return db;
        }
      }
    } catch (_) { /* ignore */ }
    const db = seed();
    saveLocal(db);
    return db;
  }

  function saveLocal(db) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (_) { /* ignore */ }
  }

  /* ---------------- mutasi (kembar dengan pelayan) ---------------- */
  function apply(db, type, action, data) {
    data = data || {};

    if (type === 'vehicle') {
      if (action === 'create') {
        db.vehicles.push({
          id: nextId(db.vehicles),
          name: String(data.name || 'Kenderaan').trim(),
          type: data.type === 'motorcycle' ? 'motorcycle' : 'car',
          plate: String(data.plate || '').trim(),
          make: String(data.make || '').trim(),
          model: String(data.model || '').trim(),
          year: data.year ? Number(data.year) : null,
          odometer_base: num(data.odometer_base),
          created_at: new Date().toISOString()
        });
      } else if (action === 'update') {
        const v = db.vehicles.find((x) => x.id === Number(data.id));
        if (!v) throw new Error('Kenderaan tidak dijumpai');
        Object.assign(v, {
          name: String(data.name || v.name).trim(),
          type: data.type === 'motorcycle' ? 'motorcycle' : 'car',
          plate: String(data.plate || '').trim(),
          make: String(data.make || '').trim(),
          model: String(data.model || '').trim(),
          year: data.year ? Number(data.year) : null,
          odometer_base: num(data.odometer_base)
        });
      } else if (action === 'delete') {
        const id = Number(data.id);
        db.vehicles = db.vehicles.filter((x) => x.id !== id);
        db.visits = db.visits.filter((x) => x.vehicle_id !== id);
        db.fuel_logs = db.fuel_logs.filter((x) => x.vehicle_id !== id);
        db.readings = db.readings.filter((x) => x.vehicle_id !== id);
      }
      return db;
    }

    if (type === 'visit') {
      if (action === 'create') {
        const items = (data.items || []).filter((i) => Number(i.service_type_id) > 0 || String(i.custom_name || '').trim());
        if (!items.length) throw new Error('Tambah sekurang-kurangnya satu item servis');
        const id = nextId(db.visits);
        db.visits.push({
          id,
          vehicle_id: Number(data.vehicle_id),
          date: data.date,
          odometer: num(data.odometer),
          workshop: String(data.workshop || '').trim(),
          extra_cost: num(data.extra_cost),
          notes: String(data.notes || '').trim(),
          created_at: new Date().toISOString(),
          items: items.map((it, ix) => ({
            id: id * 100 + ix + 1,
            service_type_id: Number(it.service_type_id) > 0 ? Number(it.service_type_id) : null,
            custom_name: String(it.custom_name || '').trim(),
            brand: String(it.brand || '').trim(),
            product: String(it.product || '').trim(),
            kind: String(it.kind || '').trim(),
            qty: num(it.qty) || 1,
            price: num(it.price),
            next_due_km: it.next_due_km ? Number(it.next_due_km) : null,
            next_due_date: it.next_due_date || null,
            notes: ''
          }))
        });
      } else if (action === 'update') {
        const x = db.visits.find((v) => v.id === Number(data.id));
        if (!x) throw new Error('Rekod servis tidak dijumpai');
        const items = (data.items || []).filter((i) => Number(i.service_type_id) > 0 || String(i.custom_name || '').trim());
        if (!items.length) throw new Error('Tambah sekurang-kurangnya satu item servis');
        Object.assign(x, {
          vehicle_id: Number(data.vehicle_id),
          date: data.date,
          odometer: num(data.odometer),
          workshop: String(data.workshop || '').trim(),
          extra_cost: num(data.extra_cost),
          notes: String(data.notes || '').trim(),
          items: items.map((it, ix) => ({
            id: x.id * 100 + ix + 1,
            service_type_id: Number(it.service_type_id) > 0 ? Number(it.service_type_id) : null,
            custom_name: String(it.custom_name || '').trim(),
            brand: String(it.brand || '').trim(),
            product: String(it.product || '').trim(),
            kind: String(it.kind || '').trim(),
            qty: num(it.qty) || 1,
            price: num(it.price),
            next_due_km: it.next_due_km ? Number(it.next_due_km) : null,
            next_due_date: it.next_due_date || null,
            notes: ''
          }))
        });
      } else if (action === 'delete') {
        db.visits = db.visits.filter((x) => x.id !== Number(data.id));
      }
      return db;
    }

    if (type === 'fuel') {
      if (action === 'create') {
        db.fuel_logs.push({
          id: nextId(db.fuel_logs),
          vehicle_id: Number(data.vehicle_id),
          date: data.date,
          odometer: num(data.odometer),
          liters: num(data.liters),
          total_cost: num(data.total_cost),
          fuel_type: String(data.fuel_type || 'RON95'),
          station: String(data.station || ''),
          full_tank: data.full_tank ? 1 : 0,
          notes: String(data.notes || '').trim()
        });
      } else if (action === 'update') {
        const x = db.fuel_logs.find((f) => f.id === Number(data.id));
        if (!x) throw new Error('Rekod minyak tidak dijumpai');
        Object.assign(x, {
          vehicle_id: Number(data.vehicle_id),
          date: data.date,
          odometer: num(data.odometer),
          liters: num(data.liters),
          total_cost: num(data.total_cost),
          fuel_type: String(data.fuel_type || 'RON95'),
          station: String(data.station || ''),
          full_tank: data.full_tank ? 1 : 0,
          notes: String(data.notes || '').trim()
        });
      } else if (action === 'delete') {
        db.fuel_logs = db.fuel_logs.filter((x) => x.id !== Number(data.id));
      }
      return db;
    }

    if (type === 'reading') {
      if (action === 'create') {
        db.readings.push({
          id: nextId(db.readings),
          vehicle_id: Number(data.vehicle_id),
          date: data.date,
          odometer: num(data.odometer),
          notes: String(data.notes || '').trim()
        });
      } else if (action === 'update') {
        const x = db.readings.find((r) => r.id === Number(data.id));
        if (!x) throw new Error('Bacaan tidak dijumpai');
        Object.assign(x, {
          vehicle_id: Number(data.vehicle_id),
          date: data.date,
          odometer: num(data.odometer),
          notes: String(data.notes || '').trim()
        });
      } else if (action === 'delete') {
        db.readings = db.readings.filter((x) => x.id !== Number(data.id));
      }
      return db;
    }

    if (type === 'serviceType') {
      if (action === 'create') {
        db.service_types.push({
          id: nextId(db.service_types),
          code: null,
          name: String(data.name || 'Servis').trim(),
          category: data.category || 'lain',
          applies_to: data.applies_to || 'both',
          track: data.track === 'history' ? 'history' : 'interval',
          interval_km: data.interval_km ? Number(data.interval_km) : null,
          interval_months: data.interval_months ? Number(data.interval_months) : null,
          notes: '',
          sort_order: 999
        });
      } else if (action === 'update') {
        const t = db.service_types.find((x) => x.id === Number(data.id));
        if (!t) throw new Error('Item servis tidak dijumpai');
        if (data.name != null) t.name = String(data.name).trim();
        if (data.category != null) t.category = data.category;
        if (data.applies_to != null) t.applies_to = data.applies_to;
        if (data.track != null) t.track = data.track === 'history' ? 'history' : 'interval';
        t.interval_km = data.interval_km ? Number(data.interval_km) : null;
        t.interval_months = data.interval_months ? Number(data.interval_months) : null;
      } else if (action === 'delete') {
        const id = Number(data.id);
        const used = db.visits.some((v) => v.items.some((i) => i.service_type_id === id));
        if (used) throw new Error('Item ini sudah digunakan dalam rekod. Ia tidak boleh dibuang.');
        db.service_types = db.service_types.filter((x) => x.id !== id);
      }
      return db;
    }

    throw new Error('Jenis data tidak dikenali: ' + type);
  }

  /* ---------------- HTTP ---------------- */
  async function http(path, opts) {
    const res = await fetch('/api' + path, Object.assign({
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }
    }, opts || {}));

    if (res.status === 401) {
      const e = new Error('Sesi tamat. Sila log masuk semula.');
      e.code = 401;
      throw e;
    }

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }

    if (!res.ok) throw new Error((data && data.error) || ('Ralat pelayan (' + res.status + ')'));
    return data;
  }

  /* ---------------- API awam ---------------- */
  const API = {
    get mode() { return mode; },

    async init() {
      try {
        const res = await fetch('/api/bootstrap', { credentials: 'same-origin' });
        if (res.status === 401) {
          mode = 'remote';
          return { mode, needsLogin: true, db: null };
        }
        if (!res.ok) throw new Error('no api');
        const db = await res.json();
        if (!db || !Array.isArray(db.vehicles)) throw new Error('payload');
        mode = 'remote';
        return { mode, needsLogin: false, db };
      } catch (_) {
        mode = 'local';
        return { mode, needsLogin: false, db: loadLocal() };
      }
    },

    async load() {
      if (mode === 'remote') return http('/bootstrap');
      return loadLocal();
    },

    async login(pin) {
      await http('/login', { method: 'POST', body: JSON.stringify({ pin }) });
      mode = 'remote';
      return http('/bootstrap');
    },

    async logout() {
      try { await http('/logout', { method: 'POST' }); } catch (_) { /* ignore */ }
    },

    async mutate(type, action, data) {
      if (mode === 'remote') {
        return http('/mutate', { method: 'POST', body: JSON.stringify({ type, action, data }) });
      }
      const db = loadLocal();
      apply(db, type, action, data);
      saveLocal(db);
      return db;
    },

    exportJSON(db) {
      return JSON.stringify(db, null, 2);
    },

    importJSON(text) {
      const db = JSON.parse(text);
      if (!db || !Array.isArray(db.vehicles) || !Array.isArray(db.service_types)) {
        throw new Error('Fail tidak sah.');
      }
      saveLocal(db);
      return db;
    },

    resetDemo() {
      try { localStorage.removeItem(LS_KEY); } catch (_) { /* ignore */ }
      return loadLocal();
    }
  };

  global.API = API;
})(window);
