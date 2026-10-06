# Panduan Penggunaan Kasapink ERP

Kasapink ERP membantu mencatat persediaan bahan, resep produk, belanja, penjualan, stok fisik, dan ringkasan keuangan usaha.

## 1. Masuk dan navigasi

1. Buka aplikasi Kasapink ERP.
2. Masukkan password akses yang diberikan oleh pengelola, lalu pilih **Masuk ke Sistem**.
3. Gunakan menu di sisi kiri untuk berpindah halaman. Di ponsel, ketuk tombol menu di kiri atas.
4. Tombol **Kunci** mengakhiri akses pada perangkat tersebut. Aplikasi juga mengunci otomatis setelah 20 menit tanpa aktivitas. Jika semua tab ditutup, hitungan tetap berjalan; setelah 20 menit tidak aktif, Anda akan diminta masuk lagi saat membuka aplikasi.

## 2. Urutan awal penggunaan

Agar transaksi dan laporan dihitung dengan benar, siapkan data dengan urutan berikut:

1. **Stok Bahan:** masukkan semua bahan, satuan, stok awal, biaya per satuan stok awal, dan batas minimum.
2. **Produk & Resep:** masukkan produk dan harga jual, kemudian atur jumlah setiap bahan untuk membuat satu produk.
3. **Catat Belanja:** catat pembelian bahan agar saldo stok dan biaya bahan diperbarui.
4. **Catat Penjualan:** catat produk yang terjual. Sistem mengurangi stok bahan sesuai resep.
5. **Stok Opname:** cocokkan saldo aplikasi dengan jumlah bahan yang benar-benar tersedia.
6. **Laporan:** pilih rentang tanggal untuk melihat hasil usaha.

## 3. Ringkasan

Halaman **Ringkasan** menampilkan kondisi hari ini:

- **Penjualan hari ini:** nilai penjualan yang dicatat untuk tanggal hari ini.
- **Laba kotor:** penjualan dikurangi biaya bahan yang dipakai untuk produk terjual.
- **Belanja bahan:** total transaksi pembelian bahan hari ini.
- **Bahan menipis:** jumlah bahan dengan stok sama dengan atau di bawah batas minimum.
- **Stok perlu diisi:** daftar singkat bahan yang mencapai batas minimum.
- **Catatan terakhir:** transaksi belanja dan penjualan terbaru.

Angka berasal dari transaksi yang sudah disimpan. Pastikan tanggal pada setiap transaksi benar.

## 4. Mengelola stok bahan

Buka **Stok Bahan** untuk melihat, mencari, menambah, mengubah, atau menghapus bahan.

### Menambah bahan

1. Pilih **Tambah bahan**.
2. Isi nama, kategori, satuan (misalnya kg, liter, atau butir), stok awal, biaya per satuan stok awal, dan batas minimum.
3. Pilih simpan. Stok awal dan biayanya menjadi dasar penghitungan persediaan dan laba.

### Mengubah atau menghapus bahan

- Gunakan ikon pensil untuk mengubah informasi bahan dan batas minimum.
- Perubahan jumlah stok dicatat melalui **Catat Belanja** atau **Stok Opname**, bukan dari formulir ubah bahan.
- Gunakan ikon tempat sampah untuk menghapus bahan dan konfirmasi jika diminta. Penghapusan dapat memengaruhi kemampuan mengelola resep yang memakai bahan tersebut.
- Gunakan kolom pencarian untuk mencari nama atau kategori. Label **Menipis** berarti jumlah stok sama dengan atau lebih rendah dari batas minimum.

## 5. Mengelola produk dan resep

Buka **Produk & Resep**. Setiap produk memiliki salah satu dari dua tipe:

- **Produk Jadi:** barang yang dibeli lalu dijual kembali, seperti parfum botolan. Masukkan stok barang jadi dan biaya beli per unit. Penjualan mengurangi stok produk ini, bukan stok bahan. Untuk restock atau koreksi, ubah nilai stok pada formulir produk.
- **Produk Olahan:** makanan atau barang racikan yang stok bahan makronya dipotong saat terjual.

### Menambah produk

1. Pilih **Tambah produk**, lalu isi nama dan harga jual per unit.
2. Pilih **Produk Jadi** atau **Produk Olahan**.
3. Untuk Produk Jadi, isi stok awal dan biaya beli per unit.
4. Untuk Produk Olahan sederhana, centang **Otomatis ambil dari bahan (rasio 1:1)** dan pilih bahan makro utama. Sistem langsung membuat resep satu satuan bahan untuk satu produk.
5. Jika tidak memakai auto-resep, simpan produk lalu pilih **Atur resep** pada kartunya.

