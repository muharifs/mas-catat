# Tinjauan bahasa antarmuka Mas Catat

Tanggal: 2026-11-12. Pemohon: pemilik. Peninjau: ui-ux-designer (lewat asisten-utama).
Status: usulan. TIDAK ada teks di kode yang diubah. Perubahan baru dikerjakan setelah pemilik menyetujui (lihat bagian 5).

Pertanyaan pemilik: apakah bahasa di aplikasi mudah dipahami dan terdengar profesional?
Jawaban singkat: sebagian besar sudah baik (Indonesia sehari-hari, konsisten untuk Pertemuan, Titipan, Pinjaman, tombol "Batal", format Rp15.000 dan "4 Jan 2026"). Yang masih mengganjal: satu istilah teknis yang tersebar (`pos`), satu kata Inggris (`Payout`), nama untuk uang yang sama berbeda-beda, petunjuk yang menunjuk layar yang tidak ada, pesan galat tanpa langkah berikutnya, dan beberapa kalimat berat yang bisa dipendekkan.

## Dasar dan batas tinjauan

- Dibaca: `CLAUDE.md`, `PROJECT.md` (keputusan 18-19 dan log 2026-11-12), seluruh `src/app/**`, `src/ui/**` (termasuk `errors.ts`, `messages.ts`, `kasLabels.ts`, `reportLabels.ts`, `backupLabels.ts`, `csvFiles.ts`, `reminders.ts`, `checklist.ts`, `quickActions.ts`, komponen), serta teks yang datang dari `src/domain` (`ACCOUNT_LABELS`, `AMOUNT_FORMAT_HINT`, frasa `PULIHKAN` dan `HAPUS SEMUA`).
- Glosarium dasar diambil dari `PROJECT.md` bagian 5 keputusan 19 (hasil commit 3769520). Peninjau tidak dapat menjalankan `git show` di sesi ini, jadi isi commit itu tidak dibuka langsung. Cocokkan bila perlu.
- Nomor baris dari kondisi kerja saat ini. Berkas `periods/new.tsx`, `periods/[id]/index.tsx`, `periods/[id]/meetings/[number].tsx` sedang dikerjakan agent F4: nomor baris di sana bisa bergeser. Peninjau tidak menyentuh kode.
- BELUM dicek di perangkat: tampilan nyata, pembacaan TalkBack, warna Notice "warn" (ada teks yang menyebut "pesan merah", lihat T6), dan apakah teks panjang terpotong di layar kecil atau font besar.

## 1. Ringkasan pola utama

1. Satu istilah teknis tersebar: "pos" (Tunai/Debit/Piutang) muncul di sekitar 15 tempat: label, bantuan, galat, CSV. Pemilik non-teknis dan anggota tidak mengenalnya. Padahal sebagian layar sudah memakai kata yang lebih ramah ("Uang keluar dari", "Pilih tempat uang masuk").
2. Masih ada kata Inggris atau gaya developer: "Payout belum dibayar", "form lengkap", "entri terpisah", "database", "transfer", "file", "enkripsi".
3. Uang yang sama punya beberapa nama: Tunai + Debit disebut "Total kas", "Kas nyata", dan "Kas akhir"; periode yang berhenti disebut "Selesai", "berakhir", "diakhiri"; daftar catatan kas disebut "Riwayat", "daftar kas", "menu Kas", "layar Kas".
4. Petunjuk yang menunjuk tempat yang tidak ada: "layar Kas", "menu Kas", "daftar kas" (sekarang adanya tab Riwayat dan halaman Catat kas).
5. Pesan galat sering menyebut apa yang terjadi tetapi tidak langkah berikutnya, terutama galat umum, galat arsip anggota, dan galat cadangan. Pesan format tanggal "TTTT-BB-HH" menyuruh mengetik, padahal tanggal dipilih dari kalender.
6. Nada belum seragam: "Kalau" dan "Jika" bercampur, "Anda" muncul dua kali di antara teks tanpa kata ganti, "pakai" dan "gunakan" bercampur, judul layar Title Case sedangkan isi sentence case, beberapa kata penekanan HURUF BESAR.
7. Beberapa kalimat bantuan terlalu berat untuk dibaca sekilas (ringkasan Riwayat, petunjuk Tutup pertemuan, rumus Kas seharusnya).
8. Yang sudah baik dan sebaiknya dipertahankan: "Pertemuan" dipakai konsisten; "Titipan" dan "Pinjaman" konsisten; format uang lewat `formatRupiah` seragam; pesan pembayaran kelipatan Rp15.000 jelas; dialog menjelaskan akibat (siapa, berapa, ke mana) dan menyebut tidak bisa dibatalkan; dialog arsip dan hapus anggota jelas; teks cadangan jujur ("Pastikan filenya benar-benar terkirim").

## 2. Usulan pembaruan glosarium

Tambahan dan penegasan (sambungan dari keputusan 19):

| Hal | Istilah baku usulan | Jangan dipakai di layar |
|---|---|---|
| Tunai / Debit / Piutang (kode: `pos`) | "tempat uang" untuk Tunai dan Debit; Piutang disebut "Piutang (dipinjam anggota)". Keputusan D1 | "pos" |
| Catatan di buku kas (kode: entry) | "catatan" | "entri" |
| Daftar semua catatan kas | "Riwayat" (tab) | "daftar kas", "menu Kas", "layar Kas" |
| Formulir tambah catatan kas | "Catat kas" | "menu Kas" |
| Total Tunai + Debit | "Total kas" (satu nama, keputusan D4) | "Kas nyata", "Kas akhir" |
| Tunai ke Debit | "Pindah saldo" | "transfer" |
| Tunggakan | "tunggakan" | "utang", "hutang" |
| Bagian layar | "halaman" | campur "layar", "menu", "halaman" |
| File | "berkas" (keputusan D3); "CSV" tetap | "file" |
| Data dalam aplikasi | "data" | "database" |
| Periode yang berhenti | satu kata untuk status dan aksi (keputusan D5) | campur "Selesai/berakhir/diakhiri" |
| Kata ganti | tanpa kata ganti ("Anda" dihapus) | "Anda" |
| Pengandaian | "Jika" (keputusan D2) | campur "Kalau/Jika" |
| Ajakan | "gunakan" | campur "pakai/gunakan" |
| Uang yang diterima tuan rumah | "bayaran tuan rumah" (sudah) | "payout" |
| Aksi membayar tuan rumah | "pembayaran tuan rumah" (sudah) | |
| Kata penekanan | huruf tebal atau judul Notice, bukan HURUF BESAR (keputusan D8) | |

Judul layar: huruf kapital hanya di awal (sentence case), seperti isi layar (keputusan D7).

### 2.1 Glosarium lengkap untuk pengguna non-teknis (ditambahkan 2026-11-12, atas permintaan pemilik)

Permintaan pemilik: istilah glosarium yang sudah ada dieja dan dijelaskan agar dipahami pengguna non-teknis. Tabel ini memuat semua istilah yang tampil di layar. Semua keputusan D1-D12 dihormati dan tidak dibalik. Hal di luar keputusan itu bertanda **USULAN BARU (butuh pemilik)**. Kode (nama variabel, `pos`, `credit`, `offset`, `writeoff`) tetap bahasa Inggris dan tidak pernah tampil di layar.

