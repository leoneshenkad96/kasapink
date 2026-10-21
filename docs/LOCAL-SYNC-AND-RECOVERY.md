# Sinkronisasi lokal dan pemulihan Kasapink

Panduan ini memperbarui source code dari GitHub dan memasang backup di Windows. Data transaksi berada di PostgreSQL; `git pull` tidak memperbarui isi database. Konfigurasi dan pekerjaan yang belum di-commit perlu dipertahankan.

## Update source di laptop

Gunakan Node.js 24.22.1 atau rilis yang lebih baru dalam lini 24.x, Git, dan pnpm. Jika memakai nvm-windows, jalankan `nvm install 24.22.1` lalu `nvm use 24.22.1` dari terminal yang sesuai. Tutup server pengembangan yang sedang berjalan sebelum memasang dependensi.

Unduh `scripts/sync-local.ps1` dari commit yang telah ditinjau, lalu jalankan file tersebut. Skrip memeriksa remote GitHub dan membaca helper dari commit `main` yang baru di-fetch, sehingga dapat dijalankan walaupun folder lokal belum memiliki updater. Contoh:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-local.ps1 -RepoPath 'C:\1. Personal Life\3. ERP Project\1. Kasapink\ERP-Replit\ERP-Rumahan-Emak\ERP-Rumahan-Emak'
```

Setelah skrip tersedia dalam repo, update berikutnya cukup `pnpm local:sync` dari root repo.

Updater memeriksa bahwa `origin` adalah `leoneshenkad96/kasapink`, branch lokal `main`, dan update dapat dilakukan dengan fast-forward. Perubahan tracked dan untracked disimpan dengan `git stash --include-untracked` sebelum update. Hash stash dicatat di `.local/last-sync.json`; stash tidak dikirim ke GitHub dan tidak dihapus. File ignored seperti `.env` dan `.local` tetap berada di laptop.

Jika branch berbeda, sedang konflik, atau ada commit lokal yang divergen, updater berhenti tanpa reset/rebase. Pertahankan branch tersebut dan tinjau perbedaannya terlebih dahulu. Tidak ada perintah `reset --hard`, `clean`, `push --force`, migrasi database, seed data, atau restart proses dalam updater.

Updater menjalankan pengecekan Node, instalasi lockfile, validasi urutan file migrasi, typecheck, tes autentikasi/redaksi audit/backup, dan build. Validasi urutan file **tidak** membuktikan migrasi sudah diterapkan pada PostgreSQL lokal. Sebelum menjalankan API dengan `VERCEL` aktif, pastikan migrasi `0024_auth_rate_limit.sql` sudah diterapkan pada database yang benar. Pengembangan biasa tanpa `VERCEL` menggunakan limiter lokal.

Untuk meninjau pekerjaan tersimpan:

```powershell
git stash list
git stash show --stat HASH_DARI_LAST_SYNC
git stash show -p HASH_DARI_LAST_SYNC
```

Terapkan kembali hanya perubahan yang masih diperlukan dengan `git stash apply HASH`. Konflik harus ditinjau agar perbaikan keamanan terbaru tidak tertimpa.

## Backup harian terenkripsi di Windows

Kebutuhan: PostgreSQL client versi yang cocok dengan server (contoh PostgreSQL 17), PostgreSQL lokal untuk uji restore, akun lokal dengan hak `CREATEDB`, serta tujuan salinan kedua pada penyimpanan terpisah yang dipercaya. Dua direktori pada disk yang sama tidak melindungi dari kerusakan disk. Skrip memverifikasi isi salinan, tetapi tidak dapat membuktikan lokasi fisik penyimpanannya.

Installer menyimpan URI sumber, URI admin PostgreSQL lokal, dan kunci backup sebagai SecureString melalui Windows DPAPI. Konfigurasi tersimpan di `.local/backup/config.clixml`, di luar Git, dengan ACL akun Windows yang sama dan SYSTEM. DPAPI hanya dapat dibuka oleh akun pada komputer pembuatnya. Karena itu, **simpan kunci pemulihan secara terpisah dalam password manager**; kehilangan laptop beserta kunci DPAPI saja tidak cukup untuk memulihkan backup.

Buat kunci acak di terminal laptop dan simpan hasilnya di password manager. Jangan kirim kunci/URI database ke chat atau GitHub:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Kemudian jalankan dari root repo, ganti path tujuan dengan penyimpanan terpisah milik sendiri:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-daily-backup.ps1 -OffsiteDir 'E:\Kasapink-Recovery' -PgBin 'C:\Program Files\PostgreSQL\17\bin'
```

