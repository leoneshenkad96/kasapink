# Panduan Penggunaan Kasapink ERP

**Panduan operasional untuk pemilik dan tim usaha**

Versi aplikasi: 8 Oktober 2026

Kasapink ERP membantu mencatat bahan, produk, resep, persiapan masak (prep), pembelian, penjualan, stok fisik, waste, biaya operasional, dan laporan usaha. Panduan ini mengikuti menu yang tersedia di aplikasi saat tanggal di atas. Tampilan dapat sedikit berubah saat aplikasi diperbarui.

## Daftar isi

1. Masuk, navigasi, dan hak akses
2. Urutan menyiapkan aplikasi
3. Ringkasan
4. Stok Bahan
5. Produk & Resep
6. Catat Belanja
7. Produksi / Prep
8. Catat Penjualan
9. Stok Opname
10. Kontrol F&B
11. Laporan keuangan
12. Manajemen User
13. Tips dan pemecahan masalah
14. Istilah dan cara hitung

## 1. Masuk, navigasi, dan hak akses

1. Buka alamat aplikasi Kasapink ERP.
2. Masukkan **username** dan **password**, lalu pilih **Masuk ke Sistem**.
3. Gunakan menu di sisi kiri untuk berpindah halaman. Di ponsel, buka menu lewat tombol di kiri atas.
4. Tombol **Password** membuka formulir ganti password. Tombol **Kunci** mengakhiri sesi di perangkat tersebut.

Aplikasi mengakhiri sesi setelah 20 menit tanpa aktivitas. Perubahan yang belum disimpan dapat hilang jika berpindah halaman; aplikasi akan meminta konfirmasi sebelum meninggalkan formulir yang sedang diedit.

**Peran akun:**

- **Admin** dapat memakai fitur operasional dan membuka **Manajemen User**.
- **User** dapat memakai fitur operasional yang sama, tetapi tidak dapat mengelola akun.
- **Testing** hanya dapat melihat data. Tombol perubahan dan penyimpanan dinonaktifkan.

Jangan berbagi password. Minta admin membuatkan akun sendiri untuk setiap anggota tim agar aktivitas usaha dapat dikelola dengan akses yang tepat.

## 2. Urutan menyiapkan aplikasi

Sebelum mencatat transaksi, siapkan data dasar dengan urutan ini:

1. **Stok Bahan:** buat semua bahan, pilih jenis, kategori, satuan, stok awal, biaya per satuan stok awal, dan batas minimum.
2. **Produksi / Prep:** buat prep yang memang diproduksi terlebih dahulu, misalnya nasi matang atau ayam suwir; atur resep bahan dan hasil standarnya.
3. **Produk & Resep:** buat produk yang dijual, harga, dan jenisnya. Atur resep bahan langsung dan pemakaian prep pada produk yang sesuai.
4. **Catat Belanja:** masukkan pembelian agar stok dan biaya rata-rata bahan diperbarui.
5. **Catat Penjualan:** catat produk yang terjual pada tanggal yang benar.
6. **Stok Opname:** cocokkan stok sistem dengan hasil hitung fisik.
7. **Kontrol F&B** dan **Laporan:** tinjau kinerja sesuai periode yang dipilih.

Gunakan satuan yang konsisten, misalnya kilogram untuk stok dan kilogram untuk resep. Jika resep memakai satuan yang berbeda, pastikan satuan serta konversinya masuk akal sebelum produksi atau penjualan dicatat.

## 3. Ringkasan

Halaman **Ringkasan** memberi gambaran usaha hari ini, antara lain penjualan, laba kotor, belanja bahan, bahan yang menipis, dan transaksi terbaru. Angka dihitung dari data transaksi yang sudah tersimpan.

Jika angka terlihat tidak sesuai, periksa tanggal pada transaksi terkait, resep produk, biaya bahan, dan apakah pembelian atau produksi batch sudah dicatat.

## 4. Stok Bahan

Buka menu **Stok Bahan**, lalu pilih sub-menu **Makanan** atau **Parfum**. Gunakan pencarian untuk menemukan bahan. Daftar menunjukkan stok, satuan, batas minimum, harga terakhir, dan tren harga pembelian.