Aturan ejaan umum (KBBI dan PUEBI) untuk semua teks layar:
- Uang: `Rp15.000` (R kapital, p kecil, tanpa spasi, titik ribuan, tanpa desimal). Pernah sebagian tempat menulis `15.000` tanpa Rp (lihat R4).
- Tanggal: `4 Jan 2026` di daftar dan baris (singkat, ruang sempit); nama bulan penuh `4 Januari 2026` di kalimat dan dialog. Bulan dan hari ditulis dengan huruf kapital hanya di awal kalimat atau nama bulan (`Selasa`, `Januari`).
- Huruf kapital: hanya awal kalimat, nama orang, nama bulan dan hari, dan nama tombol atau halaman yang dirujuk dalam kalimat (`Catat kas`, `Pindah saldo`, `Riwayat`, `Beranda`, `Menu`). Kata `periode`, `pertemuan`, `anggota`, `kas` dalam kalimat biasa memakai huruf kecil.
- Bentuk baku (jangan diganti bentuk tidak baku): `utang` (bukan `hutang`), `tunggakan`, `lunas`, `berkas`, `ekspor`, `arsip`, `periode`, `aktif`, `ubah`, `izin`. Satuan: `pertemuan`, tanpa `ke-`.
- Kata serapan yang sudah baku dalam KBBI dan boleh dipakai: `kas`, `saldo`, `debit`, `tunai`, `piutang`, `periode`, `ekspor`, `arsip`, `cadangan`, `tur`.
- Tidak tampil di layar: `pos`, `offset`, `write-off`, `payout`, `ledger`, `entry`, `entri`, `database`, `transfer` (kecuali kolom CSV keputusan D10), `file`, `form`.

Kolom "Tindakan": **Tetap** (sudah sesuai), **Ganti** (keputusan yang sudah disetujui, belum semua diterapkan di kode), **USULAN BARU** (butuh pemilik).
Kolom "Penjelasan di": **Bantuan** = kartu atau teks bantuan permanen di halaman itu, **Dialog** = muncul saat konfirmasi, **Kosong** = teks keadaan kosong, **Label** = cukup lewat nama dan teks kedua, tanpa penjelasan.

#### A. Uang dan tempatnya

| Istilah di layar | Padanan sederhana | Penjelasan satu kalimat untuk orang awam | Penjelasan di | Tindakan |
|---|---|---|---|---|
| **Kas** | uang kelompok | Uang milik bersama yang dikelola pengurus, di luar bayaran tuan rumah. | Bantuan (Beranda, ikon info kartu Total kas) | Tetap |
| **Total kas** | uang kas yang sedang dipegang | Jumlah uang kas yang benar-benar ada sekarang, yaitu Tunai ditambah Debit. | Bantuan (Beranda dan Laporan). Satu nama di semua layar (D4) | Ganti: `Kas nyata` dan `Kas akhir` menjadi `Total kas` |
| **Tunai** | uang di tangan | Uang kertas atau koin yang dipegang pengurus. | Label. Penjelasan satu kali di Bantuan | Tetap |
| **Debit** | rekening atau dompet digital | Uang kas di rekening bank atau aplikasi dompet digital. | Label. Bantuan: `Debit = rekening bank atau dompet digital.` | Tetap. Kata `e-wallet` jangan tampil, pakai `dompet digital` |
| **tempat uang** (pengganti `pos`, D1) | tempat uang | Tempat uang kas disimpan: Tunai atau Debit. | Label | Ganti: `pos` menjadi `tempat uang` (T5) |
| **Piutang** | uang yang dipinjam anggota | Uang kas yang sedang dipinjam anggota dan belum dikembalikan; belum ada di tangan. | Label sub: `Piutang (dipinjam anggota)` di semua layar (D9). Bantuan di Pinjaman | Tetap (D9). Tambahkan sub-label |
| **Pindah saldo** | pindah uang antar tempat | Memindahkan uang antara Tunai dan Debit, ke dua arah; Total kas tidak berubah. | Bantuan di formulir (sudah ada di `kas/new.tsx:45`). Tampilkan `Tunai ke Debit`, bukan panah (S14) | Tetap. Hapus panah `->` |
| **Saldo awal** | uang awal | Uang yang sudah ada sebelum aplikasi dipakai, dicatat sekali di awal. | Bantuan di formulir Catat kas. Pada Piutang: `Saldo awal: pinjaman lama` (sudah) | Tetap |
| **Pengeluaran bersama** | uang keluar untuk keperluan bersama | Uang kas yang dipakai untuk tujuan bersama, misalnya tur. | Bantuan di formulir (sudah ada) | Tetap. Contoh `tur` boleh diganti `wisata` agar lebih akrab. USULAN BARU (kecil) |
| **Titipan** (anggota) | uang lebih yang dititipkan | Kelebihan bayar anggota yang disimpan dan dipakai untuk iuran periode berikutnya. | Bantuan di halaman Titipan; dialog bayar (`pay.tsx`) sudah memberi peringatan; Kosong di Titipan | Tetap |
| **Pengembalian titipan anggota** | uang titipan dikembalikan | Titipan dikembalikan ke anggota yang tidak ikut periode berikutnya. | Dialog (sudah ada, menyebut tidak bisa dikoreksi) | Tetap |
| **Pinjaman** / **Pinjaman ke anggota** | pinjaman dari kas | Uang kas yang dipinjamkan ke anggota, tanpa bunga dan tanpa batas waktu. | Bantuan di Pinjaman (sebut tanpa bunga, tanpa batas waktu) | Tetap |
| **Pelunasan pinjaman** | angsuran atau pengembalian pinjaman | Anggota mengembalikan sebagian atau seluruh pinjaman; masuk ke Tunai. | Bantuan di formulir (sudah ada) | Tetap |
| **Sisa pinjaman** | pinjaman yang belum dikembalikan | Pinjaman dikurangi yang sudah dikembalikan, dari semua periode. | Label | Tetap |
| **Kelebihan bayar** (di Pinjaman) | pembayaran lebih dari pinjaman | Catatan lama: pengembalian yang lebih besar dari pinjamannya; tidak bisa diubah dari sini. | Bantuan kecil di barisnya | Tetap |
| **Saldo awal tanpa nama** (di Pinjaman) | piutang lama tanpa nama anggota | Piutang lama yang tidak tercatat atas nama anggota mana pun, jadi tidak bisa dilunasi. | Bantuan kecil di barisnya | Tetap |
| **Kas seharusnya** | perkiraan kas bila semua iuran lunas | Uang kas yang akan ada bila semua tunggakan sudah dibayar dan titipan sudah dikembalikan. Rumus: `Total kas + tunggakan iuran - titipan anggota`. | Bantuan di Laporan (satu kalimat di bawah angka, di atas rumus) | Tetap (D4). USULAN BARU (kecil): tambahkan sub-judul `(bila semua iuran lunas)` agar maknanya terbaca tanpa bantuan |

#### B. Iuran dan tuan rumah

