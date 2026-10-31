# BukuServis

Rekod servis, mileage dan isi minyak untuk kereta & motosikal. Satu halaman HTML, tiada framework, tiada build step. Data disegerakkan antara peranti melalui Cloudflare D1.

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
├── index.html
├── assets/              # favicon + gambar profil
├── css/style.css
├── js/api.js            # lapisan data (localStorage / API)
├── js/app.js            # UI + logik due + laporan
├── functions/api/[[path]].js   # Cloudflare Pages Function
├── schema.sql           # skema D1 + katalog servis lalai
├── wrangler.toml
└── _headers
```

## 1. Cuba dulu (tanpa backend)

Buka `index.html` terus dalam browser. Ia akan jalan dalam **mod demo**: data contoh disimpan dalam `localStorage` browser itu sahaja.

Atau jalankan server ringkas:

```powershell
cd bukuservis
python -m http.server 8123
```

Kemudian buka `http://localhost:8123`.

> Mod demo hanya untuk mencuba UI. Untuk sync antara peranti, ikut langkah di bawah.

## 2. Deploy ke Cloudflare

### 2.1 Push ke GitHub

Repo: `https://github.com/zahiruddin0/bukuservis`

Kalau repo belum wujud, buat repo **kosong** di <https://github.com/new>:

- Repository name: `bukuservis`
- Public atau Private (dua-dua boleh dengan Cloudflare Pages)
- **Jangan** tanda "Add a README", ".gitignore" atau "license"

Kemudian dari folder projek:

```powershell
cd bukuservis
git push -u origin main
```

Kali pertama, Git Credential Manager akan buka tetingkap log masuk GitHub — klik **Sign in with your browser** dan benarkan akses. Selepas itu kau tak perlu log masuk lagi.

### 2.2 Buat database D1

```powershell
npm install -g wrangler
wrangler login
wrangler d1 create bukuservis
```

Salin `database_id` yang keluar ke dalam `wrangler.toml`.

Kemudian jalankan skema:

```powershell
wrangler d1 execute bukuservis --remote --file=./schema.sql
```

> ⚠️ `schema.sql` memadam jadual sedia ada (`DROP TABLE`). Jalankan sekali sahaja pada database baharu. Jika sudah ada data, eksport dahulu.

**Tanpa Node/wrangler** (boleh guna dashboard sahaja):

1. Dashboard → **Storage & Databases** → **D1 SQL Database** → **Create** → nama `bukuservis`.
2. Buka database itu → tab **Console**.
3. Copy seluruh kandungan **`schema-d1-console.sql`** (bukan `schema.sql`), tampal dalam console, klik **Run**.
   - Versi ini tiada komen `--` sebab console D1 menghilangkan newline semasa paste; komen akan menelan seluruh skrip dan keluar "No SQL statements detected".
4. Semak dengan `/tables` — patut ada 6 jadual. `SELECT COUNT(*) FROM service_types;` patut pulang **36**.
5. Database ID boleh dilihat pada halaman database (untuk rujukan).

### 2.3 Sambung repo ke Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pilih repo `bukuservis`.
3. **Project name: `bukuservis-zahir`** — inilah yang jadi `bukuservis-zahir.pages.dev`.
4. Tetapan build:
   - Framework preset: **None**
   - Build command: **kosongkan**
   - Build output directory: **`/`**
   - Root directory: **kosongkan** (repo root memang folder app)
5. **Save and Deploy**.

Projek akan dapat URL `https://bukuservis-zahir.pages.dev`.


### 2.4 Tetapkan binding dan secret

Dalam projek Pages → **Settings**:

**Functions → D1 database bindings**
- Variable name: `DB`
- Database: `bukuservis`

**Environment variables** (Production dan Preview), jenis **Secret**:
- `APP_PIN` — PIN log masuk kau (contoh 6 digit). Jangan guna PIN bank.
- `SESSION_SECRET` — string rawak panjang. Jana dengan:

```powershell
# PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))
```

Selepas simpan, **Redeploy** (Deployments → Retry deployment) supaya binding aktif.

### 2.5 Buka

`https://nama-projek.pages.dev` → masukkan PIN → tambah kenderaan pertama.

## 3. Cara guna

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

## 4. Sandaran data

**Tetapan → Eksport JSON** memuat turun semua data. Simpan fail itu dari semasa ke semasa.

Untuk pulih: **Import JSON** (mod demo) atau masukkan semula melalui D1 console jika perlu.

## 5. Nota teknikal

- Odometer semasa = bacaan tertinggi antara rekod servis, fuel log, bacaan manual dan `odometer_base`.
- Setiap item servis ada `track`: `interval` (ada due) atau `history` (rekod sahaja). Item `history` tidak masuk senarai perhatian tetapi masih dalam sejarah dan laporan.
- `visit_items.service_type_id` boleh `NULL`; jika begitu, nama item diambil dari `custom_name` (item taip sendiri).
- Due dikira dari rekod servis terakhir item itu: `odometer + interval_km` dan/atau `tarikh + interval_bulan`. Yang sampai dahulu menentukan status.
- Setiap item servis boleh override due (kolum `next_due_km`, `next_due_date`) — belum ada di UI, boleh tambah kemudian.
- km/L = jarak antara dua isi penuh ÷ liter isi kedua. Hanya pasangan yang kedua-duanya `full_tank = 1` dikira.
- Cookie session: HMAC-SHA256, sah 30 hari, `HttpOnly`, `SameSite=Lax`, `Secure` pada HTTPS.

## 6. Had versi ini

- Satu pengguna sahaja (satu PIN). Tiada pendaftaran.
- Tiada lampiran gambar resit.
- Tiada notifikasi automatik (email/WhatsApp). Status due hanya dilihat bila buka laman.
- Tiada mod offline (memerlukan internet).
