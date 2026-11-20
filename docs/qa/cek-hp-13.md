# Cek HP ke-13: "Dicatat <jam>" di catatan transaksi

Pakai Expo Go dan DATA CONTOH saja. Jangan pakai data uang sungguhan.
Fitur ini hanya menampilkan jam catat (dari waktu HP saat Anda mengetik). Tidak ada jumlah uang, saldo, tanggal transaksi, atau urutan daftar yang boleh berubah.
Aturan baca: "Dicatat 19.42" = dicatat hari yang sama dengan tanggal transaksi. "Dicatat 18 Nov, 19.42" = dicatat di hari lain (tahun ikut tampil bila beda tahun dari tanggal transaksi).

## Persiapan
1. Menu > Cadangan dan ekspor > "Mulai dari nol" (data contoh saja). Tambah anggota Ani, Budi, Citra.
2. Buat periode "Jam Satu" dengan ketiganya. Pertemuan 1: tuan rumah Ani.
3. Catat di kertas: tanggal HARI INI (dari HP) dan jam HP sekarang. Pastikan jam HP otomatis (Pengaturan > Tanggal dan waktu > otomatis).
4. Siapkan data berikut (catat jam tiap langkah di kertas, menit saja cukup):
   - A. Pembayaran Budi 15.000, tanggal HARI INI.
   - B. Pembayaran Citra 15.000, tanggal KEMARIN (catat mundur).
   - C. Catatan kas Pengeluaran 10.000 "Tes tengah malam", tanggal HARI INI, dibuat SETELAH lewat tengah malam (lihat langkah 12). Bila tidak bisa menunggu, ganti jam HP manual ke 00.05 lalu kembalikan ke otomatis (catat ini di laporan).
   - D. Koreksi pembayaran A dengan alasan "salah orang", lalu catat ulang.
   - E. Bayar tuan rumah Ani, tanggal hari ini.
   - F. Pinjaman Budi 20.000, lalu pengembalian 5.000.
   - G. Cek kas pertemuan 1 (hitung Tunai dan Debit, simpan).