| Istilah di layar | Padanan sederhana | Penjelasan satu kalimat | Penjelasan di | Tindakan |
|---|---|---|---|---|
| **Iuran** | iuran mingguan | Uang Rp15.000 yang dibayar setiap anggota, termasuk tuan rumah, di setiap pertemuan. | Bantuan di Buat periode dan Catat pembayaran | Tetap |
| **Tunggakan** | iuran yang belum dibayar | Iuran pertemuan yang belum dibayar anggota. | Label. Bantuan di dialog bayar tuan rumah | Tetap. Jangan pakai `utang` di layar (S8) |
| **Kelipatan Rp15.000** | pembayaran harus pas | Pembayaran harus Rp15.000, Rp30.000, Rp45.000, dan seterusnya, tidak boleh sebagian. | Pesan galat dan teks bawah kolom jumlah (sudah baik) | Tetap |
| **Pertemuan** | pertemuan mingguan | Satu kali kumpul di rumah tuan rumah; pengganti kata `minggu`. | Label | Tetap |
| **Tuan rumah** | pemilik rumah giliran | Anggota yang rumahnya dipakai untuk pertemuan itu; menerima bayaran tuan rumah. | Label | Tetap |
| **Bayaran tuan rumah** | uang untuk tuan rumah | Uang yang diterima tuan rumah, yaitu Rp10.000 dikali jumlah anggota. | Bantuan di halaman Bayar tuan rumah | Tetap (sudah). Jangan pakai `payout` (T3) |
| **Pembayaran tuan rumah** | membayar tuan rumah | Pencatatan bahwa bayaran sudah diberikan ke tuan rumah. | Label | Tetap. Teks tombol: `Lihat pembayaran tuan rumah` (S12) |
| **Potongan** (`offset` di kode) | iuran dipotong dari bayaran | Tunggakan iuran tuan rumah yang diambil dari bayarannya, sehingga ia menerima lebih sedikit. | Dialog bayar tuan rumah dan Bantuan | Tetap. Lengkapnya: `Dipotong dari bayaran tuan rumah` |
| **Lunas lewat potongan** | lunas lewat potongan | Iuran yang lunas karena dipotong dari bayaran tuan rumah. | Label | Tetap (keputusan 19) |
| **Lunas lewat titipan** | lunas lewat titipan | Iuran yang lunas karena memakai titipan anggota. | Label | Tetap |
| **Baru sebagian** (ganti `Kurang`, S18) | baru sebagian | Iuran pertemuan itu baru dibayar sebagian (hanya terjadi lewat titipan atau potongan). | Label | Ganti: `Kurang` menjadi `Baru sebagian` |
| **Tutup pertemuan** / **ditutup** | selesaikan pertemuan | Menandai pertemuan selesai; setelah itu catatannya hanya bisa dikoreksi. | Dialog (sudah ada) | Tetap |
| **Ubah tanggal** | | Mengubah tanggal pertemuan; uang tidak berubah. | Helper di halaman (keputusan 19) | Tetap |

#### C. Periode dan anggota

| Istilah di layar | Padanan sederhana | Penjelasan satu kalimat | Penjelasan di | Tindakan |
|---|---|---|---|---|
| **Periode** | satu putaran arisan | Satu putaran lengkap: berlangsung sampai setiap anggota menjadi tuan rumah satu kali. | Bantuan di Buat periode dan Kosong di Periode | Tetap |
| **Aktif** | sedang berjalan | Periode yang masih berjalan; hanya ada satu. | Label | Tetap |
| **Berakhir** (D5; kode lama memakai `Selesai`, `diakhiri`) | berakhir | Periode yang sudah ditutup; catatannya tersimpan dan hanya bisa dilihat. | Label dan Bantuan di tombol `Akhiri periode` | Ganti: `Selesai` menjadi `Berakhir` |
| **Akhiri periode** | tutup periode | Menutup periode; tunggakan yang tersisa dihapus dan ditanggung kas, dan tidak bisa dibatalkan. | Dialog dua langkah (sudah ada) | Tetap |
| **Penghapusan tunggakan** (`debt_writeoff` di kode) | tunggakan ditanggung kas | Iuran yang tidak dibayar sampai periode berakhir dihapus dari catatan anggota dan ditanggung kas. | Dialog akhiri periode dan Bantuan Laporan. Kalimat tambahan: `Tidak mengubah saldo kas.` | Tetap (belum ada keputusan yang membalik). USULAN BARU: nama jenis menjadi `Tunggakan ditanggung kas` karena menyebut siapa yang menanggung; baris Riwayat dan CSV ikut. Butuh pemilik |
| **Anggota** | | Orang yang ikut kumpul dan membayar iuran. | Label | Tetap |
| **Arsipkan anggota** / **Diarsipkan** | sembunyikan anggota | Anggota disembunyikan dari daftar dan pilihan baru, tetapi riwayatnya tetap ada; bisa diaktifkan lagi. | Dialog arsip (sudah ada) dan Kosong di Anggota yang diarsipkan | Tetap. `arsip`, `mengarsipkan` baku |
| **Hapus anggota** | hapus permanen | Menghapus anggota yang belum punya catatan apa pun; tidak bisa dibatalkan. | Dialog (sudah ada) | Tetap |

#### D. Riwayat, koreksi, dan cadangan

| Istilah di layar | Padanan sederhana | Penjelasan satu kalimat | Penjelasan di | Tindakan |
|---|---|---|---|---|
| **Catat kas** | catat uang kas | Halaman untuk mencatat saldo awal, pindah saldo, pinjaman, pelunasan, dan pengeluaran bersama. | Label. Teks bawah di Menu: `Saldo awal, pindah saldo, pinjaman, pengeluaran` | Tetap. Jangan menulis `menu Kas` atau `layar Kas` (T6) |
| **Riwayat** | daftar catatan | Daftar semua uang masuk dan keluar, dari yang terbaru. | Bantuan di atas ringkasan bulan (S10 sudah menyederhanakan) | Tetap |
| **catatan** (bukan `entri`) | | Satu baris di Riwayat. | Label | Tetap |
| **Koreksi** (D6) | batalkan dan catat ulang | Cara memperbaiki catatan yang salah: catatan lama ditandai `Dikoreksi` dan tidak dihitung, lalu dicatat yang benar; catatan lama tidak dihapus. | Bantuan satu kalimat di dialog Koreksi pertama dan di halaman Rincian catatan. Teks: `Koreksi membatalkan catatan ini; catatan lama tetap terlihat, ditandai Dikoreksi.` | Tetap. USULAN BARU (kecil): tambahkan kalimat itu |
| **Dikoreksi** | sudah dibatalkan | Catatan lama yang sudah dibatalkan oleh koreksi. | Label (status) | Tetap |
| **Tercatat** | berlaku | Catatan yang masih berlaku dan dihitung. | Label (status). CSV memakai `Berlaku`: samakan (R11) | Tetap. Samakan CSV |
| **Cadangan** | salinan data | Salinan semua data Mas Catat yang disimpan terpisah agar aman bila HP hilang. | Bantuan di halaman Cadangan dan ekspor | Tetap |
| **Salinan pengaman** | salinan sementara | Salinan otomatis sebelum data diganti, supaya bisa dikembalikan bila ada masalah. | Dialog Pulihkan dan Mulai dari nol | Tetap |
| **Pulihkan** / **Pulihkan data** | kembalikan dari cadangan | Mengganti semua data di HP ini dengan isi berkas cadangan. | Dialog (sudah ada: `SEMUA` jadi tebal, D8; kata `PULIHKAN` tetap diketik) | Tetap |
| **Mulai dari nol** | hapus semua data | Menghapus semua data dan memulai kosong; salinan pengaman tetap dibuat dulu. | Dialog (sudah ada; kata `HAPUS SEMUA` tetap diketik) | Tetap |
| **Ekspor** / **Berkas CSV** | simpan ke Excel | Berkas tabel yang dibuka di Excel atau Google Sheets; bukan cadangan dan tidak bisa dipulihkan. | Bantuan di halaman Cadangan dan ekspor (sudah ada di `backupLabels.ts:19`) | Tetap. `berkas`, bukan `file` (D3) |
| **Transfer** (hanya kolom CSV, D10) | | Perpindahan Tunai dan Debit; tidak dihitung sebagai uang masuk atau keluar. | Petunjuk CSV | Tetap (D10), tidak tampil di aplikasi |
| **Bulan ini** | | Ringkasan uang masuk dan keluar (Tunai dan Debit) dalam bulan berjalan. | Bantuan di Beranda | Tetap |
| **Pengingat** | | Daftar hal yang perlu dilakukan, misalnya pertemuan terlewat atau cadangan terlambat. | Kosong | Tetap |

#### E. Ringkasan: yang sebaiknya diganti atau ditambah