Masukkan URI sumber, kunci 64 karakter hex, dan URI admin PostgreSQL **loopback** saat diminta secara tersembunyi. PostgreSQL lokal harus sedang aktif. Gunakan user sumber dengan izin baca yang cukup untuk semua tabel. Koneksi sumber remote memakai TLS `verify-full`; client menggunakan CA sistem. Bila instalasi client membutuhkan CA khusus, atur `PGSSLROOTCERT` pada lingkungan proses backup.

Installer menjalankan backup dan restore nyata terlebih dahulu. Scheduler baru didaftarkan setelah semuanya lulus. Setiap run:

1. Membuat custom-format `pg_dump` dan memeriksa tabel penting.
2. Mengenkripsi dengan AES-256-GCM menggunakan nonce acak; menyimpan checksum SHA-256 dan manifest.
3. Menyalin ciphertext ke tujuan kedua dan mencocokkan checksum.
4. Mendekripsi untuk memeriksa autentikasi file, umur backup, dan daftar tabel.
5. Membuat database lokal bernama acak, menjalankan restore lengkap dalam satu transaksi, menghitung baris tabel penting, dan menghapus database sementara.
6. Menulis laporan `.restore-check.json` dan `.local/backup/last-success.json` hanya setelah berhasil.

Arsip `.dump.enc` dan manifest `.json` diperlukan untuk pemulihan. Laporan restore menyimpan jumlah baris, tanpa isi data. File plaintext sementara dibersihkan setelah proses; hentinya listrik/proses secara paksa tetap dapat menyisakan folder sementara sehingga enkripsi disk Windows tetap relevan. Backup lama tidak dihapus otomatis oleh alur ini. Tinjau kapasitas dan retensi setelah ada beberapa hasil restore yang terbukti baik.

Jadwal default pukul **02:00 sesuai zona waktu Windows**, juga ketika akun login. Task memakai akun interaktif terbatas: komputer harus menyala dan akun tersebut sedang login. `StartWhenAvailable` membantu mengejar jadwal yang terlewat. Untuk mini PC yang berjalan tanpa login, gunakan identitas layanan yang sesuai; konfigurasi ini tidak mengklaim berjalan saat akun logout.

Periksa hasil di Windows:

```powershell
Get-ScheduledTaskInfo -TaskName 'Kasapink ERP Daily Backup'
Get-Content .\.local\backup\last-success.json
Get-ChildItem .\.local\backup\archives\*.restore-check.json
```

`LastTaskResult` harus 0 dan waktu `last-success.json` harus terbaru. Run yang gagal tidak memperbarui waktu sukses. Ulangi manual melalui `scripts/run-daily-backup.ps1`; gunakan akun Windows pembuat konfigurasi.

## Restore dengan pengamanan

`pnpm restore:check` membaca backup dan membuat/menghapus database uji lokal baru. Set `ERP_RESTORE_ADMIN_URL` ke PostgreSQL lokal; operasi ini tidak memakai URI sumber untuk restore. Pengujian membuktikan file bisa dipulihkan dan tabel penting terbaca, bukan kecocokan seluruh transaksi bisnis.

Restore ke database lokal tertentu merupakan operasi berbeda dan sengaja memerlukan:

- `ERP_RESTORE_DATABASE_URL`: database ERP lokal khusus, bukan `postgres`, `template0`, atau `template1`.
- `ERP_BACKUP_FILE` beserta manifest dan `ERP_BACKUP_KEY`.
- `ALLOW_ERP_RESTORE=true` dan `CONFIRM_ERP_RESTORE=RESTORE KASAPINK ERP`.

Lalu jalankan `pnpm restore:erp`. Tabel yang sama di target lokal akan diganti. URI dengan host remote atau query pengalih seperti `host=`, `hostaddr=`, `service=`, dan `dbname=` ditolak. Password tidak disertakan di argumen proses. `DATABASE_URL` sumber tidak pernah digunakan sebagai target restore.

## Batas verifikasi

Tes otomatis memakai fixture dan server PostgreSQL CI sementara. Bukti backup produksi hanya sah setelah installer berhasil dijalankan pada host yang dipilih dengan URI sumber yang benar, salinan kedua berada pada penyimpanan independen, dan laporan restore bertanggal terbaru tersedia. Proteksi branch Neon tetap bergantung pada paket akun. UAT produksi terautentikasi tetap memerlukan akun uji sah; alur ini tidak membuat transaksi produksi.

Referensi: [PostgreSQL pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html), [Microsoft Export-Clixml / DPAPI](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/export-clixml), [Node.js 24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1).
