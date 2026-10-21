# Kasapink ERP

Kasapink adalah aplikasi ERP berbahasa Indonesia untuk membantu usaha mengelola stok, resep, pembelian, produksi, penjualan, dan laporan usaha. Aplikasi menyediakan pengelolaan operasional untuk makanan dan parfum.

## Fitur utama

- **Ringkasan:** pantau penjualan, laba kotor, bahan menipis, dan transaksi terbaru.
- **Stok bahan:** kelola bahan, satuan, stok awal, biaya awal, batas minimum, dan tren harga pembelian.
- **Produk & resep:** atur produk olahan, produk jadi, harga jual, komposisi bahan, serta pemakaian prep.
- **Pembelian:** catat belanja dan perbarui stok serta biaya rata-rata bahan.
- **Produksi / prep:** kelola resep dan pencatatan produksi bahan persiapan.
- **Penjualan:** catat transaksi dan pemakaian stok sesuai produk serta resep.
- **Stok opname:** cocokkan stok sistem dengan hasil perhitungan fisik.
- **Kontrol F&B dan laporan:** tinjau waste, biaya operasional, dan kinerja usaha.
- **Manajemen akun:** akses admin, user operasional, dan testing dengan hak baca.

Laba kotor dihitung dari pendapatan dikurangi biaya bahan produk yang terjual. Angka ini belum mencakup seluruh biaya usaha seperti tenaga kerja, listrik, dan sewa. Transaksi mundur memakai dasar biaya saat pencatatan dan tidak menghitung ulang penjualan sebelumnya.

## Teknologi

| Bagian | Teknologi |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Antarmuka dan data | Radix UI, TanStack Query, Wouter |
| Backend | Express 5, Node.js 24 |
| Database | PostgreSQL, Drizzle ORM |
| Kontrak API | OpenAPI, Orval, Zod |
| Workspace | pnpm workspaces |
| Pengujian | Node.js test runner, Playwright |

## Menjalankan secara lokal

### 1. Siapkan kebutuhan

- Node.js **24.22.1 atau lebih baru dalam lini 24.x** dan pnpm. Untuk menginstal rilis terbaru Node.js 24 melalui `nvm`, jalankan `nvm install 24.22.1` lalu `nvm use 24.22.1` (Windows: gunakan nvm-windows dengan perintah yang sesuai).
- PostgreSQL untuk lingkungan pengembangan.
- Git untuk mengambil repositori.

```powershell
git clone https://github.com/leoneshenkad96/kasapink.git
cd kasapink
pnpm install --frozen-lockfile
pnpm run check:node-security
```

### 2. Siapkan database dan konfigurasi backend

Gunakan database pengembangan terpisah. Tinjau skema di `lib/db/src/schema/` dan SQL di `lib/db/migrations/` sebelum menyiapkan database. Repositori tidak menjalankan migrasi secara otomatis melalui langkah di bawah. Jangan menganggap database kosong sudah siap hanya karena dependensi berhasil dipasang.

Lihat [panduan pengembangan](DEVELOPMENT.md) dan [pengaturan autentikasi](AUTHENTICATION.md) untuk penyiapan skema dan akun.

Atur variabel berikut pada proses backend:

| Variabel | Kegunaan |
| --- | --- |
| `DATABASE_URL` | Connection string PostgreSQL pengembangan |
| `JWT_SECRET` | Secret acak minimal 32 karakter untuk autentikasi |
| `ADMIN_BOOTSTRAP_TOKEN` | Token sementara untuk membuat admin pertama jika belum ada akun |
| `PORT` | Opsional; port backend, default pengembangan 5000 |
| `CORS_ORIGINS` | Opsional; daftar origin yang diizinkan, dipisahkan koma |

Contoh PowerShell, ganti placeholder sebelum menjalankan:

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@localhost:5432/kasapink_dev"
$env:JWT_SECRET = "GANTI_DENGAN_SECRET_ACAK_MINIMAL_32_KARAKTER"
$env:ADMIN_BOOTSTRAP_TOKEN = "GANTI_DENGAN_TOKEN_ACAK_SEMENTARA"
pnpm --filter @workspace/api-server dev
```

Buat secret acak dengan menjalankan perintah berikut untuk masing-masing secret:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Jangan memasukkan kredensial ke Git atau variabel `VITE_`. File `frontend.env` dan `port.env` tidak dimuat otomatis oleh skrip pengembangan.

### 3. Jalankan frontend

Buka terminal kedua dari root repositori:

```powershell
pnpm --filter @workspace/erp-rumahan-emak dev
```

Buka [http://localhost:5173](http://localhost:5173). Frontend meneruskan permintaan `/api` ke backend di `http://localhost:5000`.

