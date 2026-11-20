# Cek HP ke-15: kolom "Dicatat" di CSV, "Terakhir" menurut urutan catat, jam, "(perkiraan)", subjudul Perkiraan kas

Pakai Expo Go dan DATA CONTOH saja. Tidak ada angka uang yang berubah.

| No | Lakukan | Yang harus tampak |
|---|---|---|
| 1 | Catat satu pengeluaran bersama dengan tanggal MUNDUR (misalnya 10 hari lalu), catatan "uji mundur" | Beranda, kartu "Terakhir": catatan itu ada di baris paling atas, dengan "Dicatat 20 Nov, 19.42" (contoh; angkanya mengikuti hari dan jam HP saat dicatat) |
| 2 | Buka tab Riwayat | Catatan yang sama muncul di bawah header tanggal MUNDUR itu (Riwayat tetap urut tanggal transaksi), bukan di atas |
| 3 | Menu > Cadangan dan ekspor, buat CSV "Buku kas". Cara membuka: Bagikan ke diri sendiri lalu buka dengan Google Sheets | Kolom terakhir (paling kanan, setelah "Alasan koreksi") bernama "Dicatat", isinya seperti 2026-11-20 19:42 (contoh; mengikuti hari dan jam HP saat dicatat); kolom lain tidak bergeser |
| 4 | Di CSV Buku kas, buka di Excel atau Google Sheets, jumlahkan seluruh kolom Masuk (Rp), jumlahkan seluruh kolom Keluar (Rp), lalu kurangkan | Hasilnya sama dengan Total kas di Beranda |
| 5 | Buat CSV "Pembayaran" dan buka (Bagikan ke diri sendiri lalu buka dengan Google Sheets) | Kolom terakhir "Dicatat" ada, berisi tanggal dan jam pembayaran dicatat, bentuknya seperti 2026-11-20 19:42 |
| 6 | Baca keterangan di bawah tombol "Buku kas" | Ada kalimat bahwa kolom Dicatat di paling kanan berisi waktu catatan diketik, memakai jam HP |
| 7 | Menu > Cadangan dan ekspor, lihat daftar salinan pengaman. Bila daftar kosong, lewati langkah ini. | Jam ditulis dengan titik, misalnya "pukul 09.05", bukan "09:05" |
| 8 | Syarat awal: perlu periode aktif dengan pertemuan terbuka yang belum punya tuan rumah; bila tidak ada, lewati langkah ini. Buka Jadwal; buka juga layar Pembayaran. Lalu Pilih tuan rumah di pertemuan itu | Pertemuan terbuka yang belum punya tuan rumah berlabel "(perkiraan)" di KEDUA layar; setelah tuan rumah dipilih, label hilang di kedua layar |
| 9 | Tab Laporan, bagian "Perkiraan kas"; lalu Menu > Istilah | Subjudul "Jumlah kas bila semua tunggakan dilunasi dan semua titipan anggota dikembalikan."; Istilah memuat "Jumlah kas bila semua tunggakan dilunasi dan semua titipan dikembalikan. Rumus: Total kas + tunggakan iuran - titipan anggota." |