Sudah diputuskan pemilik (hanya menyamakan kode dengan keputusan; tidak ada keputusan yang dibalik):
1. `pos` menjadi `tempat uang` (D1).
2. `Kas nyata` dan `Kas akhir` menjadi `Total kas` (D4).
3. `Selesai`, `diakhiri` menjadi `Berakhir` (D5).
4. `Kurang` menjadi `Baru sebagian` (S18).
5. `file` menjadi `berkas`; `Kalau` menjadi `Jika`; `Pakai` menjadi `Gunakan`; tanpa `Anda` (D2, D3).
6. Panah `->` menjadi `ke` (S14).

USULAN BARU (butuh pemilik, semuanya hanya teks, tidak mengubah aturan uang):
- N1. Nama jenis `Penghapusan tunggakan` menjadi `Tunggakan ditanggung kas` (di `kasLabels.ts`, Riwayat, CSV, dialog). Alasan: `penghapusan` terdengar seperti anggota dibebaskan dari utang dan tidak menyebut siapa yang menanggung; pengguna awam paling mungkin bingung di sini. Bila ditolak, pertahankan nama lama dan jangan tampilkan `write-off`.
- N2. Sub-judul `(bila semua iuran lunas)` di kartu `Kas seharusnya` (D4 menyimpan nama, sub-judul hanya menambah petunjuk).
- N3. Satu kalimat penjelasan Koreksi di dialog Koreksi pertama dan di Rincian catatan (D6 sudah mengizinkan "tambah satu kalimat bila dirasa perlu").
- N4. Contoh `tur` diganti `wisata` pada `Pengeluaran bersama`.
- N5. Satu halaman "Istilah" ringan (daftar kata dengan penjelasan di atas) di Menu, supaya pengguna bisa membuka arti kata kapan saja. Biaya: satu layar statis baru, tanpa dependensi. Bila ditolak, penjelasan cukup di tempat yang bertanda Bantuan, Dialog, Kosong di tabel.

### 2.2 Teks yang perlu disesuaikan di kode (hasil Grep 2026-11-12, belum diubah; src/ sedang dikerjakan developer)

Daftar ini hanya yang bertentangan dengan tabel 2.1. Nomor baris bisa bergeser. Setiap perubahan teks juga mengubah tes yang mengunci teksnya (D12).

| Berkas | Teks lama | Teks baru | Dasar |
|---|---|---|---|
| `src/ui/backupLabels.ts:65` | `Kas akhir (Tunai + Debit)` | `Total kas (Tunai + Debit)` | D4, S6 |
| `src/ui/reportLabels.ts:32` | `Kurang` | `Baru sebagian` | S18 |
| `src/app/periods/[id]/members/[memberId].tsx:21-25` | daftar status sendiri (`Kurang`) | pakai satu sumber `WEEK_STATE_LABELS` | S18 |
| `src/app/periods/index.tsx:38` | `'Aktif' : 'Selesai'` | `'Aktif' : 'Berakhir'` | D5, S19 |
| `src/app/periods/[id]/index.tsx:83` | `'Selesai'` | `'Berakhir'` | D5 |
| `src/app/reports/period/[id]/index.tsx:46` | `'Selesai'` | `'Berakhir'` | D5 |
| `src/app/(tabs)/laporan.tsx:80` | `'Selesai'` | `'Berakhir'` | D5 |
| `src/ui/csvFiles.ts:122,139` | kolom dan nilai `Selesai` | `Berakhir` | D5 |
| `src/ui/messages.ts:101` | `Periode "X" diakhiri` | `Periode "X" berakhir` | D5, S19 |
| `src/ui/kasLabels.ts:62` | `${A} -> ${B}` (mis. `Tunai -> Debit`) | `${A} ke ${B}` | S14 |
| `src/ui/history.ts:55` (komentar dan hasil `Dipindah: Tunai -> Piutang`), tes `src/ui/history.test.ts:71`, `src/ui/kasLabels.test.ts:8` | `Dipindah: Tunai -> Piutang`, `Piutang -> Tunai` | untuk pinjaman: `Dari Tunai ke Piutang`; untuk pelunasan: `Dari Piutang ke Tunai`. Tidak memakai kata `Dipindah`, karena jenisnya pinjaman, bukan Pindah saldo. Cek maknanya dengan pemilik | S14 (sebagian USULAN BARU) |
| `src/ui/history.ts:60` | `Piutang` (baris kedua) | `Tercatat di Piutang` | R17 |
| `src/app/periods/[id]/close.tsx:152`, `src/app/periods/new.tsx:209` | `lewat menu Titipan anggota` | `lewat Menu > Titipan anggota` (Titipan anggota memang ada di tab Menu) | T6, ejaan nama halaman |
| `src/app/periods/[id]/members/[memberId].tsx:94` | `Piutang (pinjaman)` | `Piutang (dipinjam anggota)` | D9 |
| `src/app/loans/index.tsx:16` (komentar) dan teks `loans/index.tsx:45,62` | masih menyebut `Kas`, `daftar kas` | sesuai T6 | T6 |
| `src/ui/kasLabels.ts:60` dan `src/ui/history.ts:57` | `Tidak mengubah saldo kas` | tetap; bila N1 disetujui: `Ditanggung kas, tidak mengubah saldo` | N1 |
| `src/app/kas/new.tsx:48` | `misalnya tur` | `misalnya wisata` | N4 |
| `src/app/(tabs)/index.tsx:391` | `Tuan rumah sudah dibayar` (baris yang bisa diketuk) | `Lihat pembayaran tuan rumah` | S12 |
| `src/app/periods/[id]/index.tsx:152,158` | tombol `Sudah dibayar` | `Lihat pembayaran tuan rumah`; teks status `Sudah dibayar` | S12 |
| `src/app/periods/[id]/payout.tsx:135` | `Sudah dibayar` (status) | tetap | |
| `src/app/loans/[memberId].tsx:49`, `src/app/kas/[entryId].tsx:97` | `Sudah dibayar` (jumlah pinjaman yang dikembalikan) | `Sudah dikembalikan`. Alasan: pada pinjaman, "dibayar" bertabrakan dengan "bayaran tuan rumah" dan `Sudah dibayar` pada iuran. USULAN BARU kecil, butuh pemilik | N6 |

Sudah sesuai dan tidak perlu diubah (hasil Grep): `Pindah saldo`, `Pelunasan pinjaman`, `Koreksi`, `Dikoreksi`, `Dipotong dari bayaran tuan rumah`, `Lunas lewat potongan`, `Lunas lewat titipan`, `Titipan anggota`, `Total kas (Tunai + Debit)` di Kas dan Laporan, `Kas seharusnya = Total kas + tunggakan iuran - titipan anggota`, `Belum ada tempat uang`, pesan arsip anggota (S3), `Pilih Tunai, Debit, atau Piutang.`.

USULAN BARU tambahan: N6 `Sudah dibayar` menjadi `Sudah dikembalikan` pada baris pinjaman (lihat tabel di atas).

## 3. Tabel temuan

Penanda: [UANG] = usulan menyangkut kalimat soal uang; makna harus dipastikan pemilik sebelum diubah. Semua usulan hanya mengganti teks, bukan aturan.
Jumlah: Tinggi 6, Sedang 22, Rendah 24, total 52.

### 3.1 Prioritas tinggi