## Langkah
| No | Lakukan | Yang harus tampak |
|---|---|---|
| 1 | Tab Riwayat. Cari catatan A | Baris ketiga abu-abu "Dicatat HH.MM" (jam sesuai catatan Anda, dua digit, titik, 24 jam). Tanpa "WIB". Berada di bawah "Anggota . Masuk ke Tunai", di atas catatan/badge |
| 2 | Cari catatan B (tanggal kemarin, dicatat hari ini) | "Dicatat <tgl hari ini> <bln>, HH.MM" (contoh "Dicatat 17 Nov, 19.42"), tanpa tahun. Header hari di daftar tetap KEMARIN |
| 3 | Ketuk catatan A. Lihat baris "Dicatat pada" | Tanggal penuh + jam: "17 Nov 2026, 19.42". Baris "Tanggal" di atasnya tetap tanggal transaksi |
| 4 | Ketuk catatan B | "Tanggal" = kemarin, "Dicatat pada" = hari ini + jam. Keduanya BEDA |
| 5 | Di rincian catatan D (yang dikoreksi): lihat bagian riwayat koreksi | "Catatan asli" dan "Koreksi" masing-masing punya baris "Dicatat ..." sendiri; jam koreksi sama atau lebih akhir dari catatan asli |
| 6 | Beranda, kartu "Terakhir" | Tiga baris, tiap baris ada "Dicatat ...". CATAT: catatan B (tanggal mundur) mungkin TIDAK muncul di kartu ini walau baru dicatat, karena daftar urut menurut tanggal. Itu perilaku lama (bukan gagal), laporkan apa adanya |
| 7 | Periode > Anggota > Budi (rincian di periode): bagian "Riwayat pembayaran" | Di bawah "tgl . Rp15.000" ada baris abu-abu "Dicatat ...". Pembayaran yang dikoreksi (D) juga punya baris itu, judulnya tetap tercoret |
| 8 | Periode > Bayar tuan rumah (pertemuan 1), blok "Sudah dibayar" | Setelah "Tanggal ..., dari Tunai" ada baris "Dicatat HH.MM" |
| 9 | Menu > Pinjaman > Budi | Tiap baris (pinjaman dan pengembalian) punya "Dicatat ..." di bawah tanggal, sebelum catatan dan "Dikoreksi" |
| 10 | Laporan > periode "Jam Satu" > Budi (riwayat anggota), bagian Riwayat dan Piutang | Pembayaran dan pinjaman punya baris "Dicatat ...". Kejadian dari titipan atau carry over (bila ada) TIDAK punya baris itu |
| 11 | Periode > Cek kas (riwayat) | Kartu pertemuan 1: tanggal hitung, lalu baris "Dicatat HH.MM" dari simpan TERAKHIR. Lakukan hitung ulang 1 kali (jam beda), kartu menunjukkan jam hitungan terbaru |
| 12 | Tunggu lewat jam 00.00 HP (atau ubah jam HP manual ke 00.05). Catat C: tanggal HARI INI (tanggal yang sama dengan sebelum tengah malam bila HP belum ganti hari, bila sudah ganti hari pilih tanggal yang sama dengan tanggal sekarang) | Bila tanggal transaksi = tanggal HP sekarang: "Dicatat 00.05". Bila tanggal transaksi = KEMARIN: "Dicatat <hari ini> <bln>, 00.05" (hari BARU, bukan hari lama). Jam tidak pernah tampil "24.05" atau "12.05" |
| 13 | Catatan lama: pulihkan dari cadangan lama (atau pakai catatan yang dibuat sebelum fitur ini, bila ada data lama di HP). Buka Riwayat dan rincian | Catatan lama menampilkan jam masuk akal (bukan 07.00 atau 00.00 yang sama untuk semua). Tidak ada baris "Dicatat -", "Invalid Date", atau "NaN". Bila ada catatan yang jamnya tidak bisa dibaca: barisnya hilang, layar tidak error |
| 14 | Urutan: bandingkan urutan baris Riwayat dengan catatan Anda (sebelum fitur: tanggal terbaru di atas, dalam satu hari yang terakhir dicatat di atas) | Urutan SAMA dengan sebelum fitur. Jam tidak menggeser baris |
| 15 | Bandingkan semua angka (saldo Tunai, Debit, Piutang, jumlah tiap baris, total pembayaran Budi) dengan sebelum membuka fitur | Tidak ada angka berubah |
| 16 | Pengaturan HP > Ukuran huruf terbesar (dan ukuran tampilan besar). Buka Riwayat, rincian catatan B, riwayat koreksi, Pinjaman, Laporan anggota | "Dicatat 17 Nov, 19.42" boleh turun baris tapi tidak terpotong. Baris tidak tumpang tindih dengan badge "Dikoreksi" atau jumlah uang |
| 17 | Layar sempit: putar HP ke samping atau pakai HP kecil/layar split. Buka Riwayat dan rincian | Teks utuh, jumlah uang tetap terbaca di kanan |
| 18 | Nyalakan TalkBack, sentuh baris Riwayat catatan A | Satu kalimat, contoh: "Iuran, Budi, Masuk ke Tunai, Rp15.000, Dicatat 19.42". Untuk catatan B: "... Dicatat 17 Nov, 19.42" (bukan "Dicatat 17 Nov koma 19.42" terbaca janggal; catat bila terdengar aneh). Catatan yang dikoreksi: "Dikoreksi" ada SETELAH "Dicatat" |
| 19 | TalkBack di rincian catatan | Baris "Dicatat pada" terbaca bersama nilainya ("Dicatat pada, 17 Nov 2026, 19.42") |
| 20 | Ubah zona waktu HP (misal ke WITA, GMT+8) lalu buka catatan A | Jam bergeser +1 dari sebelumnya; ini wajar (jam mengikuti zona HP). Kembalikan zona waktu. Jika tanggal catat bergeser, label beda hari ikut berubah sesuai |
| 21 | Ekspor CSV Buku kas, buka isinya | Tidak ada kolom baru; kolom dan jumlah sama seperti sebelumnya (kolom jam catat belum diminta) |

## Yang dilaporkan pemilik
Satu baris per kelompok (1-5 Riwayat dan rincian, 6 Beranda, 7-11 layar lain, 12 tengah malam, 13 catatan lama, 14-15 urutan dan angka, 16-17 huruf besar dan layar sempit, 18-19 TalkBack, 20-21 zona waktu dan CSV): lolos atau tidak. Tambahkan pendapat: apakah baris "Dicatat" membuat Riwayat terlalu sesak, dan apakah catatan mundur (langkah 2) mudah dikenali.