### Menambahkan bahan

1. Pilih **Tambah bahan**.
2. Isi nama, kategori, satuan, stok awal, **biaya per satuan stok awal**, dan batas minimum.
3. Pilih **Simpan bahan**.

Nama bahan harus diawali huruf kapital. Contoh: `Bawang Putih`. Biaya awal dipakai sebagai dasar HPP bahan sebelum ada transaksi pembelian.

### Mengubah bahan

Gunakan ikon pensil untuk mengubah informasi dan batas minimum. Untuk memperbarui jumlah stok bahan, catat pembelian atau lakukan Stock Opname; jangan gunakan edit data master sebagai pengganti pencatatan pergerakan stok.

Ikon tempat sampah menghapus bahan. Penghapusan dapat ditolak atau memengaruhi data resep jika bahan masih digunakan.

Status **Menipis** berarti stok sama dengan atau lebih kecil dari batas minimum. Tinjau tren harga berdasarkan transaksi pembelian yang telah dicatat.

## 5. Produk & Resep

Buka **Produk & Resep**, kemudian pilih **Makanan** atau **Parfum**. Produk dibagi menjadi dua jenis:

- **Produk olahan** dibuat dari resep bahan dan/atau prep. Penjualan mengurangi stok bahan atau prep sesuai resep.
- **Produk jadi** dijual langsung dari stok produk, misalnya barang yang dibeli untuk dijual kembali. Penjualan mengurangi stok produk tersebut.

### Membuat produk

1. Pilih **Tambah produk**, lalu isi nama dan harga jual per unit.
2. Pilih jenis produk: olahan atau jadi.
3. Untuk produk jadi, masukkan stok awal dan biaya beli per unit.
4. Untuk produk olahan sederhana, opsi resep otomatis 1:1 dapat dipakai jika satu unit produk memang memakai satu unit bahan utama.
5. Simpan produk. Jika resep tidak dibuat otomatis, buka kartu produk dan pilih **Atur resep**.

### Mengatur resep produk

Masukkan jumlah setiap bahan untuk membuat satu unit/porsi produk. Bahan dengan kategori yang memuat kata **Mikro** atau **Operasional** tidak dimasukkan ke resep makro di formulir ini. Bahan yang tidak dipakai dibiarkan kosong atau bernilai nol.

Untuk produk yang menggunakan prep, buka **Produksi / Prep** dan tautkan prep yang digunakan per porsi. HPP produk olahan memperhitungkan resep bahan serta pemakaian prep sesuai konfigurasi.

Kartu produk menunjukkan perkiraan biaya bahan, sisa setelah biaya produk, dan margin perkiraan. Angka tersebut bukan laba bersih dan belum tentu mencakup semua biaya usaha.

## 6. Catat Belanja

Catat pembelian bahan segera setelah transaksi terjadi agar stok dan HPP tetap mendekati kondisi nyata.

1. Periksa tanggal pembelian.
2. Pilih asal pembelian yang tersedia.
3. Pilih bahan, masukkan jumlah yang dibeli, dan **total biaya untuk jumlah tersebut**.
4. Gunakan **Tambah bahan** untuk memasukkan beberapa bahan; pisahkan jumlah dan biaya per bahan.
5. Periksa total pengeluaran, lalu pilih **Simpan belanja**.

Setelah tersimpan, stok bertambah dan biaya rata-rata bahan diperbarui. Contoh: membeli 2 kg tepung seharga Rp30.000 berarti masukkan kuantitas `2` dan total biaya `30000`, bukan biaya per kilogram.

## 7. Produksi / Prep

Menu **Produksi / Prep** digunakan untuk bahan olahan yang dibuat dalam batch sebelum dipakai dalam menu. Alurnya: **bahan baku → produksi batch → stok prep → produk jualan**.

### Membuat dan mengatur prep

