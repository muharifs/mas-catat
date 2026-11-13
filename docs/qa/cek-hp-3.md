# Cek HP ke-3: naskah skenario (disusun qa-tester, 2026-11-09)

Pakai Expo Go dan data contoh saja. Angka dihitung tangan dari aturan CLAUDE.md dan dibuktikan dengan tes otomatis (sql.js).

## Persiapan (sekali)
1. Menu > Cadangan dan ekspor > "Mulai dari nol". Langkah ini menimpa SEMUA data (salinan pengaman dibuat otomatis), jadi pakai hanya untuk data contoh.
2. Jangan catat pinjaman dan saldo awal. Peringatan "kas kurang" boleh muncul dan tidak menghalangi.
3. Menu > Anggota: tambah Ani, Budi, Citra, Dedi, Eka.
4. Buat periode "QA Satu" dengan kelima anggota. Tanggal pembayaran dan tanggal lain pakai hari ini, KECUALI "Tanggal pertemuan 1": ubah ke hari Selasa yang sudah lewat (misalnya Selasa minggu lalu). Bawaannya adalah Selasa terdekat pada atau setelah hari ini, yang bisa jatuh di masa depan. Tanggal pertemuan 1 juga menjadi tanggal mulai periode, dan "Akhiri periode" (B17) menolak tanggal berakhir sebelum tanggal mulai atau setelah hari ini (pesan: "Tanggal berakhir tidak boleh sebelum tanggal mulai periode."). Kalau periode mulai di masa depan, tidak ada tanggal berakhir yang sah.
   - Tanggal pertemuan 2 sampai 5 boleh dibiarkan bawaan (Selasa berikutnya, boleh di masa depan). Kolom tanggal pertemuan memang tidak terkunci untuk hari yang akan datang, jadi B12a ("Ubah tanggal") tidak terpengaruh.
   - Pembayaran tetap bertanggal hari ini, jadi kalender tetap mengunci hari depan untuk kolom pembayaran dan tanggal berakhir.
   - Catatan akhir bulan: kalau Selasa yang dipilih jatuh di bulan sebelumnya, tanggal pertemuan (dan pembayaran tuan rumah, bila memakai tanggal pertemuan) bisa masuk bulan lalu, sehingga angka "Bulan ini" di Beranda dan Riwayat terbagi dua bulan. Pembayaran anggota bertanggal hari ini tetap di bulan ini. Kalau angka "Bulan ini" tidak cocok, geser dengan panah bulan di Riwayat dan jumlahkan kedua bulan; totalnya harus tetap sama. Paling mudah: pilih Selasa yang masih di bulan yang sama dengan hari ini.

### Catatan untuk putaran yang sedang berjalan (2026-11-12)
Data "QA Satu" milik pemilik dibuat pada Rabu 2026-11-11 dengan tanggal mulai 2026-11-17, jadi B17 ditolak. Tidak perlu mengulang dari awal: lanjutkan B17 dan "Cek angka akhir" pada atau setelah tanggal mulai periode yang tertera di Menu > Periode ("mulai ..."). Pada hari itu tanggal berakhir hari ini sah. Semua angka B1-B16 sudah cocok dan tidak berubah.

Setiap pertemuan: iuran 15.000 x 5 = 75.000, tuan rumah menerima 50.000, kas naik 25.000 kalau semua lunas.

## Skenario A: bayar beberapa pertemuan sekaligus, lalu jadi tuan rumah

### Pertemuan 1 (tuan rumah: Ani)
| Langkah | Catat | Yang harus tampak |
|---|---|---|
| A1 | Ani bayar 15.000, Budi bayar 45.000, Citra bayar 15.000 | Budi: pertemuan 1-3 lunas |
| A2 | Dedi bayar 75.000 | Dedi lunas semua |
| A3 | Dedi bayar lagi 15.000 | Muncul peringatan "Sebagian menjadi titipan - Rp15.000". Simpan |
| A4 | Eka tidak bayar | Eka belum bayar |
| A5 | Bayar tuan rumah: Ani | 50.000, tanpa potongan. Tunai **115.000** |
| A6 | Tutup pertemuan 1 | |