| ID | Lokasi | Teks sekarang | Masalah | Usulan teks | Prio |
|---|---|---|---|---|---|
| T1 | `src/app/periods/new.tsx:149` | `Pilih anggota ({selected.length} dipilih)` | Bug tampilan: ditulis sebagai teks biasa, bukan template. Layar menampilkan kurung kurawal dan nama variabel mentah. (Berkas ini sedang dikerjakan F4: sampaikan ke F4, jangan dobel edit.) | `Pilih anggota (3 dipilih)` (isi angka dari `selected.length`, pakai template string) | Tinggi |
| T2 | `src/app/periods/[id]/pay.tsx:105-107` | Judul dialog `Sebagian menjadi titipan - Rp30.000` muncul setiap `creditAmount > 0` | [UANG] Bila seluruh pembayaran menjadi titipan, judul bilang "Sebagian", isi dialog bilang "Seluruh pembayaran ini ... menjadi titipan". Saling bertentangan. | Jika `allocatedAmount === 0`: `Rp30.000 menjadi titipan`. Jika sebagian: `Sebagian menjadi titipan - Rp30.000` (tetap). | Tinggi |
| T3 | `src/ui/reportLabels.ts:103` (tampil di `laporan.tsx:71`) | `Payout belum dibayar` | Kata Inggris, dan bertentangan dengan glosarium ("bayaran tuan rumah"). | `Bayaran tuan rumah belum dibayar` ([UANG]: label baris info, angka tidak berubah). Keterangan di bawahnya (`unpaidPayoutText`) sudah baik. | Tinggi |
| T4 | `src/ui/errors.ts:13` + `src/ui/components/ErrorState.tsx:15` | Judul `Terjadi masalah` lalu isi `Terjadi kesalahan. Coba lagi.` | Dua kalimat yang sama maknanya, tidak menyebut apa yang gagal dan tidak memberi langkah lanjut bila "Coba lagi" gagal. Ini galat yang paling sering mungkin dilihat. | Judul: `Data tidak bisa dibuka`. Isi bawaan: `Terjadi kesalahan yang tidak dikenal. Coba lagi. Jika tetap gagal, tutup aplikasi sepenuhnya lalu buka lagi. Data Anda tidak berubah.` (ganti "Data Anda" menjadi "Data tidak berubah" bila keputusan D2 menghapus "Anda"; kalimat terakhir hanya boleh dipakai untuk galat saat membaca, bukan saat menyimpan: pisahkan dua konstanta `GENERIC_LOAD_ERROR` dan `GENERIC_SAVE_ERROR`: simpan: `Catatan belum tersimpan. Coba lagi.`) | Tinggi |
| T5 | Banyak tempat (daftar di bawah) | `pos`, `Tanpa pos`, `Pilih pos.`, `Pos tujuan` | Istilah teknis. Pemilik non-teknis dan anggota tidak tahu arti "pos". Lokasi: `kasLabels.ts:58-61`, `history.ts:58`, `HistoryRow.tsx:76`, `kas/new.tsx:44,202,297`, `kas/index.tsx:60`, `kas/[entryId].tsx:74,82`, `filter-riwayat.tsx:53`, `payout.tsx:137` ("tanpa pos"), `csvFiles.ts:12,17-18` (kolom `Pos`, `Pos tujuan`), `errors.ts:73` | Lihat keputusan D1. Bila disetujui "tempat uang": `Tanpa pos` menjadi `Belum ada tempat uang`; `Pilih pos.` menjadi `Pilih Tunai, Debit, atau Piutang.`; label `Pos` menjadi `Saldo awal untuk`; `Pos: Tunai` menjadi `Tempat uang: Tunai`; kolom CSV `Pos` menjadi `Tempat uang`, `Pos tujuan` menjadi `Tempat uang tujuan`; `HistoryRow:76` menjadi `Peringatan: belum ada Tunai atau Debit pada catatan ini, jadi tidak dihitung di saldo`. Catatan: Piutang bukan tempat uang, jadi di pilihan Saldo awal beri keterangan `Piutang (dipinjam anggota)`. | Tinggi |
| T6 | Petunjuk ke tempat yang tidak ada: `laporan.tsx:46`, `loans/index.tsx:45,62`, `kas/new.tsx:211`, `kas/[entryId].tsx:158,197`, `pay.tsx:151` | `Sama dengan layar Kas.` / `di daftar Kas` / `dari daftar kas` / `lewat menu Kas` / `gunakan transfer di menu Kas` | Tidak ada layar, daftar, atau menu bernama "Kas". Adanya: Beranda (Total kas), tab Riwayat, halaman Catat kas. Pengguna tidak tahu harus ke mana. "transfer" juga bukan nama tombolnya ("Pindah saldo"). Satu detail: `payout.tsx:117` menyebut `lihat pesan merah di layar` padahal Notice bernada "warn"; cek warnanya di HP. | `laporan.tsx:46`: `Sama dengan Total kas di Beranda. Piutang belum ada di tangan, jadi tidak dihitung dalam Total kas.` `loans/index.tsx:45`: `Sama dengan Piutang di Catat kas.` `loans/index.tsx:62` dan `kas/new.tsx:211`: `...di tab Riwayat...` `kas/[entryId].tsx:158,197`: `...lewat Catat kas.` `pay.tsx:151`: `Uang masuk ke Tunai. Untuk memindahkannya ke Debit, gunakan Pindah saldo di Catat kas.` `payout.tsx:117`: `lihat peringatan di layar`. | Tinggi |

### 3.2 Prioritas sedang