1. Pilih **Buat prep**.
2. Isi nama, satuan stok, dan hasil standar satu batch. Contoh: 1 batch menghasilkan 5 kg nasi matang.
3. Pilih prep, lalu di bagian **Resep** masukkan jumlah bahan untuk menghasilkan satu hasil standar dan pilih satuannya.
4. Simpan resep prep sebelum mencatat produksi.

### Mencatat produksi batch

1. Pilih tanggal produksi.
2. Isi target hasil batch dan hasil jadi yang benar-benar masuk stok.
3. Periksa persentase yield/susut, lalu pilih **Catat produksi**.

Sistem mengurangi bahan baku sesuai resep, menambah stok prep sebesar hasil jadi, dan memperbarui HPP prep. Riwayat batch menampilkan tanggal, kuantitas hasil, yield, dan HPP.

### Memakai prep pada produk

Di bagian **Atur prep untuk produk jualan**, pilih produk makanan. Tambahkan prep yang benar-benar dipakai dan isi jumlah per porsi serta satuannya, lalu pilih **Simpan pemakaian**. Saat produk terjual, stok prep berkurang sesuai pemakaian dan biaya prep ikut dihitung ke HPP.

## 8. Catat Penjualan

1. Pilih kategori penjualan **Makanan** atau **Parfum**.
2. Periksa tanggal transaksi.
3. Pilih produk dan jumlah yang terjual. Gunakan **Tambah produk** untuk memasukkan beberapa produk dalam transaksi yang sama.
4. Periksa perkiraan penjualan, lalu pilih **Simpan penjualan**.

Harga memakai harga jual pada master produk. Untuk produk olahan, sistem mengurangi stok bahan dan prep berdasarkan resep. Untuk produk jadi, sistem mengurangi stok produk.

Jika resep kosong atau stok kurang, transaksi dapat tetap tersimpan dengan peringatan. Baca peringatannya, lalu benahi resep, catat pembelian/produksi, atau koreksi stok melalui Stock Opname. Stok dapat menjadi minus; jangan abaikan warning tersebut.

## 9. Stok Opname

Gunakan **Stok Opname** untuk mencatat jumlah fisik **bahan dan preparation**. Selisih dihitung sebagai:

**Variance kuantitas = stok fisik − stok sistem**

1. Pilih tanggal opname.
2. Hitung bahan/prep yang tersedia secara fisik.
3. Isi kolom **Stok Fisik** hanya untuk item yang dihitung dan ingin dikoreksi.
4. Tinjau selisih yang ditampilkan, lalu pilih **Simpan hasil opname**.

Kolom kosong berarti item tersebut tidak diubah. Nilai fisik `0` adalah hitungan nol dan berbeda dari kolom kosong. Simpan akan membuat movement adjustment dan memperbarui stok. Nilai variance rupiah menggunakan HPP item saat opname.

Hasil adjustment tampil pada **Stock Opname Variance** di Kontrol F&B. Adjustment tidak digabung ke **Recipe Usage Variance**.

## 10. Kontrol F&B

Halaman **Kontrol F&B** merangkum periode yang dipilih. Atur tanggal **Dari** dan **Sampai** untuk meninjau periode lain.

- **Penjualan:** nilai dan jumlah menu terjual.
- **HPP Aktual** dan **Food Cost:** biaya bahan aktual untuk penjualan.
- **Waste:** bahan atau prep yang dicatat terbuang.
- **Laba Bersih:** laba setelah biaya operasional tercatat di aplikasi.
- **Menu paling menghasilkan:** penjualan, HPP, food cost, dan laba kotor per menu.
- **Recipe Usage Variance:** perbandingan pemakaian aktual dengan pemakaian teoritis menurut resep dan penjualan. Prep yang dibuat sebelum periode dapat memengaruhi angka aktual.
- **Stock Opname Variance:** selisih jumlah dan nilai rupiah dari movement adjustment Stock Opname.

### Mencatat waste

Di bagian **Catat yang terbuang**, pilih jenis item (bahan/prep), item, jumlah, dan alasan. Catat waste saat terjadi agar biaya dan jumlah waste tercermin pada laporan.

### Mencatat biaya usaha