### Pertemuan 2 (tuan rumah: Budi)
| Langkah | Catat | Yang harus tampak |
|---|---|---|
| A7 | Tentukan tuan rumah Budi, lalu Ani bayar 15.000 | |
| A8 | Bayar tuan rumah: Budi | 50.000, tanpa potongan. Tunai **80.000** |
| A9 | Tutup pertemuan 2 | |

### Pertemuan 3 (tuan rumah: Citra)
| Langkah | Catat | Yang harus tampak |
|---|---|---|
| A10 | Tentukan tuan rumah Citra, lalu Ani bayar 15.000 | |
| A11 | Buka pratinjau "Bayar tuan rumah" Citra | Payout 50.000, potongan **30.000** (pertemuan 2 dan 3), kas keluar bersih 20.000 |
| A12 | Simpan, lalu tutup pertemuan 3 | Di Riwayat ada dua entri terpisah (payout 50.000 dan potongan 30.000). Tunai **75.000** |

### Cek angka setelah A12
| Layar | Angka yang diharapkan |
|---|---|
| Beranda "Bulan ini" dan ringkasan di Riwayat | Pemasukan **225.000**, Pengeluaran **150.000** |
| Laporan > Saldo kas | Tunai 75.000. Kas seharusnya: 75.000 + tunggakan 105.000 - titipan 15.000 = **165.000** |
| Laporan > periode QA Satu | Total iuran 375.000, Terkumpul 195.000, Pembayaran tuan rumah 150.000, Potongan 30.000, Perubahan kas bersih 75.000 |
| Laporan > Pertemuan 3 | Dibayar anggota 45.000, Iuran dilunasi lewat potongan 15.000, Belum dibayar 15.000 (Eka), Dipotong dari bayaran tuan rumah ini 30.000 |
| Laporan > Pertemuan 2 | Iuran dilunasi lewat potongan 15.000, Dipotong dari bayaran tuan rumah ini 0 (normal: pertemuan 2 dilunasi dari bayaran pertemuan 3) |

## Skenario B: tuan rumah menunggak (lanjutan periode yang sama)

### Pertemuan 4 (tuan rumah: Eka, belum bayar sama sekali, tunggakan 60.000)
| Langkah | Catat | Yang harus tampak |
|---|---|---|
| B1 | Tentukan tuan rumah Eka, lalu Ani bayar 15.000 | |
| B2 | Buka pratinjau "Bayar tuan rumah" Eka | Payout 50.000, potongan **50.000** (dibatasi sebesar payout), kas keluar bersih 0, sisa utang **10.000** |
| B3 | Simpan, lalu tutup pertemuan 4 | Tunai **90.000** |
| B4 | Eka bayar 15.000 | Pertemuan 4 lunas, pertemuan 5 kurang 10.000. Tunai **105.000** |
| B5 | Coba bayar Eka 10.000 | Ditolak (harus kelipatan Rp15.000) |