| ID | Lokasi | Teks sekarang | Masalah | Usulan teks | Prio |
|---|---|---|---|---|---|
| S1 | `errors.ts:29,37,38,42,54`; `meetingDate.ts:8`; `close.tsx:24` | `Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.` | Tanggal dipilih dari kalender, tidak diketik, jadi petunjuk format tidak bisa dijalankan. Enam tempat. | `Tanggal tidak valid. Pilih tanggal dari kalender.` | Sedang |
| S2 | `errors.ts:126` | `Database gagal disiapkan. Tutup lalu buka lagi aplikasinya.` | "Database" jargon; tidak menenangkan soal data; tidak ada langkah bila tetap gagal. | `Data aplikasi gagal disiapkan. Tutup aplikasi sepenuhnya lalu buka lagi. Jika tetap gagal, jangan hapus aplikasi (data bisa hilang). Hubungi pengembang.` (isi kontak: keputusan D11) | Sedang |
| S3 | `errors.ts:82,116-118` | `Masih ikut periode aktif.` / `Masih punya sisa pinjaman Rp...` / `Masih punya titipan Rp... - kembalikan dulu.` | Muncul kalimat tanpa subjek di bawah kolom nama (`members/index.tsx:119`), tidak jelas apa yang ditolak. Dua dari tiga tidak menyebut langkah. | `Belum bisa diarsipkan: masih ikut periode aktif. Arsipkan setelah periodenya berakhir.` / `Belum bisa diarsipkan: masih punya sisa pinjaman Rp100.000. Lunasi dulu di Pinjaman anggota.` / `Belum bisa diarsipkan: masih punya titipan Rp15.000. Kembalikan dulu di Titipan anggota.` ([UANG]: angka tidak berubah) | Sedang |
| S4 | `errors.ts:87-105` (`BACKUP_ERROR_TEXT`) | `Berkas ini bukan cadangan Mas Catat.`, `Isi berkas tidak lengkap...`, `Berkas cadangan rusak: pemeriksaan keutuhan gagal.`, `Proses lain masih berjalan. Tunggu sebentar.` dan lain-lain | Menyebut masalah, tidak menyebut langkah. `invariant` ("aturan iuran") dan `foreign_keys` ("merujuk ke data yang tidak ada") terdengar teknis. | Tambahkan satu kalimat penutup baku `Pilih berkas cadangan yang lain.` pada `file_empty`, `file_too_small`, `file_too_large`, `not_sqlite`, `version_missing`, `tables_missing`, `schema_mismatch`, `integrity`, `foreign_keys`, `invariant`. `busy`: `Proses lain masih berjalan. Tunggu sebentar, lalu coba lagi.` `invariant`: `Angka di dalam berkas tidak cocok dengan hitungan iuran, jadi tidak dipakai. Pilih berkas cadangan yang lain.` `foreign_keys`: `Data di dalam berkas saling tidak cocok (ada catatan yang tidak punya induknya). Pilih berkas cadangan yang lain.` | Sedang |
| S5 | `backupLabels.ts:48-49` | `Cadangan ini BERBEDA jalur dengan data di HP ini. ... akan HILANG, dan ... akan masuk.` | "Berbeda jalur" tidak dipahami. HURUF BESAR. | `Isi cadangan ini dan data di HP ini sama-sama punya catatan yang tidak ada di pihak lain. {lost} catatan di HP ini akan hilang, dan HP ini akan memakai {added} catatan dari cadangan.` (jumlah catatan, bukan uang). Pada `older` (baris 47): `Cadangan ini lebih lama. {lost} catatan di HP ini tidak ada di cadangan dan akan hilang.` | Sedang |
| S6 | `laporan.tsx:45,51` + `reportLabels.ts:96`; `kas/index.tsx:38`; `backupLabels.ts:65`; `index.tsx:198` | `Total kas`, `Kas nyata (Tunai + Debit)`, `Kas akhir (Tunai + Debit)` | [UANG] Tiga nama untuk jumlah yang sama (Tunai + Debit). Pemilik harus menerka apakah angkanya sama. | Satu nama: `Total kas (Tunai + Debit)`. Rumus: `Kas seharusnya = Total kas + tunggakan iuran - titipan anggota`. (`EXPECTED_LABELS.actual` dan `EXPECTED_FORMULA` ikut berubah; makna tidak berubah.) Lihat D4. | Sedang |
| S7 | `laporan.tsx:58-62,68`; `reportLabels.ts:99-100` | `Titipan belum dipakai`, `Titipan dibawa ke pertemuan yang belum ditutup` ditaruh di antara `- Titipan anggota` dan `= Kas seharusnya`; judul `Info (di luar rumus)` | [UANG] Dua baris rincian titipan tampil seperti bagian hitungan, padahal tidak ikut dijumlah. "Rumus" juga jargon. | Awali dua baris itu dengan `Rincian titipan: belum dipakai` dan `Rincian titipan: sudah dialokasikan ke pertemuan yang belum ditutup`, atau pindahkan ke kartu Info. Judul kartu: `Catatan tambahan (tidak masuk hitungan)`. Perlu pemilik memastikan makna "dialokasikan". | Sedang |
| S8 | `payout.tsx:31,34` | `...dicatat sebagai entri terpisah.` / `Sisa tunggakan Rp... tetap tercatat sebagai utang.` | [UANG] "Entri" jargon; "utang" memperkenalkan istilah ketiga di samping "tunggakan". | `Tunggakan {nama} Rp... dipotong dari bayarannya dan dicatat sebagai catatan terpisah.` / `Sisa tunggakan Rp... tetap tercatat sebagai tunggakan.` | Sedang |
| S9 | `pay.tsx:32`; `periods/new.tsx:183-184` | `Menyentuh 3 pertemuan.` / `Pertemuan terakhir yang tersentuh bisa terlunasi sebagian.` | "Menyentuh" dan "tersentuh" bukan bahasa keuangan. [UANG] | `Mencakup 3 pertemuan.` / `Pertemuan terakhir yang terisi bisa lunas sebagian.` | Sedang |
| S10 | `riwayat.tsx:99-100` | `Tidak termasuk: pindah saldo, pinjaman, pelunasan pinjaman, saldo awal (barisnya tetap bertanda +), penghapusan tunggakan, dan catatan yang dikoreksi beserta koreksinya.` | [UANG] Satu kalimat memuat enam pengecualian dan tanda kurung yang membingungkan. | Bagi dua kalimat: `Ringkasan ini menghitung uang yang masuk dan keluar dari Tunai dan Debit.` `Tidak dihitung: pindah saldo, pinjaman dan pelunasannya, saldo awal, penghapusan tunggakan, serta catatan yang sudah dikoreksi.` Hapus tanda kurung "barisnya tetap bertanda +" atau jelaskan di tempat lain. Daftar pengecualian harus tetap sama persis dengan `summarizeMonth`. | Sedang |
| S11 | `backupLabels.ts:13,19,21`; `backup/index.tsx:111`; `restore.tsx:291`; `shareFile.ts:73` | `File CSV`, `filenya`, `Menyiapkan file...`, `Bagikan file CSV`, `database kosong`, `dienkripsi`, `spreadsheet`, `Drive pribadi` | Campuran "file/berkas" (galat memakai "berkas"); "dienkripsi" dan "database" jargon. | `Berkas CSV`, `berkasnya`, `Menyiapkan berkas...`, `Bagikan berkas CSV`, `data kosong`. `Cadangan tidak dikunci dengan kata sandi. Siapa pun yang memegang berkasnya bisa membacanya.` `Berkas CSV hanya untuk dibaca di Excel atau Google Sheets.` `Google Drive pribadi`. (D3) | Sedang |
| S12 | `index.tsx:391`; `periods/[id]/index.tsx:150-158` | Baris `Tuan rumah sudah dibayar` dan tombol `Sudah dibayar` | Terlihat seperti status, padahal menekannya membuka halaman bayar (untuk melihat atau mengoreksi). Pengguna tidak tahu itu tombol. | `Lihat pembayaran tuan rumah` (baris Beranda dan tombol Periode); tambah penanda lunas di teks kedua: `Sudah dibayar`. | Sedang |
| S13 | `src/app/_layout.tsx:29-50` | `Buat Periode`, `Detail Periode`, `Catat Pembayaran`, `Tuan Rumah Pertemuan`, `Bayar Tuan Rumah`, `Akhiri Periode`, `Titipan Anggota`, `Cadangan dan Ekspor`, `Pulihkan Data`, `Detail Kas`, `Filter Riwayat`, `Laporan Pertemuan`, `Riwayat Anggota` | Title Case, sedangkan isi layar dan Menu memakai sentence case ("Cadangan dan ekspor"). Dua nama untuk satu layar. Judul `Tuan Rumah Pertemuan` tidak menyebut tanggal, padahal layar itu juga mengatur tanggal. `Anggota di Periode` kurang jelas. | Sentence case semua. `Atur pertemuan` (untuk `meetings/[number]`), `Jadwal periode` (untuk `periods/[id]/index`, sama dengan Menu dan ubin Jadwal), `Rincian catatan` (ganti `Detail Kas`), `Pembayaran anggota` (ganti `Anggota di Periode`). Lihat D7. | Sedang |
| S14 | `kasLabels.ts:62`, `history.ts:55,59`, `kas/new.tsx:202` | `Tunai -> Debit`, `Dipindah: Tunai -> Piutang` | Panah ASCII. TalkBack membaca "minus lebih besar dari". Ada juga contoh `Tunai -> Piutang` yang tidak sesuai aturan (Tunai/Debit hanya saling pindah); cek apakah teks itu mungkin muncul. | `Tunai ke Debit` (sama dengan label tombol arah di `kas/new.tsx:304`). | Sedang |
| S15 | `meetings/[number].tsx:157-159` | `...diperkirakan tiap 7 hari setelah tanggal terakhir yang dipilih.` | Tidak cocok dengan aturan (Selasa terdekat dari 7 hari setelahnya: bisa +6, +8, +10). | `Pertemuan berikutnya yang belum ditentukan diperkirakan jatuh pada hari Selasa terdekat, sekitar 7 hari setelah tanggal terakhir yang dipilih.` (berkas F4) | Sedang |
| S16 | `kas/[entryId].tsx:82,202-205` | Baris `Pos`: `Masuk ke Tunai (Tunai)` | Nama tempat uang muncul dua kali. Terlihat seperti galat. | Isi baris hanya nama: `Tunai`. Arah masuk atau keluar sudah ada di kartu atas (`flowText`). | Sedang |
| S17 | `credits/index.tsx:96` vs pil `Titipan` di `index.tsx:266-272` | `Tidak ada anggota yang memegang titipan dari periode yang sudah berakhir.` | [UANG] Pil Titipan di Beranda menghitung semua titipan, sedangkan layar ini hanya memuat dari periode yang sudah berakhir. Jumlah bisa berbeda tanpa penjelasan. | Tambahkan: `Titipan pada periode yang masih berjalan tidak ada di sini; dipakai untuk iuran periode itu.` Pemilik cek kebenarannya. | Sedang |
| S18 | `reportLabels.ts:32` + `members/[memberId].tsx:25` | Status `Kurang` | Satu kata, ambigu (kurang dari apa). Daftar yang sama ditulis dua kali (`STATE_LABEL` di layar anggota dan `WEEK_STATE_LABELS`). | `Baru sebagian`. Satu sumber (`WEEK_STATE_LABELS`) dipakai kedua layar. | Sedang |
| S19 | `periods/index.tsx:38`, `laporan.tsx:80`, `periods/[id]/index.tsx:83`, `reports/period/[id]/index.tsx:46`, `csvFiles.ts:129` vs `messages.ts:90` dan tombol `Akhiri periode` | Status `Selesai`; toast `diakhiri`; teks `berakhir pada` | Tiga kata untuk satu keadaan. | Pilih satu (D5). Usulan: status `Berakhir`, tombol `Akhiri periode`, toast `Periode "X" berakhir`. | Sedang |
| S20 | `backupLabels.ts:13,35` dan lain-lain; `errors.ts:102`; `periods/[id]/index.tsx:169` | `Kalau HP hilang...`, `data Anda`, `sebelum Anda memastikan`; di tempat lain `Jika libur...`, `Jika disimpan...` | Dua register dan dua kata ganti. | Aturan: tanpa kata ganti, "Jika" untuk pengandaian. `Jika HP hilang atau rusak...`, `Salinan pengaman gagal dibuat, jadi data tidak diubah sama sekali.`, `...sebelum periode benar-benar diakhiri.` Kemunculan "Kalau": `backupLabels.ts:13,35`, `pay.tsx:41`, `payout.tsx:35`, `kas/new.tsx:211`, `kas/[entryId].tsx:74`. | Sedang |
| S21 | `errors.ts:18` | `Nama anggota sudah ada. Pakai nama lain.` | Nama anggota yang diarsipkan tetap dipakai (keputusan Step M), tetapi pemilik tidak melihatnya di daftar, jadi bingung. | `Nama ini sudah dipakai (mungkin oleh anggota yang diarsipkan). Gunakan nama lain.` | Sedang |
| S22 | `backupLabels.ts:27-31`, `backup/index.tsx:75` | `Menu bagikan terakhir dibuka: 3 Nov 2026 (3 hari lalu). Pastikan filenya benar-benar terkirim.` | Jujur tetapi janggal ("menu bagikan dibuka"). | `Terakhir mencoba membagikan: 3 Nov 2026 (3 hari lalu). Pastikan berkasnya benar-benar terkirim.` Pesan `Belum pernah dibagikan` tetap. | Sedang |

