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

## Batch E: teks baru (cek di HP, font normal saja, keputusan pemilik 2026-11-13)
Status: teks sudah masuk (commit b3b293c dan a2bc0ae) dan lolos tes otomatis. Tampilan di layar BELUM pernah dilihat di HP. Tangkapan layar sudah diterima 2026-11-13; perbaikan dicek ulang lewat R1-R9 di bawah.

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

Perbaikan tampilan F1, F2, F3, F6, F7: tangkapan layar diterima 2026-11-13, perbaikan dicek lewat R1-R9.

## Recheck: font Inter + layout (2026-11-13)
Status (2026-11-13): R9 dan R3 lolos di HP. R1, R2, R4, R6, R7 menunggu tangkapan layar dengan font NORMAL. R5 dan R8 belum ada hasil yang jelas. Penyebab teks terpotong (Android mengukur teks dengan font bawaan tetapi menggambar dengan font MiSans) diperbaiki dengan font Inter bawaan aplikasi, ditambah perbaikan tata letak baris Jadwal (F1) dan ReminderRow. Keputusan pemilik (2026-11-13, "saya pakai acuan huruf normal saja"): cek HANYA dengan ukuran huruf NORMAL. Putaran ukuran huruf terbesar dibatalkan; butir "font besar" di batch E di atas tidak perlu dilakukan.

| # | Buka | Yang harus tampak |
|---|---|---|
| R1 | Menu > Komponen (gallery), bagian A dan B | Judul bagian "A. Tombol dan aksi" dan "B. Baris dan daftar" terbaca lengkap. Chip "Hari ini" dan "Bulan ini" lengkap. ReminderRow dengan label aksi panjang: teks memakai lebar penuh, tombol ada di bawah teks |
| R2 | Periode > Jadwal | Tombol ada di bawah teks dan selebar baris. Cek baris dengan satu tombol, baris dengan dua tombol, dan pertemuan yang sudah dibayar. Teks tidak terpotong. Pertemuan yang sudah dibayar di periode aktif TIDAK punya baris "Pembayaran tuan rumah: sudah dibayar", hanya tombol "Lihat pembayaran tuan rumah". Periode yang sudah selesai masih menampilkan baris itu (tanpa tombol) |
| R3 (LOLOS 2026-11-13, font normal, dari tangkapan layar pemilik yang ditinjau sesi utama) | Beranda | Label "Total kas" lengkap. "Akhiri periode" dan "Catat kas" masing-masing satu baris (catatan 2026-11-13: saat R3 dinilai, "Catat kas" masih tombol di kartu kas; sekarang tombol itu sudah dibuang, "Catat kas" hanya ubin grid. Susunan kartu kas yang baru dicek di "Cek HP 4"). Angka besar (hero) dan kisi uang tidak terpotong. Pengingat terbaca penuh |
| R4 | Riwayat | Chip filter "Tuan rumah" dan "Pindah saldo" masing-masing satu baris. Ringkasan bulan terbaca penuh |
| R5 | Menu > Cadangan dan ekspor | Teks bantu CSV "Tunai + Debit ..." membungkus ke baris berikutnya seperti biasa, tidak terpotong |
| R6 | Menu > Cadangan dan ekspor > Pulihkan data | Judul "Salinan pengaman" satu baris. Baris "Pulihkan" tampak bisa ditekan (label tebal berwarna merek dan tanda panah), alurnya tidak berubah. Pada baris tiga tombol tidak ada kata terbelah seperti "pembayar/an" |
| R7 | Menu > Anggota > Anggota terarsip | Tombol "Aktifkan lagi" ada di bawah teks, tidak menekan teks |
| R8 | Semua layar | Judul header dan label tab tebal. Kolom isian: kursor dan teks contoh (placeholder) tidak terpotong. Angka uang rata di kolom |
| R9 (LOLOS 2026-11-13, pemilik: "di r9 aman") | Buka aplikasi dari keadaan tertutup | Layar pembuka (splash) tidak berkedip dengan font sistem sebelum font aplikasi tampil |

Jika masih ada teks yang terpotong, kirim tangkapan layar dan catat layarnya (ukuran huruf NORMAL saja).

Menunggu tangkapan layar font normal: R1, R2, R4, R6, R7.

Catatan: R1, R2, R4, R6, R7 di atas dicakup oleh daftar gabungan di bagian paling bawah file ini (lihat kolom "Mencakup").

Keputusan pemilik (2026-11-13, "oke buang saja"): baris berulang "Pembayaran tuan rumah: sudah dibayar" sudah dihapus dari Jadwal periode aktif; statusnya ada pada tombol "Lihat pembayaran tuan rumah". Diputuskan pemilik ("oke"): pada periode yang sudah selesai baris itu dipertahankan karena tidak ada tombolnya. Beri tahu jika mau dihapus juga.

