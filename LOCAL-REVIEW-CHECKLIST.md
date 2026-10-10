# Checklist Review Lokal Kasapink ERP

## Status saat ini

- Local stack aktif di `http://localhost:5173`.
- PostgreSQL lokal berjalan di `127.0.0.1:55432`.
- API lokal berjalan di `http://localhost:5000`.
- Data Neon dan deployment Vercel tidak dipakai atau diubah oleh local stack.
- Belum ada commit, push, preview deployment, atau production deployment.

Jalankan `pnpm local:start` untuk menyalakan seluruh stack. Perintah akan menampilkan kredensial admin lokal. Jalankan `pnpm local:stop` setelah review selesai.

## Yang perlu diperiksa di browser

1. Login dengan akun admin lokal yang ditampilkan oleh `pnpm local:start`.
2. **Ringkasan**: penjualan demo Rp45.000 dan laba kotor Rp27.000 tampil.
3. **Stok Bahan > Makanan**: `Beras Demo Lokal` dan `Ayam Suwir Demo Lokal` tampil.
4. **Stok Bahan > Parfum**: `Botol Parfum Demo Lokal` tampil.
5. **Produk & Resep > Makanan**: `Nasi Bakar Demo Lokal` beserta resep tampil.
6. **Produk & Resep > Parfum**: `Parfum Demo Lokal` tampil.
7. **Manajemen User**: akun admin lokal dapat membuka halaman ini.
8. Tombol **Password** dapat membuka form ganti password. Jangan simpan perubahan bila ingin mempertahankan kredensial awal.
9. Tombol **Keluar semua sesi** akan mencabut seluruh sesi akun lokal. Login kembali bila tombol ini diuji.

## Perubahan yang dibuat dalam pekerjaan ini

### Keamanan autentikasi

- Token sesi sekarang terikat pada revisi akun dan hash password.
- Logout mencabut seluruh token aktif milik akun.
- Ganti password mencabut token lama dan mengembalikan token pengganti.
- Reset password serta perubahan role oleh admin mencabut sesi lama pengguna tersebut.
- Update akun memakai pemeriksaan konflik agar perubahan bersamaan tidak saling menimpa.
- Validasi token diperketat.
- Cache React Query dibersihkan saat logout.

### Pengalaman lokal

- Frontend default di port `5173` dan proxy API dapat dikonfigurasi.
- Backend development default di port `5000`.
- `pnpm local:start` menyiapkan PostgreSQL, schema, admin, data demo, API, dan frontend lokal.
- `pnpm local:stop` menghentikan stack lokal.
- Script seed/admin menolak koneksi database non-loopback agar tidak bisa salah sasaran ke Neon.
- State, log, dan kredensial lokal disimpan di `.local/`, yang sudah diabaikan Git.
- Hook pasca-merge tidak lagi otomatis mendorong schema database.

### Stabilitas frontend

- Redirect autentikasi dipindahkan ke effect React agar state router tidak berubah saat render.
- Pesan logout diperjelas menjadi **Keluar semua sesi**.
- Modal ganti password menyimpan token pengganti dari server.

### Test dan dokumentasi

- Test sesi autentikasi in-memory ditambahkan.
- Test integrasi autentikasi PostgreSQL nyata ditambahkan.
- Dokumentasi development, autentikasi, dan release readiness ditambahkan/diperbarui.

## Hasil verifikasi terakhir

- Frontend TypeScript: lulus.
- Frontend production build: lulus.
- Backend build dan typecheck: lulus.
- Test autentikasi in-memory: lulus.
- Test autentikasi PostgreSQL: lulus.
- `git diff --check`: lulus; hanya peringatan normal konversi LF/CRLF di Windows.
- Browser: login, dashboard, stok makanan, produk makanan, dan produk parfum terverifikasi.
- Console browser setelah perbaikan redirect React: tidak ada error atau warning baru.

## Perubahan lain yang sudah ada sebelumnya

File berikut sudah berubah atau belum terlacak sebelum pekerjaan keamanan/local stack ini dimulai dan harus direview terpisah:

- `PANDUAN-PENGGUNA.md`
- `Panduan_Penggunaan_Kasapink_ERP.docx`
- `api/index.js`
- satu perubahan `recipeUnit` di `artifacts/api-server/src/routes/erp.ts`
- folder `lib/db/drizzle/`

## Gerbang deployment

Deployment baru dilakukan setelah review lokal disetujui. Sebelum preview deployment, environment preview Vercel harus dipisahkan dari database produksi atau diarahkan ke branch Neon khusus preview. Setelah preview lulus smoke test, production baru dapat dipromosikan.