### Pertemuan 5 (tuan rumah: Dedi, dengan koreksi)
| Langkah | Catat | Yang harus tampak |
|---|---|---|
| B6 | Tentukan tuan rumah Dedi | |
| B7 | Koreksi pembayaran Dedi yang 75.000 (alasan "salah catat") | Tunai **30.000**. Dedi menunggak 75.000 dan punya titipan 15.000 (titipan tidak otomatis menutup tunggakan, lihat R1) |
| B8 | Ani bayar 15.000 | Tunai **45.000** |
| B9 | Bayar tuan rumah Dedi, **jangan tutup pertemuan 5 dulu** | Dipotong dari bayaran tuan rumah ini **50.000**, sisa utang 25.000. Tunai tetap **45.000** |
| B10 | Buka Periode > Jadwal, lihat Pertemuan 5 (F1) | Tombol "Ubah" tidak ada, tetapi tombol "Ubah tanggal" ada. Tampil tulisan "Tuan rumah sudah dibayar. Koreksi pembayarannya dulu untuk mengganti tuan rumah." Tombol "Lihat pembayaran tuan rumah" ada (tidak ada baris terpisah "Pembayaran tuan rumah: sudah dibayar") |
| B11 | Koreksi pembayaran tuan rumah pertemuan **5** (alasan "uji ganti tuan rumah"), lalu lihat Jadwal lagi (F1) | Payout dan potongan dibatalkan bersama. Tunai tetap **45.000**. Tombol "Ubah" muncul lagi di Pertemuan 5 dan layarnya terbuka normal (tekan Batal, jangan ganti tuan rumah) |
| B12 | Bayar tuan rumah Dedi lagi, **jangan tutup pertemuan 5 dulu** | Dipotong dari bayaran tuan rumah ini **50.000**, sisa utang 25.000. Tunai tetap **45.000** |
| B12a | Setelah tuan rumah dibayar, tekan "Ubah tanggal" (di Jadwal, lalu di layar Pertemuan 5), pilih tanggal lain dan simpan | Hanya tanggal yang berubah; angka tidak berubah. Tuan rumah terkunci (tetap Dedi), Tunai tetap **45.000**, payout 50.000 dan potongan 50.000 tetap ada di Riwayat. Teks bantu "Tuan rumah sudah dibayar, jadi tidak bisa diganti. Tanggal masih bisa diubah. Uang tidak berubah." terbaca penuh dan tidak terpotong di layar sempit |
| B12b | Tutup pertemuan 5 | Pertemuan 5 tertutup. Tunai tetap **45.000** |
| B13 | Koreksi pembayaran tuan rumah pertemuan **4** (pertemuan 4 sudah tertutup) | Payout dan potongan dibatalkan bersama. Tunai tetap **45.000** |
| B14 | Coba "Akhiri periode" | **Ditolak**, karena tuan rumah pertemuan 4 belum dibayar |
| B15 | Bayar tuan rumah pertemuan 4 lagi | Dipotong dari bayaran tuan rumah ini 50.000. Tunai tetap **45.000** |
| B16 | Buka pra-tutup "Akhiri periode" | Tunggakan 95.000, ditutup dari titipan 15.000, ditanggung kas **80.000** (jenis "Tunggakan ditanggung kas"). Rinciannya: Budi 30.000, Citra 30.000, Dedi 10.000, Eka 10.000 |
| B17 | Akhiri periode | 4 catatan "Tunggakan ditanggung kas" di Riwayat. Saldo kas tidak berubah |

### Cek angka akhir
| Layar | Angka yang diharapkan |
|---|---|
| Beranda "Bulan ini" dan Riwayat | Pemasukan **295.000**, Pengeluaran **250.000** |
| Laporan > Saldo kas | Tunai **45.000**, kas seharusnya juga 45.000 |
| Laporan periode | Terkumpul 165.000, Pembayaran tuan rumah 250.000, Potongan 130.000, Tunggakan ditanggung kas 80.000, Perubahan kas bersih 45.000 |
| Menu > Titipan anggota | Kosong |

## Butir tampilan (H, K1, K2, M, E)
- **Riwayat:** pindah bulan dengan panah. Kalau filter aktif, ringkasan tetap menghitung seluruh bulan.
- **Keypad:** 4, 5, 000 menampilkan Rp45.000. Hapus menghapus satu angka, tekan lama menghapus semua.
- **Kalender:** kalender Android di semua kolom tanggal. Hari yang akan datang terkunci kecuali di kolom tanggal pertemuan.
- **Ikon mata Beranda:** menyembunyikan semua angka saldo. Setelah aplikasi ditutup paksa lalu dibuka lagi, angka masih tersembunyi tanpa sempat muncul.
- **Anggota:**
  - anggota tanpa data bisa dihapus, anggota dengan riwayat diarsipkan;
  - arsip ditolak untuk anggota periode aktif, yang punya pinjaman, atau yang punya titipan;
  - "Aktifkan lagi" mengembalikan anggota;
  - nama anggota yang diarsipkan tidak bisa dipakai lagi.