### 3.3 Prioritas rendah

| ID | Lokasi | Teks sekarang | Masalah | Usulan teks | Prio |
|---|---|---|---|---|---|
| R1 | `payments.tsx:94` | `...lewat form lengkap (ketuk baris).` | "form" Inggris. | `...lewat halaman pembayaran (ketuk baris).` | Rendah |
| R2 | `messages.ts:32` | `Tanggal 4 Nov sudah lewat 3 hari.` | Tidak menyebut pertemuan mana. | `Pertemuan 3 (4 Nov) sudah lewat 3 hari. Jika libur, biarkan terbuka dan ubah tanggalnya saat pertemuan jadi dilaksanakan.` (perlu nomor pertemuan sebagai argumen) | Rendah |
| R3 | `payment-preview.ts:87` (tampil di `pay.tsx:97`, `kas/new.tsx:186`) | `Tulis jumlah tanpa koma, misalnya 45000 atau 45.000.` dan `Isi jumlah pembayaran, misalnya 15000.` | Input memakai keypad; kata "tulis" dan contoh tanpa Rp tidak lagi cocok. | `Isi jumlah dengan angka di bawah.` (teks hanya terlihat bila keypad gagal) | Rendah |
| R4 | `reports/period/[id]/index.tsx:52`; `meetings/[number].tsx:45,54,63` | `15.000 x anggota x pertemuan`, `10.000 x jumlah anggota`, `5.000 x jumlah anggota` | Format uang tidak seragam (tanpa "Rp"). [UANG] | `Rp15.000 x anggota x pertemuan` dan seterusnya | Rendah |
| R5 | `reports/period/[id]/meetings/[number].tsx:57-63` | `Kontribusi kas`, `Belum terealisasi` | Jargon ("terealisasi"). [UANG] | `Bagian untuk kas`, `Belum masuk` | Rendah |
| R6 | `messages.ts:88` | `Tuan rumah pertemuan 3: Budi tersimpan` | Urutan kata sedikit kaku. | `Tuan rumah pertemuan 3 disimpan: Budi` | Rendah |
| R7 | `close.tsx:103`; `backupLabels.ts:84` | `Yakin akhiri periode?`, `Yakin?` | Kurang utuh. | `Yakin ingin mengakhiri periode?`, `Yakin ingin mengganti semua data?` | Rendah |
| R8 | `members/index.tsx:186` | `Ketuk nama untuk mengubahnya, menghapus, atau mengarsipkannya.` | Ambigu (mengubah apa). | `Ketuk nama untuk mengubah nama, menghapus, atau mengarsipkan anggota.` | Rendah |
| R9 | `periods/index.tsx:29` | `Buat periode pertama dari menu Buat Periode.` | Melingkar; tidak ada menu itu. | `Buat periode pertama dengan tombol di bawah.` | Rendah |
| R10 | `reminders.ts:141-142` | Judul `Cadangan terakhir 12 hari lalu` dan isi `Cadangan terakhir 12 hari lalu. Buat cadangan...` | Kalimat yang sama dua kali. | Isi: `Buat cadangan baru supaya catatan terbaru ikut aman.` | Rendah |
| R11 | `csvFiles.ts:31-33` vs `entryDetail.ts:9` | CSV `Berlaku`, UI `Tercatat` | Dua nama untuk catatan yang masih berlaku. | Satu nama (usulan `Berlaku` di keduanya, atau `Tercatat`). | Rendah |
| R12 | `backupLabels.ts:61` | Baris `Catatan kas terakhir`, nilainya tanggal | Label tidak mengatakan itu tanggal. | `Tanggal catatan kas terakhir` | Rendah |
| R13 | `reportLabels.ts:11` | `Menerima pembayaran tuan rumah` | Glosarium: uang yang diterima = "bayaran". | `Menerima bayaran tuan rumah` | Rendah |
| R14 | `kas/new.tsx:114` | `Catatan kas dilekatkan ke sebuah periode...` | "dilekatkan" janggal. | `Catatan kas selalu terhubung ke sebuah periode, jadi buat periode dulu.` | Rendah |
| R15 | `kas/new.tsx:109` | `Jenis catatan tidak dikenal.` | Tidak ada langkah. | `Jenis catatan tidak dikenal. Kembali lalu pilih dari Catat kas.` | Rendah |
| R16 | `kas/[entryId].tsx:81` | Baris `Dicatat` | Kurang jelas (kapan). | `Dicatat pada` | Rendah |
| R17 | `history.ts:60` | Baris kedua hanya `Piutang` | Tidak menjelaskan. | `Tercatat di Piutang` | Rendah |
| R18 | `errors.ts:22,62,60` | `Periode belum bisa diakhiri karena masih ada pertemuan yang belum ditutup.` / `Buat atau mulai periode dulu.` / `...tidak bisa dikoreksi otomatis.` | Tanpa langkah; "mulai periode" bukan aksi yang ada. | `...Tutup dulu semua pertemuan.` / `Buat periode dulu.` / `...Catat ulang pembayarannya bila perlu.` | Rendah |
| R19 | `errors.ts:41,53,63` | `Tanggal ... tidak boleh di masa depan.` | Tanpa langkah. | Tambahkan `Pilih hari ini atau sebelumnya.` | Rendah |
| R20 | `errors.ts:81,111` | `Aktifkan lagi dulu.` | Tidak bilang di mana. | `Aktifkan lagi dulu di halaman Anggota.` | Rendah |
| R21 | `kas/new.tsx:212` | Judul dialog `Simpan pindah saldo tunai / debit Rp100.000` (hasil `toLowerCase`) | Nama tempat uang jadi huruf kecil. | Judul tetap: `Simpan pindah saldo Rp100.000?` | Rendah |
| R22 | `restore.tsx:269`, `backupLabels.ts:47,48` | `SEMUA`, `LEBIH LAMA`, `HILANG` | Huruf besar terkesan membentak. | Judul Notice tebal atau satu kata tebal (D8) | Rendah |
| R23 | `errors.ts:18` dan lain-lain | `Pakai` vs `Gunakan` | Dua kata sama makna. | `Gunakan` | Rendah |
| R24 | `index.tsx:430` | Ubin `Tuan rumah` (membuka halaman bayar tuan rumah) | Label tidak sama dengan tujuan. | `Bayar tuan rumah` (jika muat) atau biarkan | Rendah |