## Cek HP gabungan (sekali jalan, font NORMAL saja, 2026-11-13)
Satu putaran untuk R1, R2, R4, R6, R7 yang masih menunggu, ditambah 8 perbaikan desain yang baru dibangun (belum di-commit, belum pernah dilihat di HP). Nomor di kolom "Mencakup" adalah nomor R lama di bagian "Recheck" di atas. Catatan: "R2" lama = Jadwal, tidak sama dengan baris filter Riwayat di bawah.

| # | Buka | Yang harus tampak | Mencakup |
|---|---|---|---|
| H1 | Buka tiap layar yang dibuka dengan tombol (bukan tab): detail anggota, detail periode, Jadwal, Catat kas, Bayar, Pinjaman anggota, Cadangan, Pulihkan, Anggota terarsip, dan lainnya | Setiap layar punya judul berbahasa Indonesia di header. Judul panjang tidak terpotong di sebelah panah kembali. Catatan: judul ganda pada Bayar dan detail periode belum dibereskan, jangan dihitung gagal | G1 |
| H2 | Riwayat, Beranda, dan tempat lain yang menampilkan uang negatif (juga galeri komponen: Menu, tekan lama "Versi 1.0.0") | Tanda minus rapat dengan "Rp" dan setinggi tanda "+" (ambil tangkapan layar; penyebab minus terpisah masih dugaan). Dengan TalkBack aktif, angka negatif dibaca "minus" dan positif dibaca "plus" | G2 |
| H3 | Riwayat, baris filter | Tombol "Filter (n)" dan chip muat satu baris. "Hapus filter" muncul HANYA saat ada filter aktif dan menghapusnya saat ditekan. Chip "Tuan rumah" dan "Pindah saldo" masing-masing satu baris, ringkasan bulan terbaca penuh | R4 (lama), R2 (baru, audit) |
| H4 | Beranda dan Riwayat, baris yang sudah dikoreksi | Lingkaran ikon putih dan lencana "Dikoreksi" terlihat jelas di kedua layar | R1 (baru, audit) |
| H5 | Kas > Catat kas, dengan daftar anggota panjang | Jumlah tampil di atas keypad. Saat keyboard catatan terbuka, blok jumlah hilang, saat tertutup muncul lagi tanpa melompat. Ingat: saat keyboard catatan terbuka, jumlah dan pesan salahnya tidak terlihat, pastikan ini nyaman | C1 |
| H6 (kotak "Bulan ini" sudah diganti pil "Pengeluaran", lihat Cek HP 4; cek bagian Beranda lewat pil itu) | Beranda: tekan dan tahan pil "Pengeluaran" (dulu kotak "Bulan ini"). Riwayat: tekan dan tahan satu baris riwayat | Warna tekan "Bulan ini" dan baris datar tetap di dalam kartu, tidak meluber ke tepi | B1 |
| H7 | Beranda > Pengingat dengan 2 pengingat atau lebih | Jarak garis pemisah antar pengingat rapi, tidak terlalu rapat atau renggang | B4 |
| H8 | Menu > Anggota > ubah nama anggota (mode rename) | Label kolom "Nama anggota" | Ag1 |
| H9 | Periode > Jadwal: baris dengan satu tombol, dua tombol, dan pertemuan yang sudah dibayar | Tombol di bawah teks dan selebar baris, teks tidak terpotong. Periode aktif: pertemuan terbayar tidak punya baris "Pembayaran tuan rumah: sudah dibayar", hanya tombol "Lihat pembayaran tuan rumah". Periode selesai: baris itu masih ada tanpa tombol | R2 (lama) |
| H10 | Galeri komponen (Menu, tekan lama "Versi 1.0.0"), bagian A dan B | Judul "A. Tombol dan aksi" dan "B. Baris dan daftar" lengkap. Chip "Hari ini" dan "Bulan ini" lengkap. ReminderRow dengan label panjang: teks lebar penuh, tombol di bawah teks | R1 (lama) |
| H11 | Menu > Cadangan dan ekspor > Pulihkan data | Judul "Salinan pengaman" satu baris. Baris "Pulihkan" tampak bisa ditekan (label tebal warna merek, tanda panah), alur tidak berubah. Pada baris tiga tombol tidak ada kata terbelah seperti "pembayar/an" | R6 (lama) |
| H12 | Menu > Anggota > Anggota terarsip | Tombol "Aktifkan lagi" di bawah teks, tidak menekan teks | R7 (lama) |
| H13 | Layar utama (Beranda, Riwayat, Catat kas, Menu) di layar kecil 360dp bila memungkinkan (atau pengaturan ukuran layar terkecil) | Tidak ada teks terpotong atau tombol keluar layar, termasuk header dengan judul baru dan baris Filter | G1, H3, H5 |