Di bagian **Catat pengeluaran**, isi kategori, keterangan, dan nominal, lalu pilih **Simpan pengeluaran**. Contoh: gas, listrik, air, transportasi, atau biaya di luar bahan. Hanya biaya yang dicatat di aplikasi yang masuk perhitungan periode.

## 11. Laporan keuangan

Buka **Laporan keuangan**, pilih rentang tanggal **Dari** dan **Sampai**, lalu tinjau penjualan, harga pokok terjual, belanja bahan, dan laba kotor per hari.

Belanja bahan ditampilkan terpisah dari HPP karena pembelian menambah persediaan; pembelian tidak sama dengan bahan yang sudah dipakai. Laporan keuangan ini menampilkan laba kotor. Untuk melihat biaya operasional dan laba setelah biaya yang dicatat, gunakan Kontrol F&B.

## 12. Manajemen User

Menu **Manajemen User** hanya tersedia untuk admin. Admin dapat membuat akun, mengatur peran, dan mereset password sesuai kontrol yang tersedia di layar.

- Buat akun terpisah untuk setiap orang; jangan memakai satu akun bersama.
- Berikan peran **User** untuk pemakaian operasional sehari-hari.
- Gunakan peran **Testing** untuk melihat data tanpa mengubahnya.
- Batasi peran **Admin** untuk orang yang perlu mengelola akun.
- Minta setiap pengguna mengganti password melalui tombol **Password** jika diperlukan.

## 13. Tips dan pemecahan masalah

- **Data belum dapat dimuat / HTTP 500:** pilih **Coba muat kembali** satu kali. Jika tetap gagal, catat halaman, waktu, dan pesan error lalu hubungi admin; jangan mengulang transaksi yang mungkin sudah tersimpan.
- **Tidak bisa masuk:** periksa username/password dan pastikan akun belum dinonaktifkan atau diubah oleh admin. Password tidak dapat dilihat kembali oleh admin; gunakan reset/ganti password.
- **Bahan atau produk tidak muncul:** periksa submenu kategori (Makanan/Parfum), pencarian, dan data master.
- **Stok atau HPP berbeda:** periksa tanggal pembelian, kuantitas, total biaya, resep, hasil produksi batch, penjualan, dan adjustment terakhir.
- **Stok opname tidak mengubah item:** pastikan kolom stok fisik terisi; kolom kosong memang tidak dikirim.
- **Penjualan tersimpan dengan warning:** baca warning dan periksa stok bahan/prep/produk. Jangan hapus warning tanpa membenahi catatan sumbernya.
- **Form belum tersimpan:** tetap di halaman dan simpan dahulu. Jika pindah halaman, konfirmasi akan memberi tahu bahwa isian bisa hilang.
- Gunakan tanggal transaksi yang benar. Laporan mengikuti tanggal yang tersimpan, bukan tanggal saat transaksi dimasukkan.

## 14. Istilah dan cara hitung

| Istilah | Arti |
|---|---|
| Stok sistem | Jumlah yang tercatat di aplikasi sebelum hitung fisik. |
| Stok fisik | Jumlah yang benar-benar dihitung di tempat usaha. |
| Variance kuantitas | Stok fisik dikurangi stok sistem. Nilai negatif berarti jumlah fisik lebih sedikit. |
| Variance rupiah | Dampak nilai adjustment berdasarkan HPP item saat opname. |
| HPP | Biaya bahan/prep yang dipakai untuk menghasilkan produk atau prep. |
| Recipe Usage Variance | Selisih pemakaian aktual dibandingkan kebutuhan teoritis dari resep dan penjualan. |
| Stock Opname Variance | Selisih hasil hitung fisik yang tercatat sebagai adjustment Stock Opname. |
| Laba kotor | Penjualan dikurangi HPP produk terjual. Belum dikurangi seluruh biaya operasional. |
| Laba bersih (Kontrol F&B) | Nilai setelah biaya operasional dan waste yang dicatat dalam sistem. |

**Prinsip pencatatan:** masukkan transaksi pada saat terjadi, gunakan satuan konsisten, periksa tanggal dan kuantitas, serta simpan resep sebelum transaksi yang mengandalkannya.