- **Cadangan lama:** pulihkan sekali cadangan yang dibuat sebelum versi ini (data contoh). Aplikasi harus terbuka normal.
- **Huruf besar:** dengan ukuran huruf HP dibesarkan, tidak ada teks yang terpotong di semua layar.

## Batch E: teks baru (cek di HP, dengan font normal lalu font besar)
Status: teks sudah masuk (commit b3b293c dan a2bc0ae) dan lolos tes otomatis. Tampilan di layar BELUM pernah dilihat di HP. Perbaikan tampilan F1, F2, F3, F6, dan F7 juga masih menunggu tangkapan layar dari pemilik; jangan dianggap selesai.

| # | Buka | Yang harus tampak |
|---|---|---|
| E1 | Menu > Titipan anggota, pilih satu anggota | Kotak kuning berjudul tebal "Tidak bisa dikoreksi" (bukan huruf besar). Tombol lanjut masih terlihat tanpa menggulir jauh. Pada dialog, kalimat terakhir "Pengembalian ini final: tidak bisa dikoreksi atau dibatalkan." |
| E2 | Tautan Catat kas saat belum ada periode (pakai HP uji kosong) | Judul netral "Belum ada periode" (bukan judul merah "Data tidak bisa dibuka") dan tombol "Buat periode". Setelah dibuka, tombol Kembali tidak mengulang halaman prasyarat |
| E3 | Bayar tuan rumah saat Total kas lebih kecil dari uang keluar bersih | Satu peringatan jelas yang menyebut "Total kas (Tunai + Debit)". Dialog menyebut alasannya sendiri, tidak menyuruh melihat layar |
| E4 | Menu > Cadangan dan ekspor | Bagian "Pulihkan data", baris "Pulihkan dari cadangan", dan teks kecil "Mulai dari nol ... ada di halaman yang sama". Catatan QA: kalimat itu bisa terbaca seolah "Mulai dari nol" ada di halaman Cadangan ini, padahal ada di halaman berikutnya. Laporkan jika membingungkan |
| E5 | Cadangan dan ekspor, tombol "Buku kas" | Teks kecil penjelasan kolom Masuk/Keluar (sekitar 4 baris) terbaca penuh, tidak terpotong |
| E6 | Bagikan cadangan, lalu tutup jendela berbagi | Toast "Pastikan cadangan benar-benar terkirim." terbaca penuh |
| E7 | Riwayat, setelah akhiri periode | Jenis "Tunggakan ditanggung kas" dan baris kedua "Tidak mengubah saldo kas" tidak terpotong, ikon dan tanggal tidak terdorong keluar |
| E8 | Akhiri periode (layar pra-tutup) | Teks "Tunggakan ditanggung kas", rincian per anggota "Dipakai dari titipan ..., ditanggung kas ..., sisa titipan ..." membungkus ke baris berikutnya tanpa terpotong; dialog konfirmasi terbaca |
| E9 | Buka satu catatan di Riwayat > tombol Koreksi (kotak koreksi) | Kalimat "Koreksi membatalkan catatan ini. Catatan lama tetap terlihat, ditandai Dikoreksi, dan tidak dihitung." terbaca di atas kolom alasan; kolom alasan dan tombol tidak tertutup keyboard |
| E10 | Laporan, bagian Kas seharusnya | Subtitel "Perkiraan kas bila semua tunggakan dilunasi dan semua titipan anggota dikembalikan." di bawah judul |
| E11 | Rincian pinjaman (dari Riwayat) dan Menu > Pinjaman anggota > satu anggota | Baris "Sudah dikembalikan" (bukan "Sudah dibayar"). Pada font besar, jumlah uang tidak jatuh ke baris berikutnya secara aneh |
| E12 | Menu > grup "Bantuan" > Istilah | Halaman terbuka, 4 kelompok, gulir sampai bawah. Tidak ada kata asing seperti "entri", "pos", "file". Di font besar tidak ada baris yang terlalu sempit |
| E13 | Pinjaman atau Pengeluaran bersama di Catat kas | Contoh isian "DP wisata ke Bali" (bukan "tur") |
| E14 | Periode > Pembayaran dan rincian anggota | Tulisan "Dibayar di muka: ..." (bukan "Bayar di muka") |
| E15 | Pesan galat umum | Sulit dipicu di HP; sudah dites otomatis. Cukup pastikan galat yang sudah dikenal (pulihkan berkas bukan cadangan, arsipkan anggota periode aktif) tetap memakai pesan lama |