Hasil dicatat per baris (lolos, gagal, tangkapan layar). R5 dan R8 lama tidak ikut daftar ini.

## Cek HP 4: keputusan desain 2026-11-13 (font NORMAL saja)
Untuk perubahan kartu kas Beranda, "Akhiri periode", nama "Pembayaran", dan kata baru (PROJECT.md keputusan 27). Belum di-commit dan belum pernah dilihat di HP. Spesifikasi: `docs/specs/design-decisions-2026-11-13.md` bagian 9. Perlu bantuan data: periode aktif dengan catatan kas bulan ini; untuk C7 semua pertemuan sudah ditutup (pakai data QA Satu bila ada). Catatan: ukuran lebar adalah hitungan dari kode, bukan hasil ukur; mohon tangkapan layar bila ada yang janggal. Bila punya HP atau pengaturan layar 360dp, cek C1, C2, C6 di sana juga.

| # | Buka | Yang harus tampak |
|---|---|---|
| C1 | Beranda, kartu kas, dengan angka Total kas besar (mis. Rp100.000.000 bila bisa) | Angka tidak terpotong. Tombol mata ada tepat di kanan angka, di dalam kartu. Mata bisa ditekan dengan satu tangan (kotak sentuh cukup besar). Tombol "Catat kas" TIDAK ada di kartu; "Pindah saldo" ada di baris Total kas, di kanan mata, sejajar (keputusan pemilik 2026-11-13; angka boleh mengecil, catat ukurannya dan apakah ada yang terpotong) |
| C2 | Beranda, angka Total kas | "Rp" lebih kecil dari digit, sejajar garis dasar yang sama (tidak melayang atau turun). Untuk saldo negatif: tanda minus rapat dengan "Rp". Bila angka panjang menyusut, "Rp" ikut menyusut bersama digit |
| C3 | Beranda, tekan mata (sembunyikan lalu tampilkan) | Saat disembunyikan, Total kas, Tunai, Debit, dan pil Pengeluaran jadi titik-titik. Bentuk titik Total kas sama dengan angka (tata letak tidak melompat). Mata tetap di tempat yang sama |
| C4 | Beranda, TalkBack aktif, sentuh Total kas lalu mata | Total kas dibaca SEKALI sebagai jumlah penuh ("Rp..."), bukan "Rp" lalu angka. Saat disembunyikan dibaca "Saldo disembunyikan". Mata dibaca "Sembunyikan saldo" atau "Tampilkan saldo" |
| C5 | Beranda, pil "Pengeluaran" di bawah Tunai dan Debit | Tampil satu pil "Pengeluaran Rp..." (tanpa blok Pemasukan, tanpa pil Piutang dan Titipan). TalkBack membaca "Pengeluaran bulan ini Rp...". Ditekan: Riwayat terbuka pada bulan ini. Saat mata menutup, jumlah tersamar tetapi pil masih bisa ditekan. Ubin "Pinjaman" dan "Titipan" di grid masih membuka layarnya |
| C6 | Beranda, grid ubin | Ubin bernama "Pembayaran" (bukan "Iuran"), kata tidak terpotong di tengah. Tombol di kartu periode juga "Pembayaran" (bukan "Catat pembayaran"). Ditekan: daftar pembayaran anggota terbuka |
| C7 | Beranda saat semua pertemuan sudah ditutup | "Akhiri periode" muncul SEKALI, merah outline (bukan teal penuh) di kartu periode. Tidak ada baris Pengingat "Semua pertemuan sudah ditutup" dan tidak ada tulisan "Semua beres" bersamaan dengan kartu itu. Jadwal: tombol "Akhiri periode" juga merah outline. Layar akhir periode: tombol terakhir juga merah outline (jawaban pemilik A4, 2026-11-13) |
| C8 | Menu, saat cadangan terlambat | Baris Cadangan dan ekspor menampilkan titik merah dan kata "Terlambat". Label tidak terpotong (boleh dua baris). TalkBack membaca satu kalimat "Cadangan dan ekspor. Cadangan terlambat" |
| C9 | Cadangan dan ekspor > Pulihkan data, pilih berkas sampai tahap ketik frasa | Selama kolom frasa kosong atau salah, tombol nonaktif dan di bawahnya tertulis "Ketik PULIHKAN dulu." (atau "Ketik HAPUS SEMUA dulu." untuk Mulai dari nol). Setelah frasa benar, tulisan hilang dan tombol aktif |
| C10 | Riwayat dan Jadwal (juga baris "Terakhir" di Beranda), TalkBack aktif | Pemisah di baris kedua berupa "·" (mis. "Dedi · Masuk ke Tunai", "Pertemuan 1 · 20 Nov"). Titik tidak ada di awal baris. TalkBack membaca pemisah dengan wajar atau melewatinya; catat bagaimana bunyinya |
| C11 | Riwayat, kartu ringkasan bulan; lalu pilih satu filter | Satu baris pendek "Hanya uang masuk dan keluar dari Tunai dan Debit." dengan tautan "Selengkapnya" di kanan, muat satu baris. Ditekan: dialog "Ringkasan bulan ini" berisi teks lengkap, tombol "Tutup". Setelah memilih filter: baris "Filter aktif (n)" muncul di kiri "Hapus filter" |
| C12 | Menu > Cadangan dan ekspor, layar awal; lalu tekan "Buat dan bagikan cadangan" | Di layar hanya SATU Notice kuning sebelum tombol (tanpa dua teks kecil tambahan). Dialog konfirmasi tetap memuat ketiga teks: peringatan, simpan di luar HP, dan tanpa enkripsi |

