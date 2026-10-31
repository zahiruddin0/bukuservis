# BukuServis

Rekod servis, mileage dan isi minyak untuk kereta & motosikal. HTML/CSS/JS biasa — tiada framework, tiada build step. Data disegerakkan antara peranti melalui Cloudflare D1.

## Ciri

- **Pelbagai kenderaan** — kereta dan motosikal dalam satu akaun.
- **Katalog servis** — minyak hitam, oil filter, spark plug, tayar, brek, coolant, bateri, CVT dan lain-lain, dengan interval km/bulan.
- **Item sekali / up-spec** — coverset, ekzos, clutch plate, suspension, sport rim dan apa-apa item lain boleh direkod tanpa mengotorkan senarai perhatian. Boleh pilih dari katalog atau taip nama sendiri.
- **Status due automatik** — 🟢 OK, 🟡 hampir, 🔴 lewat. Dikira dari rekod terakhir + interval.
- **Jenama boleh bertukar** — jenis servis kekal, produk/jenama direkod per lawatan. Jadi laporan boleh bandingkan kos per 1,000 km antara jenama minyak.
- **Fuel log** — liter, harga, stesen, km/L (hanya untuk isi penuh).
- **Laporan** — kos bulanan, kos per km, kos ikut kategori, prestasi ikut stesen minyak.
- **Tema auto / cerah / gelap** — ikut sistem atau pilih sendiri dalam Tetapan.
- **PIN login** — satu PIN, cookie session bertandatangan.

## Struktur fail

```
bukuservis/
├── public/                  # fail statik yang dihantar ke browser
│   ├── index.html
│   ├── css/style.css
│   ├── js/api.js            # lapisan data (localStorage / API)
│   ├── js/app.js            # UI + logik due + laporan
│   ├── assets/              # favicon + gambar profil
│   └── _headers             # header keselamatan
├── src/
│   ├── worker.js            # router: /api/* → api.js, lain-lain → fail statik
│   └── api.js               # auth, bootstrap, mutate (D1)
├── schema.sql               # skema D1 + katalog servis lalai
├── schema-d1-console.sql    # versi tanpa komen untuk D1 Console
├── wrangler.toml
└── README.md
```

## 1. Cuba dulu (tanpa backend)

Buka `public/index.html` terus dalam browser. Ia akan jalan dalam **mod demo**: data contoh disimpan dalam `localStorage` browser itu sahaja.

## 2. Uji lokal dengan D1 sebenar

Perlu Node.js. `wrangler.local.toml` mengandungi binding ujian (PIN `123456`) dan tidak di-commit.

```powershell
npm install -g wrangler
wrangler d1 execute bukuservis --local --config wrangler.local.toml --file=./schema.sql
wrangler dev --config wrangler.local.toml
```

Buka `http://localhost:8787` → masukkan PIN `123456`.

> Data lokal disimpan dalam folder `.wrangler/`. Padam folder itu untuk mula semula.

## 3. Deploy ke Cloudflare

### 3.1 Push ke GitHub

Repo: `https://github.com/zahiruddin0/bukuservis`

```powershell
cd bukuservis
git push
```

### 3.2 Buat database D1

1. Dashboard → **Storage & Databases** → **D1 SQL Database** → **Create database**
2. Nama: `bukuservis`
3. Buka database → tab **Console**
4. Copy seluruh kandungan **`schema-d1-console.sql`** (bukan `schema.sql`), tampal, klik **Run**
   - Console D1 menghilangkan newline semasa paste. Komen `--` akan menelan seluruh skrip dan keluar "No SQL statements detected". Fail ini tiada komen.
5. Sahkan: `/tables` → 6 jadual; `SELECT COUNT(*) FROM service_types;` → **36**

### 3.3 Cipta Worker

1. Dashboard → **Workers & Pages** → **Create** → **Workers** → **Connect to Git**
2. Pilih repo `bukuservis`
3. Nama projek: `bukuservis` (mesti sama dengan `name` dalam `wrangler.toml`)
4. Build command: kosongkan
5. Deploy command: `npx wrangler deploy`
6. **Deploy**

### 3.4 Binding dan secret

Dalam projek Worker → **Settings**:

**Bindings** → **Add** → **D1 database**
- Variable name: `DB`
- Database: `bukuservis`

**Variables and Secrets** → **Add** (jenis **Secret**):

| Nama | Nilai |
|---|---|
| `APP_PIN` | PIN log masuk kau (6 digit, jangan guna PIN bank) |
| `SESSION_SECRET` | string rawak panjang |