Perbaikan tampilan yang masih menunggu tangkapan layar: F1, F2, F3, F6, F7. Kirim tangkapan layar layar yang bersangkutan sebelum dinyatakan selesai.

## Recheck: font Inter + layout (2026-11-13)
Status: dibuat, belum dilihat di HP. Penyebab teks terpotong (Android mengukur teks dengan font bawaan tetapi menggambar dengan font MiSans) diperbaiki dengan font Inter bawaan aplikasi, ditambah perbaikan tata letak baris Jadwal (F1) dan ReminderRow. Inter sekitar 5-8% lebih lebar dari font lama, jadi periksa juga angka besar. Lakukan SETIAP butir di bawah dua kali: sekali dengan ukuran huruf NORMAL, sekali dengan ukuran huruf TERBESAR (Pengaturan HP > Tampilan > Ukuran huruf).

| # | Buka | Yang harus tampak |
|---|---|---|
| R1 | Menu > Komponen (gallery), bagian A dan B | Judul bagian "A. Tombol dan aksi" dan "B. Baris dan daftar" terbaca lengkap. Chip "Hari ini" dan "Bulan ini" lengkap. ReminderRow dengan label aksi panjang: teks memakai lebar penuh, tombol ada di bawah teks |
| R2 | Periode > Jadwal | Tombol ada di bawah teks dan selebar baris. Cek baris dengan satu tombol, baris dengan dua tombol, dan pertemuan yang sudah dibayar. Teks tidak terpotong. Pertemuan yang sudah dibayar di periode aktif TIDAK punya baris "Pembayaran tuan rumah: sudah dibayar", hanya tombol "Lihat pembayaran tuan rumah". Periode yang sudah selesai masih menampilkan baris itu (tanpa tombol) |
| R3 | Beranda | Label "Total kas" lengkap. "Akhiri periode" dan "Catat kas" masing-masing satu baris. Angka besar (hero) dan kisi uang tidak terpotong. Pengingat terbaca penuh |
| R4 | Riwayat | Chip filter "Tuan rumah" dan "Pindah saldo" masing-masing satu baris. Ringkasan bulan terbaca penuh |
| R5 | Menu > Cadangan dan ekspor | Teks bantu CSV "Tunai + Debit ..." membungkus ke baris berikutnya seperti biasa, tidak terpotong |
| R6 | Menu > Cadangan dan ekspor > Pulihkan data | Judul "Salinan pengaman" satu baris. Baris "Pulihkan" tampak bisa ditekan (label tebal berwarna merek dan tanda panah), alurnya tidak berubah. Pada baris tiga tombol tidak ada kata terbelah seperti "pembayar/an" |
| R7 | Menu > Anggota > Anggota terarsip | Tombol "Aktifkan lagi" ada di bawah teks, tidak menekan teks |
| R8 | Semua layar | Judul header dan label tab tebal. Kolom isian: kursor dan teks contoh (placeholder) tidak terpotong. Angka uang rata di kolom |
| R9 | Buka aplikasi dari keadaan tertutup | Layar pembuka (splash) tidak berkedip dengan font sistem sebelum font aplikasi tampil |

Jika masih ada teks yang terpotong, kirim tangkapan layar dan catat layar serta ukuran hurufnya (normal atau terbesar).

Keputusan pemilik (2026-11-13, "oke buang saja"): baris berulang "Pembayaran tuan rumah: sudah dibayar" sudah dihapus dari Jadwal periode aktif; statusnya ada pada tombol "Lihat pembayaran tuan rumah". Pertanyaan terbuka untuk pemilik: pada periode yang sudah selesai baris itu dipertahankan karena tidak ada tombolnya. Beri tahu jika mau dihapus juga.