Tambahan kecil: Langkah awal (bila masih tampil), TalkBack: tiap baris dibaca "Langkah n: ..., selesai" atau "..., belum" tanpa menyebut tanda centang. Pembayaran: di daftar pembayaran, teks bantu pembayaran kedua menyebut "Catat pembayaran" lewat halaman anggota; form Catat pembayaran tidak punya judul ganda.

Hasil dicatat per baris (lolos, gagal, tangkapan layar).

## Cek HP 5: batch audit "worth-it" (font NORMAL saja)
Hanya yang tidak bisa dibuktikan tes. Belum di-commit dan belum pernah dilihat di HP. Cek HP 1-4 sudah lolos menurut pemilik (2026-11-13). Spesifikasi: `docs/specs/design-decisions-2026-11-13.md`. Perlu bantuan data: periode aktif dengan satu pertemuan sudah ditutup dan dibayar, satu pertemuan berjalan, dan satu pinjaman besar.

| # | Buka | Yang harus tampak |
|---|---|---|
| D1 | Beranda, Laporan, Jadwal, Anggota | Jarak judul bagian dan panahnya rapi, tidak terlalu rapat atau renggang |
| D2 | Beranda, kartu pertemuan | Baris aksi punya panah. Ada jarak yang cukup sebelum tombol "Tutup pertemuan" |
| D3 | Riwayat, baris chip | Chip meluncur sampai tepi kanan layar, tidak berhenti di tengah |
| D4 | Riwayat, TalkBack aktif, sentuh satu baris | Dibaca berurutan: judul, anggota, arah, jumlah, dan "Dikoreksi" bila ada. Ikon tidak dibaca sendiri |
| D5 | Periode > Jadwal, pertemuan tertutup dan sudah dibayar | Seluruh kartu bisa diketuk dan membuka pembayaran tuan rumah. Ada panah. Tidak ada tombol "Lihat pembayaran tuan rumah" |
| D6 | Periode > Jadwal, pertemuan berjalan | Hanya garis kiri 4dp yang menandai pertemuan berjalan, terlihat jelas. Lencana Terbuka dan Ditutup tampil |
| D7 | Menu > Cadangan dan ekspor, gulir ke tombol CSV | Notice sibuk atau galat tetap terlihat saat menggulir. Bila sulit dipicu, catat saja |
| D8 | Menu > Cadangan dan ekspor > Pulihkan data, sampai ada kartu pembanding; di 320 dan 360 dp bila ada | Satu kartu pembanding, teks tidak terpotong dan tidak keluar layar |
| D9 | Pinjaman dan Laporan > periode, baris dengan jumlah besar | Jumlah tidak terdorong atau terpotong oleh panah |
| D10 | Menu > Anggota > ubah anggota | Zona hapus dipisah garis, baris ubah punya sudut membulat yang rapi |
| D11 | Kas > Catat kas, pilih pindah saldo Debit ke Tunai | Ikon berbeda dari Tunai ke Debit (panah balik) |
| D12 | Menu, tekan lama "Versi 1.0.0" (galeri komponen) | Galeri tampil benar, semua 27 komponen terlihat tanpa teks terpotong |

Tambahan kecil: Laporan tidak lagi punya tombol "Buka periode", hanya daftar. Ini perubahan sengaja (L2).

Hasil dicatat per baris (lolos, gagal, tangkapan layar).