Jana `SESSION_SECRET`:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))
```

Selepas simpan, **Redeploy** (Deployments → ⋯ → Retry deployment) supaya binding aktif.

### 3.5 Buka

`https://bukuservis.<subdomain>.workers.dev` → masukkan PIN → tambah kenderaan pertama.

Boleh tambah domain sendiri melalui **Settings → Domains & Routes**.

## 4. Cara guna

### Rekod servis

Butang **+** → **Rekod servis**. Satu lawatan boleh ada banyak item (minyak + filter + spark plug). Isi jenama dan produk pada setiap item.

### Tukar jenama minyak

Jangan cipta item servis baharu. Kekalkan **Minyak Hitam Enjin**, cuma tukar medan **Jenama** dan **Produk**:

| Tarikh | Item | Jenama | Produk |
|---|---|---|---|
| Jan | Minyak Hitam Enjin | Shell | Helix Ultra 5W-30 |
| Apr | Minyak Hitam Enjin | Motul | 8100 Eco-Lite 5W-30 |

Sistem tetap tahu ia item yang sama, jadi status due kekal betul, dan laporan **Minyak hitam — kos per 1,000 km** akan bandingkan kedua-dua jenama.

### Barang sekali / ubah suai (coverset, ekzos, clutch plate…)

Item yang jarang atau tidak ikut jadual tidak perlu memenuhi senarai perhatian. Ada dua cara:

1. **Dari katalog** — dalam borang servis, buka kumpulan **Barang & ubah suai** (Clutch Plate, Coverset, Ekzos, Suspension, Water Pump, Alternator, Starter, Radiator). Item ini direkod dalam sejarah tetapi **tiada due/peringatan**.
2. **Taip sendiri** — pilih **+ Item lain (taip sendiri)**, kemudian taip nama (cth: `Sport Rim 17"`, `Coilover HKS`, `Big Bore 65mm`). Sesuai untuk up-spec yang tiada dalam katalog.

Item sebegini tetap muncul dalam **Sejarah** dan **Laporan → Kos ikut kategori** (di bawah *Ubah Suai / Aksesori* atau *Lain-lain*), jadi kau boleh lihat berapa banyak duit masuk ke motor/kereta tanpa dashboard jadi berserabut.

Untuk item katalog sendiri, buka **Tetapan → Katalog servis → + Tambah item servis** dan pilih **Barang / ubah suai — rekod sahaja**.

### Isi minyak

Butang **+** → **Isi minyak**. Tandakan **Isi penuh** supaya km/L boleh dikira. Isi sebahagian (contoh RM10) tidak akan merosakkan kiraan — ia hanya dilangkau.

### Bacaan odometer

Butang **+ Bacaan** pada kad kenderaan. Berguna bila kau hantar servis dan bengkel tidak beri resit.

## 5. Sandaran data

**Tetapan → Eksport JSON** memuat turun semua data. Simpan fail itu dari semasa ke semasa.

Untuk pulih: **Import JSON** (mod demo) atau masukkan semula melalui D1 console jika perlu.

## 6. Nota teknikal

- Odometer semasa = bacaan tertinggi antara rekod servis, fuel log, bacaan manual dan `odometer_base`.
- Setiap item servis ada `track`: `interval` (ada due) atau `history` (rekod sahaja). Item `history` tidak masuk senarai perhatian tetapi masih dalam sejarah dan laporan.
- `visit_items.service_type_id` boleh `NULL`; jika begitu, nama item diambil dari `custom_name` (item taip sendiri).
- Due dikira dari rekod servis terakhir item itu: `odometer + interval_km` dan/atau `tarikh + interval_bulan`. Yang sampai dahulu menentukan status.
- Setiap item servis boleh override due (kolum `next_due_km`, `next_due_date`) — belum ada di UI, boleh tambah kemudian.
- km/L = jarak antara dua isi penuh ÷ liter isi kedua. Hanya pasangan yang kedua-duanya `full_tank = 1` dikira.
- Cookie session: HMAC-SHA256, sah 30 hari, `HttpOnly`, `SameSite=Lax`, `Secure` pada HTTPS.
- Worker menghantar fail statik dari `public/`; hanya laluan `/api/*` masuk ke kod. Fail di luar `public/` (README, schema) tidak boleh diakses dari browser.

## 7. Had versi ini

- Satu pengguna sahaja (satu PIN). Tiada pendaftaran.
- Tiada lampiran gambar resit.
- Tiada notifikasi automatik (email/WhatsApp). Status due hanya dilihat bila buka laman.
- Tiada mod offline (memerlukan internet).
