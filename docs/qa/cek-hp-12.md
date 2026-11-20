# Cek HP ke-12: Kartu status pertemuan di layar Pembayaran

Pakai Expo Go dan DATA CONTOH saja. Jangan pakai data uang sungguhan.
Kartu ini hanya menampilkan data. Tidak ada tanggal, tuan rumah, atau saldo yang boleh berubah karena layar Pembayaran dibuka.

## Persiapan
1. Menu > Cadangan dan ekspor > "Mulai dari nol" (data contoh saja). Tambah anggota Ani, Budi, Citra.
2. Buat periode "Status Satu" dengan ketiganya. Pertemuan 1: tuan rumah Ani, tanggal Selasa. JANGAN pilih tuan rumah pertemuan 2 dulu.
3. Buka Jadwal periode, catat tanggal tiap pertemuan di kertas (acuan langkah 14).

## Langkah
| No | Lakukan | Yang harus tampak |
|---|---|---|
| 1 | Periode > Pembayaran (pertemuan 1 terbuka, tuan rumah Ani) | Di atas daftar ada kartu: "Pertemuan 1 dari 3", badge "Terbuka", "Tuan rumah: Ani", "Tanggal: ..." TANPA "(perkiraan)", "Tunggakan dihitung sampai pertemuan 1." |
| 2 | Tutup pertemuan 1 (bayar tuan rumah Ani bila diminta). Buka Pembayaran lagi | Kartu menunjukkan "Pertemuan 2 dari 3", "Terbuka", "Tuan rumah: Belum ditentukan" (warna lebih pudar), tanggal berakhiran "(perkiraan)" |
| 3 | Jadwal periode: pilih tuan rumah Budi untuk pertemuan 2, kembali ke Pembayaran | "Tuan rumah: Budi"; "(perkiraan)" hilang |
| 4 | Tutup pertemuan 2 dan 3 sampai SEMUA pertemuan ditutup (tuan rumah dipilih dulu; periode belum diakhiri) | Kartu menunjukkan pertemuan TERAKHIR (3 dari 3), badge "Ditutup", tuan rumah dan tanggal tersimpan, tanpa "(perkiraan)" |
| 5 | Periode baru "Status Dua" (Ani, Budi, Citra), tutup pertemuan 1 dan 2 dengan tuan rumah terbayar, lalu Jadwal > "Lewati pertemuan terakhir". Buka Pembayaran | Kartu "Pertemuan 3 dari 3", badge "Dilewati", "Tuan rumah: tidak ada" (nama tuan rumah yang sempat dipilih TIDAK tampil), tanggal tanpa "(perkiraan)". Baris "Pertemuan ... dilewati" yang lama tetap ada di bawah kartu |
| 6 | Batalkan pelewatan (alasan wajib), buka Pembayaran | Kartu kembali "Terbuka"; baris dilewati hilang |
| 7 | Akhiri periode "Status Satu" (Akhiri periode), buka Pembayaran periode itu | Kartu tetap tampil dengan "Periode berakhir. Tunggakan dihitung sampai pertemuan terakhir." (bukan "sampai pertemuan N") |
| 8 | Di periode aktif: geser satu anggota ke kanan untuk bayar 15.000 | Pembayaran tersimpan, toast tampil, kartu tidak berubah selain bila pertemuan ikut berubah. Ulangi untuk anggota yang sama: tertulis "Sudah bayar hari ini", tidak bisa dobel |
| 9 | Periksa petunjuk geser, kotak cari (bila anggota banyak), dan daftar anggota | Petunjuk geser masih ada di tempat semula. Daftar urut nama, tunggakan benar, ketuk anggota membuka rinciannya |
| 10 | Bandingkan "Sudah bayar hari ini" dan jumlah di daftar sebelum dan sesudah kartu muncul | Sama seperti perilaku sebelum fitur ini |
| 11 | Pengaturan HP > Ukuran huruf terbesar (dan ukuran tampilan besar). Buka Pembayaran | Judul, badge, tuan rumah, tanggal, dan kalimat tunggakan tampil utuh (turun baris, tidak terpotong). Badge tidak menimpa judul. Daftar anggota masih bisa digulir dan digeser |
| 12 | Nyalakan TalkBack, sentuh kartu | Satu bacaan utuh, contoh: "Pertemuan 2 dari 3, Terbuka, tuan rumah belum ditentukan, tanggal ... perkiraan. Tunggakan dihitung sampai pertemuan 2." Untuk dilewati: "tidak ada tuan rumah". Bacaan tidak memuat "Ani" saat dilewati |
| 13 | TalkBack masih menyala: geser ke baris anggota | Tiap baris anggota tetap terbaca sendiri dan aksi bayar bisa dipakai seperti sebelumnya |
| 14 | Buka Jadwal periode setelah langkah 1-13 | Semua tanggal pertemuan SAMA dengan catatan di Persiapan 3 (bila tidak ada yang Anda ubah sendiri). Membuka Pembayaran tidak mengubah tanggal apa pun |
| 15 | Bandingkan label "(perkiraan)" di Pembayaran dan Jadwal untuk pertemuan terbuka tanpa tuan rumah | Catat saja apakah keduanya sama (lihat catatan di bawah); bukan tolok ukur lolos atau gagal |

## Catatan untuk pemilik
Di Jadwal, pertemuan yang masih bisa dipilih tuan rumahnya (pertemuan berjalan dan berikutnya) tidak diberi "(perkiraan)" karena ada tombol pilih. Di Pembayaran, kartu memberi "(perkiraan)" pada pertemuan terbuka tanpa tuan rumah. Ini sesuai aturan fitur, tetapi kedua layar bisa tampak berbeda untuk pertemuan yang sama.

## Yang dilaporkan pemilik
Satu baris per kelompok (langkah 1-3 terbuka, 4-6 ditutup dan dilewati, 7 periode selesai, 8-10 geser bayar, 11-13 huruf besar dan TalkBack, 14 Jadwal): lolos atau tidak. Tambahkan pendapat: kartu terlalu tinggi atau tidak, dan apakah perbedaan "(perkiraan)" di langkah 15 membingungkan.