Jika port backend berbeda, atur `API_PROXY_TARGET` pada terminal frontend. Variabel `PORT` yang sudah ada pada terminal dapat mengganti port default; pastikan frontend dan backend menggunakan port berbeda.

### 4. Buat akun pertama

Jika database belum memiliki pengguna dan `ADMIN_BOOTSTRAP_TOKEN` sudah diatur, gunakan **Buat admin pertama** pada halaman login. Setelah akun dibuat, hapus token bootstrap dari konfigurasi lingkungan.

- **Admin:** akses operasional dan manajemen akun.
- **User:** akses operasional tanpa manajemen akun.
- **Testing:** hanya membaca data.

Lihat [AUTHENTICATION.md](AUTHENTICATION.md) untuk detail sesi dan keamanan.

## Perintah pengembangan

Jalankan dari root repositori:

| Perintah | Fungsi |
| --- | --- |
| `pnpm check:node-security` | Memastikan runtime Node.js 24 telah memiliki patch keamanan 21 Oktober 2026 (minimal 24.22.1) |
| `pnpm typecheck` | Memeriksa tipe TypeScript workspace |
| `pnpm build` | Membangun frontend dan bundle API untuk Vercel |
| `pnpm test:auth` | Menguji autentikasi dengan database double |
| `pnpm test:auth:postgres` | Menguji autentikasi pada cluster PostgreSQL lokal sementara |
| `pnpm test:e2e` | Menjalankan pengujian Playwright |
| `pnpm check:palette` | Memeriksa aturan palet warna |
| `pnpm check:migrations` | Menjalankan pemeriksaan migrasi yang tersedia |
| `pnpm --filter @workspace/api-spec run codegen` | Menghasilkan klien API dan skema dari OpenAPI |

Pengujian PostgreSQL memerlukan `initdb` dan `pg_ctl`; lihat [DEVELOPMENT.md](DEVELOPMENT.md). Kebutuhan konfigurasi pengujian lainnya mengikuti skrip dan konfigurasi masing-masing.

Build memperbarui bundle terlacak `api/index.js`; tinjau perubahannya bersama sumber backend.

## Struktur repositori

```text
artifacts/
  erp-rumahan-emak/   Frontend ERP
  api-server/        Backend Express dan logika transaksi
  mockup-sandbox/    Sandbox mockup
api/                 Bundle API untuk deployment
lib/
  db/                Skema, koneksi database, dan migrasi SQL
  api-spec/          Spesifikasi OpenAPI
  api-zod/           Skema validasi API
  api-client-react/  Klien dan hook API
scripts/             Build, pengujian, backup, dan alat operasional
tests/               Pengujian aplikasi
```

## Deployment dan data

Konfigurasi Vercel tersedia di `vercel.json`; Vercel saat ini menggunakan Node.js `24.x`, dan pembaruan minor/patch diatur oleh platform. Setelah redeploy, cek versi aktual dari log build/runtime sebelum menganggap patch sudah aktif. Mengubah file GitHub tidak memperbarui runtime deployment lama secara langsung. Frontend dibangun ke `artifacts/erp-rumahan-emak/dist/public`, sedangkan permintaan `/api/*` diarahkan ke `api/index.js`. Atur kredensial database dan secret melalui konfigurasi lingkungan hosting.

Menyalin repositori hanya mengambil file dan riwayat yang disimpan di Git. Isi database, secret, dan data layanan eksternal harus disiapkan atau dipulihkan secara terpisah. Tinjau skrip backup dan restore sebelum digunakan pada database tujuan.

## Dokumentasi lanjutan

- [Panduan pengguna](PANDUAN-PENGGUNA.md)
- [Pengembangan lokal](DEVELOPMENT.md)
- [Autentikasi dan akun](AUTHENTICATION.md)
- [Checklist review lokal](LOCAL-REVIEW-CHECKLIST.md)
- [Kesiapan rilis](RELEASE-READINESS.md)
- [Review resep responsif](RESPONSIVE-RECIPE-REVIEW.md)
