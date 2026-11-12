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