### Mengatur resep

- Masukkan jumlah bahan makro untuk membuat **satu** produk, mengikuti satuan bahan yang terdaftar.
- Garam, micin, dan bahan mikro lainnya dicatat sebagai biaya operasional di luar resep/stok. Jika bahan tersebut terdaftar, gunakan kategori yang memuat kata **Mikro** atau **Operasional** agar tidak muncul pada form resep.
- Kosongkan bahan yang tidak dipakai. Isi `0` juga berarti bahan tersebut tidak digunakan.
- Kartu produk menampilkan perkiraan biaya bahan, sisa setelah biaya produk, dan persentase dari harga jual. Perkiraan biaya resep memakai biaya rata-rata bahan saat ini dan belum memasukkan seluruh biaya operasional.
- Gunakan ikon pensil untuk mengubah data produk. Gunakan ikon tempat sampah untuk menghapus produk.

## 6. Mencatat belanja bahan

Buka **Catat Belanja** setiap kali membeli bahan.

1. Periksa tanggal transaksi dan pilih asal belanja: Pasar, Toko, Grosir, atau Lainnya.
2. Untuk setiap bahan, pilih bahan, masukkan jumlah yang dibeli, dan **total biaya untuk jumlah tersebut**.
3. Pilih **Tambah bahan** untuk mencatat beberapa jenis bahan dalam satu transaksi.
4. Periksa total pengeluaran, lalu pilih **Simpan belanja**.

Setelah tersimpan, stok bahan bertambah dan biaya rata-rata bahan diperbarui. Jika membeli beberapa bahan sekaligus, pisahkan biaya setiap bahan pada barisnya masing-masing.

## 7. Mencatat penjualan

Buka **Catat Penjualan**.

1. Pastikan tanggal transaksi benar.
2. Pilih produk dan jumlah yang terjual. Pilih **Tambah produk** untuk menambahkan produk lain ke transaksi yang sama.
3. Perkiraan penjualan dihitung dari harga jual produk dan jumlahnya.
4. Pilih **Simpan penjualan**.

Harga mengikuti daftar harga produk. Untuk Produk Olahan, bahan pada resep akan mengurangi stok bahan. Untuk Produk Jadi, stok produk yang berkurang.

Jika resep belum diatur atau stok bahan/produk kurang, transaksi tetap disimpan. Aplikasi menampilkan warning kuning dan saldo stok boleh menjadi minus. Periksa warning, lalu lakukan pembelian atau koreksi melalui stok opname (bahan) atau formulir produk (stok barang jadi).

## 8. Melakukan stok opname

Gunakan **Stok Opname** untuk menyesuaikan catatan dengan hitungan fisik.

1. Pilih tanggal opname.
2. Hitung bahan yang tersedia secara fisik.
3. Isi kolom jumlah fisik untuk bahan yang perlu diperbarui. Nilai selisih dibanding saldo sistem ditampilkan pada tabel.
4. Pilih **Simpan hasil opname**.

Kolom yang dibiarkan kosong memakai saldo saat ini, sehingga tidak mengubah jumlah bahan tersebut. Periksa tanggal dan angka sebelum menyimpan.

## 9. Membaca laporan keuangan

Buka **Laporan**, lalu pilih tanggal **Dari** dan **Sampai**. Halaman menampilkan rincian harian untuk:

- Penjualan.
- Harga pokok terjual (perkiraan biaya bahan yang digunakan untuk produk terjual).
- Belanja bahan.
- Laba kotor.

Laba kotor dihitung dari penjualan dikurangi biaya bahan produk yang terjual. Angka ini belum memasukkan upah, listrik, sewa, ongkos kirim, dan biaya operasional lain. Belanja bahan ditampilkan terpisah dari harga pokok penjualan.

## 10. Tips dan pemecahan masalah

- Jika daftar bahan atau produk masih kosong, tambahkan datanya terlebih dahulu.
- Jika penjualan gagal, pastikan setiap produk memiliki resep dan stok cukup untuk semua bahan resep.
- Jika stok aplikasi berbeda dari stok nyata, lakukan stok opname.
- Jika data gagal dimuat, periksa koneksi internet dan gunakan **Coba muat kembali** bila tersedia.
- Pastikan tanggal transaksi benar sebelum menyimpan, terutama untuk transaksi yang dicatat setelah kejadian.
- Laba yang ditampilkan adalah laba kotor berbasis biaya bahan; gunakan pencatatan terpisah untuk biaya operasional lainnya.