Catatan data CSV (bukan teks, untuk D10): `csvFiles.ts:36` mencatat pindah saldo di kolom `Keluar (Rp)`. Pemilik yang menjumlah kolom itu di spreadsheet akan melihat pengeluaran lebih besar dari kenyataan. Ini soal isi data, bukan kata; diajukan sebagai keputusan.

## 4. Bagian yang sudah baik (jangan diubah)

- Format uang `Rp15.000` dan tanggal `4 Jan 2026` konsisten di layar. Pengecualian kecil ada di R3 dan R4.
- Pesan kelipatan Rp15.000 (`pay.tsx:49,165`, `errors.ts:45`) dan catatan sisa tunggakan (`messages.ts:45`) jelas dan mengajarkan aturan.
- Dialog akibat: tutup pertemuan, akhiri periode (dua langkah), kembalikan titipan ("TIDAK bisa dikoreksi" dengan alasan), hapus dan arsipkan anggota, pulihkan data. Semuanya menyebut apa yang terjadi dan bahwa tindakan tidak bisa dibatalkan.
- Empty state di Beranda, Riwayat, Anggota, Pinjaman, Titipan memberi arah.
- Tombol terdeaktivasi memberi alasan (`quickActions.ts`, `pay.tsx:165`, `kas/new.tsx:226-235`).
- Label aksesibilitas ("Sembunyikan saldo", "Hapus satu angka", "Bulan sebelumnya").

## 5. Keputusan untuk pemilik

| ID | Keputusan | Usulan peninjau |
|---|---|---|
| D1 | Kata pengganti "pos" untuk Tunai/Debit/Piutang. Pilihan: (a) "tempat uang", (b) "kantong", (c) tetap "pos" dengan penjelasan satu kali. | (a) "tempat uang". Piutang tidak disebut tempat uang; beri keterangan `Piutang (dipinjam anggota)`. Hanya teks, kode tetap `pos`/`account`. |
| D2 | Register bahasa: "Jika" (formal ramah) atau "Kalau" (akrab); kata ganti: tanpa kata ganti atau "Anda". | "Jika", tanpa kata ganti. |
| D3 | "berkas" atau "file". | "berkas" (profesional); "CSV" tetap. |
| D4 | Satu nama untuk Tunai + Debit. Dan apakah "Kas seharusnya" dipertahankan atau diganti (misal "Perkiraan kas bila semua lunas"). [UANG] | "Total kas (Tunai + Debit)" di semua layar. "Kas seharusnya" dipertahankan, rumusnya ditulis dengan nama baru. |
| D5 | Kata baku periode yang berhenti: "Selesai" atau "Berakhir". | "Berakhir" (cocok dengan tombol "Akhiri periode"). |
| D6 | Kata "Koreksi/Dikoreksi" (sekarang berarti membatalkan lalu mencatat ulang). Apakah tetap, atau status menjadi "Dibatalkan". | Pertahankan "Koreksi" (sudah dipakai di semua dialog dan sudah lolos cek HP); tambahkan satu kalimat penjelasan di dialog koreksi pertama saja bila dirasa perlu. |
| D7 | Judul layar: sentence case dan nama baru `Atur pertemuan`, `Jadwal periode`, `Rincian catatan`, `Pembayaran anggota`. | Setuju. |
| D8 | HURUF BESAR untuk penekanan (SEMUA, HILANG, TIDAK): tetap atau diganti tebal. | Ganti tebal/judul Notice; pengecualian kata konfirmasi yang harus diketik (`PULIHKAN`, `HAPUS SEMUA`) tetap huruf besar. |
| D9 | Pil `Piutang` di Beranda tanpa penjelasan: tambahkan "(dipinjam anggota)" atau ganti `Piutang` menjadi `Pinjaman`. | Biarkan `Piutang` di pil, tetapi samakan sub-label semua layar: `Piutang (dipinjam anggota)`. |
| D10 | CSV: pindah saldo di kolom `Keluar` menyesatkan bila dijumlah; mau diberi kolom sendiri atau diberi catatan di petunjuk CSV. Ini ubahan data, bukan kata. [UANG] | Minimal tambahkan satu kalimat di `CSV_HINT`: `Pindah saldo tercatat di kolom Keluar walau uang tidak keluar dari kas.` Bila ingin lebih tepat, ubah bentuk kolom: tugas terpisah. |
| D11 | Kontak yang ditulis pada galat gagal-siapkan-data (S2). | Pemilik menentukan. |
| D12 | Pelaksanaan: satu batch hanya teks. Karena ada teks di `src/domain` (`AMOUNT_FORMAT_HINT`) dan banyak tes yang mengunci teks (`errors.test.ts`, `messages.test.ts`, `reportLabels.test.ts`, `backupLabels.test.ts`, `kasLabels.test.ts`, `csvFiles.test.ts`), tes ikut diperbarui. Disarankan dikerjakan setelah F4 selesai (berkas yang sama), dan T1 segera lewat F4. | Setuju. Urutan: T1 (lewat F4), T2, T3, T6, S1, T4, lalu sisanya per berkas. |

## 6. Cara memeriksa setelah dikerjakan (untuk pemilik di HP)

1. Beranda tanpa periode, lalu dengan periode: baca pil Titipan dan Piutang, kartu Pertemuan, Pengingat.
2. Catat pembayaran Rp30.000 untuk anggota yang tidak menunggak: judul dialog harus berbunyi sesuai isi (T2).
3. Buat periode: judul bagian anggota memuat jumlah terpilih (T1).
4. Laporan: baca kartu Kas seharusnya dan kartu catatan tambahan (S6, S7, T3).
5. Coba mengarsipkan anggota yang masih punya pinjaman dan yang masih ikut periode aktif: pesan harus memberi langkah (S3).
6. Pilih berkas yang bukan cadangan di Pulihkan data: pesan harus memberi langkah (S4).
7. Buka TalkBack pada satu catatan pindah saldo: harus terbaca "Tunai ke Debit" (S14).
