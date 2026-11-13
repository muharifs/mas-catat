# Teks batch E: spesifikasi

Tanggal: 2026-11-12. Pemohon: pemilik ("ikut usul", disetujui 2026-11-12). Penyusun: ui-ux-designer (lewat asisten-utama).
Dasar: `docs/specs/ui-language-review.md` (N1-N6, D1-D12), `PROJECT.md` keputusan 23, `CLAUDE.md`.
Status: spesifikasi untuk developer. TIDAK ada kode yang diubah. Tidak ada aturan uang atau perhitungan yang berubah; semua hanya teks, ditambah dua perubahan tampilan kecil (prop `title` pada `ErrorState`, satu halaman statis "Istilah") dan satu catatan di `errors.ts` (konteks galat).

Aturan teks yang dipakai: tanpa kata ganti (D2), "Jika" (bukan "Kalau"), sentence case, penekanan lewat huruf tebal atau judul Notice, bukan huruf besar (D8), "berkas" (D3), "tempat uang" (D1), "Total kas (Tunai + Debit)" (D4), "Berakhir" (D5). Nomor baris dari kondisi kerja 2026-11-12 (batch A-C sudah masuk); bisa bergeser.

BELUM dicek di perangkat (perlu pemilik, lihat bagian 9): tampilan teks yang lebih panjang di layar kecil dan font besar, kontras Notice, pembacaan TalkBack, perilaku toast untuk teks 2 baris.

Catatan penamaan N6: di permintaan, N6 disebut "wording pengembalian titipan". Di tinjauan (bagian 2.2 baris terakhir dan bagian 2.2 "USULAN BARU tambahan"), N6 adalah baris pinjaman `Sudah dibayar` menjadi `Sudah dikembalikan`. Teks pengembalian titipan sendiri sudah memakai "Pengembalian titipan" dan "dikembalikan" dan tidak diubah, kecuali kalimat tebal di item 1. Spesifikasi ini memakai arti dari tinjauan.

---

## 1. F4: kalimat "TIDAK bisa dikoreksi" pada pengembalian titipan

Masalah: `src/app/credits/index.tsx:64` memakai huruf besar "TIDAK". D8 meminta tebal. `Alert.alert` Android tidak bisa menebalkan sebagian teks (isi dialog adalah satu string polos, hanya judul dan tombol yang digayakan sistem). Jadi dialog dibuat tanpa huruf besar, dan penekanan tebal dipindah ke Notice yang terlihat sebelum dialog.

Pengembalian titipan bersifat final (dipastikan di `kasLabels.ts:92`, rute `not_correctable`), jadi pemberitahuan harus terlihat sebelum pemilik menekan "Lanjut", bukan hanya di dialog.

### 1a. Dialog (credits/index.tsx:64)
Teks lama: `Pengembalian ini TIDAK bisa dikoreksi atau dibatalkan. Periksa tempat uang dan tanggalnya.`
Teks baru: `Pengembalian ini final: tidak bisa dikoreksi atau dibatalkan. Periksa tempat uang dan tanggalnya.`
Tetap menjadi baris terakhir pesan (paling dekat tombol). Tombol "Kembalikan uang" sudah `style: 'destructive'`; tidak diubah.

### 1b. Notice di kartu anggota yang dipilih (credits/index.tsx, antara baris 121 dan 122)
Tambahkan, hanya saat `isSelected`:
```
<Notice tone="warn" title="Tidak bisa dikoreksi">
  Pengembalian titipan bersifat final. Periksa tempat uang dan tanggalnya sebelum lanjut.
</Notice>
```
Judul Notice memakai `type.label` (tebal), jadi "Tidak bisa dikoreksi" tampil tebal tanpa huruf besar. Letak: di atas teks "Jumlah otomatis seluruh sisa titipan, tidak bisa diketik." dan di atas Notice galat.

Layout: Notice 3 baris (judul + 2 baris) ditambahkan di dalam Card. Card sudah memuat DateField, 2 tombol, hint, 2 tombol; layar bisa digulir (ScrollView), tidak ada risiko terpotong. Cek di perangkat bahwa tombol "Lanjut" masih terlihat tanpa menggulir jauh.

---

## 2. F5: pesan prasyarat di bawah judul merah "Data tidak bisa dibuka"

Masalah: `src/app/kas/new.tsx:109`, `:114`, `:117` memakai `ErrorState` (judul merah tetap "Data tidak bisa dibuka", `ErrorState.tsx:15`). Dua dari tiga bukan kegagalan memuat: belum ada periode, dan pinjaman tanpa periode aktif. Itu keadaan kosong yang punya langkah berikutnya. D11 menyimpan judul itu hanya untuk kegagalan memuat.

### 2a. Belum ada periode (kas/new.tsx:114) dan pinjaman tanpa periode aktif (kas/new.tsx:117): pakai `EmptyState`, bukan `ErrorState`
`EmptyState` sudah ada (`src/ui/components/EmptyState.tsx`: ikon netral, judul tidak merah, satu tombol). Pola yang sama sudah dipakai di `periods/index.tsx:27-32`.

| Kasus | Judul | Isi | Tombol |
|---|---|---|---|
| Belum ada periode (`!data.hasPeriod`, baris 114) | `Belum ada periode` | `Catatan kas selalu terhubung ke sebuah periode. Buat periode dulu.` | `Buat periode`, `router.replace('/periods/new')` |
| Pinjaman, tidak ada periode aktif (baris 117) | `Belum ada periode aktif` | `Pinjaman baru hanya untuk anggota periode aktif. Buat periode dulu.` | `Buat periode`, `router.replace('/periods/new')` |

Catatan: `replace`, bukan `push`, agar Kembali dari halaman Buat periode tidak jatuh ke halaman prasyarat yang sama. Kasus 117 hanya bisa dicapai lewat tautan langsung (`kas/index.tsx:65` menyembunyikan tombol Pinjaman tanpa periode aktif), jadi cukup satu tombol.

### 2b. Jenis catatan tidak dikenal (kas/new.tsx:109): tetap `ErrorState`, tetapi judulnya sendiri
Tambahkan prop opsional `title?: string` pada `ErrorState` (default `Data tidak bisa dibuka`, sehingga semua pemanggil lain tidak berubah). Di baris 109:
- `title`: `Jenis catatan tidak dikenal`
- `message`: `Kembali ke Catat kas, lalu pilih jenis catatan dari daftar.`
Warna merah tetap (ini galat tautan, bukan keadaan kosong).

### 2c. Opsional, di luar permintaan (butuh setuju pemilik)
Sepuluh tempat memakai `ErrorState` untuk "X tidak ditemukan." tanpa `onRetry` dan tanpa langkah: `payout.tsx:93`, `pay.tsx:75`, `payments.tsx:53`, `meetings/[number].tsx:56`, `periods/[id]/index.tsx:46`, `close.tsx:54`, `members/[memberId].tsx:53`, `reports/period/[id]/members/[memberId].tsx:44`, `loans/[memberId].tsx:42`, `kas/[entryId].tsx:51`. Usul: `title="Data tidak ditemukan"` dan isi `{Jenis} tidak ditemukan. Kembali lalu pilih lagi.` Jika disetujui, dikerjakan sebagai batch kecil terpisah.

Layout: `EmptyState` memusatkan teks dengan `paddingHorizontal: spacing.xl`; teks isi 2 baris pada layar 360 dp. Tidak ada risiko.

---

## 3. F8: peringatan kas kurang di Bayar tuan rumah

Berkas: `src/app/periods/[id]/payout.tsx`.

| Baris | Teks lama | Teks baru |
|---|---|---|
| 201 | `Saldo sekarang: {Tunai} Rp.., Tunai + Debit Rp..` | `Saldo sekarang: {Tunai} Rp50.000. Total kas (Tunai + Debit): Rp120.000.` (templat: `` `Saldo sekarang: ${ACCOUNT_LABELS[preview.account]} ${formatRupiah(preview.accountBefore)}. Total kas (Tunai + Debit): ${formatRupiah(preview.kasBefore)}.` ``) |
| 206 (Notice kasShort) | `Peringatan: Tunai + Debit (Rp..) lebih kecil dari uang keluar bersih Rp... Pembayaran penuh ke tuan rumah Rp.., dipotong dari bayaran tuan rumah Rp... Tetap bisa disimpan.` | `Peringatan: Total kas (Tunai + Debit) Rp50.000 lebih kecil dari uang keluar bersih Rp90.000. Tetap bisa disimpan.` (templat: `` `Peringatan: Total kas (Tunai + Debit) ${formatRupiah(preview.kasBefore)} lebih kecil dari uang keluar bersih ${formatRupiah(preview.netCash)}. Tetap bisa disimpan.` ``) |
| 211 (Notice accountShort) | sudah baik | tetap. Pindahkan saldo di Catat kas bila perlu: kalimat lama `pindahkan saldo dulu jika perlu` tetap. |
| 117 (teks tambahan di dialog Bayar) | `Peringatan: saldo kas kurang, lihat peringatan di layar. Tetap bisa disimpan.` | Sebut alasannya di dialog, jangan menyuruh melihat layar. Jika `preview.kasShort`: `Peringatan: Total kas (Tunai + Debit) lebih kecil dari uang keluar bersih. Tetap bisa disimpan.` Jika hanya `preview.accountShort`: `Peringatan: saldo ${ACCOUNT_LABELS[preview.account]} lebih kecil dari uang keluar bersih, jadi akan menjadi minus. Tetap bisa disimpan.` |

Kalimat kedua baris 206 dibuang karena `Rincian` di atasnya sudah menampilkan pembayaran penuh dan potongan (baris 184-187); hanya mengulang angka.

Saran tampilan, hanya bila developer membenarkannya di `src/domain/payout.ts`: `kasShort` hampir selalu berarti `accountShort` juga benar, sehingga dua Notice kuning bertumpuk menyampaikan hal yang sama. Bila terbukti, tampilkan Notice `accountShort` hanya jika `!preview.kasShort` (kondisi tampilan, bukan perhitungan). Bila ragu, biarkan keduanya.

Layout: baris 206 menjadi sekitar setengah panjang sebelumnya. Baris 201 sedikit lebih panjang (muat 2 baris di `styles.muted`). Tidak ada risiko.

---

## 4. F9-F10: halaman Cadangan dan ekspor

### 4a. Judul bagian "Pulihkan atau mulai dari nol" (backup/index.tsx:120-128)
Masalah: judul menjanjikan dua hal, padahal di halaman ini hanya ada satu baris ("Pulihkan data"). "Mulai dari nol" ada di halaman berikutnya (`restore.tsx:293`). Baris dan judul memakai kata yang sama dua kali.

| Elemen | Lama | Baru |
|---|---|---|
| `SectionHeader` (baris 120) | `Pulihkan atau mulai dari nol` | `Pulihkan data` |
| `ListRow` title (baris 124) | `Pulihkan data` | `Pulihkan dari cadangan` |
| `right` (baris 126) | `<RowText>Dari cadangan</RowText>` | dihapus (sudah jelas dari judul baris) |
| Baris teks baru di bawah `ListRow` (`styles.caption`) | tidak ada | `Mulai dari nol, untuk menghapus semua data, ada di halaman yang sama.` |
`ONE_PHONE_HINT` (baris 122) tetap.

Layout: judul lebih pendek. Baris `ListRow` kehilangan teks kanan sehingga judul punya ruang penuh. Satu caption baru 1-2 baris.

### 4b. `CSV_HINT` (backupLabels.ts:18-19, ~400 karakter dalam satu kotak): dipecah dua
1. `CSV_HINT` (tetap di `Notice` info, baris 104) dipendekkan menjadi tiga kalimat pendek (sekitar 150 karakter):
   `Berkas CSV hanya untuk dibaca di Excel atau Google Sheets. Bukan cadangan dan tidak bisa dipakai untuk memulihkan data. Isinya memuat nama dan uang anggota.`
2. Konstanta baru `CSV_LEDGER_HINT` di `backupLabels.ts`, satu kalimat, tampil sebagai teks kecil (`styles.caption`) tepat di bawah tombol "Buku kas", bukan di dalam Notice:
   `Masuk dan Keluar mengikuti perubahan Tunai + Debit untuk semua jenis catatan: pinjaman di Keluar, pelunasan di Masuk, sedangkan pindah saldo, tunggakan ditanggung kas, dan saldo awal Piutang ada di Tanpa perubahan kas.`
   Nama kolom "Masuk", "Keluar", "Tanpa perubahan kas" tidak diubah (sesuai `csvFiles.ts:24-26`, keputusan pemilik 2026-11-12). Kalimat ini mencerminkan `csvAmountColumns` (`src/domain/flow.ts:88`).
3. Cara menampilkan: tambahkan field opsional `detail?: string` pada `CsvFileSpec` (`csvFiles.ts:155`) dan isi `detail: CSV_LEDGER_HINT` hanya untuk `buku-kas` (baris 164); `backup/index.tsx:113` menampilkan `spec.detail` sebagai caption kedua bila ada. Hint pendek `Semua catatan kas, termasuk koreksi.` tetap.
   Catatan: `csvFiles.ts` tidak boleh mengimpor dari `backupLabels.ts` jika itu membuat impor melingkar; taruh `CSV_LEDGER_HINT` di `csvFiles.ts` bila perlu dan ekspor ke `backup/index.tsx`.

Layout: kalimat `CSV_LEDGER_HINT` sekitar 215 karakter, kira-kira 4 baris pada `type.secondary` di layar 360 dp. Itu panjang untuk caption; alternatif bila pemilik keberatan: tampilkan sebagai `Notice` info kecil bertajuk `Cara membaca Buku kas` di atas tombol Buku kas. Saran peninjau: caption, karena hanya relevan untuk satu berkas.

### 4c. "Bayar di muka" vs "Dibayar di muka": pilih "Dibayar di muka"
Alasan: cocok dengan label lain bergaya pasif di aplikasi ("Sudah dibayar", "Belum dibayar", `EXPECTED_LABELS.prepaid`), dan sudah punya penjelasan di Laporan.
- `src/app/periods/[id]/payments.tsx:123`: `Bayar di muka: ...` menjadi `Dibayar di muka: ...`
- `src/app/periods/[id]/members/[memberId].tsx:64`: `Bayar di muka: ...` menjadi `Dibayar di muka: ...`
- `src/ui/reportLabels.ts:102`: tetap `Dibayar di muka`.
Layout: +2 karakter, tidak ada risiko.

### 4d. "Menu bagikan" ambigu
"Menu bagikan" adalah jendela berbagi bawaan Android; pemilik tidak mengenalnya dengan nama itu. Pakai kata kerja "membagikan" yang sama dengan tombol "Bagikan".
- `src/app/backup/index.tsx:75` (toast): lama `Menu bagikan ditutup. Pastikan cadangan terkirim.` baru `Pastikan cadangan benar-benar terkirim.` (aplikasi tidak tahu apakah terkirim, jadi tidak menyebut "ditutup"; cocok dengan `lastSharedText`).
- `src/ui/errors.ts:112` (`share_unavailable`): lama `Menu bagikan tidak tersedia di HP ini.` baru `Fitur berbagi tidak tersedia di HP ini, jadi berkas tidak bisa dikirim.`
  `share_unavailable` dipakai untuk cadangan, CSV, dan salinan pengaman, sehingga kata "berkas" dipilih.
Layout: toast sekarang lebih pendek. Pesan galat sedikit lebih panjang (2 baris di Notice danger). Tidak ada risiko.

---

## 5. N1-N6

### N1. "Penghapusan tunggakan" menjadi "Tunggakan ditanggung kas"
Alasan (tinjauan N1): kata "penghapusan" terdengar seperti anggota dibebaskan dari utang; nama baru menyebut siapa yang menanggung. Nama jenis dan label di semua tempat berikut:

| Berkas:baris | Lama | Baru |
|---|---|---|
| `src/ui/kasLabels.ts:16` (`TYPE_LABELS.debt_writeoff`) | `Penghapusan tunggakan` | `Tunggakan ditanggung kas` |
| `src/ui/reportLabels.ts:16` (`EVENT_LABELS.writeoff`) | `Penghapusan tunggakan` | `Tunggakan ditanggung kas` |
| `src/ui/reportLabels.ts:76` (`eventLines`, writeoff) | `Ditanggung kas saat periode berakhir. Tidak mengubah saldo kas.` | `Dihapus dari catatan anggota saat periode berakhir. Tidak mengubah saldo kas.` (judul sudah menyebut "ditanggung kas", jadi tidak diulang) |
| `src/app/reports/period/[id]/index.tsx:56` (label dan hint) | `Penghapusan tunggakan` / `Ditanggung kas, tidak mengubah saldo.` | `Tunggakan ditanggung kas` / `Dihapus saat periode berakhir. Tidak mengubah saldo kas.` |
| `src/ui/csvFiles.ts:128` (`PERIOD_HEADER`) | `Penghapusan tunggakan (Rp)` | `Tunggakan ditanggung kas (Rp)` |
| `src/ui/kasLabels.ts:60`, `src/ui/history.ts:57` | `Tidak mengubah saldo kas` | tetap |
| `src/app/(tabs)/riwayat.tsx:100` | `...saldo awal, penghapusan tunggakan, serta catatan yang sudah dikoreksi.` | `...saldo awal, tunggakan ditanggung kas, serta catatan yang sudah dikoreksi.` |
| `src/app/kas/[entryId].tsx:194` | `Catatan ini tidak bisa dikoreksi. Penghapusan tunggakan dan pengembalian titipan bersifat final.` | `Catatan ini tidak bisa dikoreksi. Tunggakan ditanggung kas dan pengembalian titipan bersifat final.` |
| `src/app/periods/[id]/close.tsx:96` (dialog) | `Tunggakan Rp.. dari N anggota akan dihapus dan ditanggung kas.` | `Tunggakan Rp.. dari N anggota akan ditanggung kas dan dihapus dari catatan anggota.` |
| `src/app/periods/[id]/close.tsx:143` (label) | `Tunggakan dihapus (ditanggung kas)` | `Tunggakan ditanggung kas` |
| `src/app/periods/[id]/close.tsx:150-151` (hint) | `...Sisanya dihapus, satu catatan per anggota. Penghapusan tidak mengubah saldo kas.` | `...Sisanya ditanggung kas, satu catatan per anggota. Ini tidak mengubah saldo kas.` |
| `src/app/periods/[id]/close.tsx:165` (per anggota) | `Dipakai dari titipan Rp.., dihapus Rp.., sisa titipan Rp..` | `Dipakai dari titipan Rp.., ditanggung kas Rp.., sisa titipan Rp..` |
| `src/ui/gallery/SectionB.tsx:165` (keterangan) | `...penghapusan tunggakan...` | `...tunggakan ditanggung kas...` |
| `src/ui/backupLabels.ts:19` | `penghapusan tunggakan` | diganti oleh `CSV_LEDGER_HINT` di item 4b (sudah memakai nama baru) |

Layout: label jenis baru (24 karakter) sama panjang dengan `Pengembalian titipan anggota` (28), lebih pendek dari yang terpanjang di `HistoryRow`; tidak ada risiko baru. Kolom `PERIOD_HEADER` hanya panjang header CSV. `close.tsx:165` bertambah sekitar 8 karakter; baris itu sudah membungkus ke 2 baris.

Istilah sisa di kode (`writeoff`, `debt_writeoff`) tidak pernah tampil dan tidak diubah.

### N2. Subtitel "Kas seharusnya"
- `src/ui/reportLabels.ts`: tambah `export const EXPECTED_SUBTITLE = 'Perkiraan kas bila semua tunggakan dilunasi dan semua titipan anggota dikembalikan.'`
- `src/app/(tabs)/laporan.tsx`: tampilkan sebagai `<Text style={styles.hint}>` tepat di bawah `SectionHeader` (baris 49), di atas `Card` (baris 50). Nama `Kas seharusnya` dan `EXPECTED_FORMULA` (baris 65) tidak diubah (D4).
Layout: +2 baris teks kecil di atas kartu. Tidak ada risiko.

### N3. Penjelasan Koreksi (satu tempat)
Satu kalimat di `src/ui/components/CorrectionForm.tsx`, ditampilkan di dalam kotak koreksi tepat di atas kolom `Alasan koreksi (wajib)` (di atas baris 51). Komponen ini dipakai di tiga tempat (`kas/[entryId].tsx:156`, `payout.tsx:146`, `members/[memberId].tsx:119`), sehingga cukup satu perubahan.
Teks: `Koreksi membatalkan catatan ini. Catatan lama tetap terlihat, ditandai Dikoreksi, dan tidak dihitung.`
Gaya: `type.secondary`, `colors.textSecondary`. Dialog konfirmasi (`message`) tidak diubah: tiap layar sudah punya pesan sendiri.
Layout: kotak koreksi (latar `errorTint`) bertambah 2-3 baris; sudah di dalam ScrollView.

### N4. "tur" menjadi "wisata"
- `src/app/kas/new.tsx:48`: `Pengeluaran untuk tujuan bersama, misalnya wisata. Catatan wajib diisi.`
- `src/app/kas/new.tsx:320` (placeholder): `Contoh: DP wisata ke Bali`
- `src/ui/gallery/SectionE.tsx:84`: `Contoh: DP wisata ke Bali`
- Data tes yang berisi `'tur'` sebagai isi catatan (`kasLabels.test.ts:16`, `kas.test.ts`, `db/kas.test.ts`, `close.test.ts:485`, `csvFiles.test.ts:94`) hanya contoh isian bebas; tidak wajib diubah.
Layout: placeholder 1 karakter lebih panjang dari sebelumnya; tidak ada risiko.

### N5. Halaman "Istilah"
- Route: `src/app/istilah.tsx` (path `/istilah`). Daftarkan di `src/app/_layout.tsx`: `<Stack.Screen name="istilah" options={{ title: 'Istilah' }} />`.
- Isi (data) di `src/ui/glossary.ts` sebagai array `{ group, term, meaning }` supaya bisa dites; halaman hanya merender. Tanpa dependensi baru, tanpa pencarian, tanpa lipat-buka.
- Menu: di `src/app/(tabs)/menu.tsx`, tambahkan grup baru setelah grup `Data` (setelah baris 95): `<Group title="Bantuan">` berisi `<MenuRow label="Istilah" icon="book-outline" onPress={() => router.push('/istilah')} />`.
- Tampilan: `ScrollView`, tiap kelompok memakai `SectionHeader`; di bawahnya satu `Card` per kelompok, tiap istilah satu blok: istilah tebal (`type.bodyStrong`), arti di bawahnya (`type.body`), jarak `spacing.sm` antar blok, tanpa pemisah garis. Kalimat pembuka di atas: `Arti kata yang dipakai di Mas Catat.`

Daftar lengkap (teks final). Bagian "Kas dan uang":

| Istilah | Arti |
|---|---|
| Kas | Uang bersama kelompok. Bertambah Rp5.000 per anggota di setiap pertemuan. |
| Total kas | Uang kas yang ada sekarang, yaitu Tunai ditambah Debit. Piutang tidak dihitung. |
| Tunai | Uang kertas atau koin yang dipegang pengurus. |
| Debit | Uang kas di rekening bank atau dompet digital. |
| Tempat uang | Tempat uang kas disimpan, yaitu Tunai atau Debit. |
| Piutang (dipinjam anggota) | Uang kas yang sedang dipinjam anggota dan belum kembali. Belum ada di tangan, jadi tidak masuk Total kas. |
| Pindah saldo | Memindahkan uang antara Tunai dan Debit, ke dua arah. Total kas tidak berubah. |
| Saldo awal | Uang yang sudah ada sebelum aplikasi dipakai. Dicatat satu kali di awal. |
| Pengeluaran bersama | Uang kas yang dipakai untuk keperluan bersama, misalnya wisata. Catatan wajib diisi. |
| Pinjaman | Uang kas yang dipinjamkan ke anggota. Tanpa bunga dan tanpa batas waktu. |
| Pelunasan pinjaman | Anggota mengembalikan sebagian atau seluruh pinjaman. Uangnya masuk ke Tunai. |
| Sisa pinjaman | Pinjaman dikurangi yang sudah dikembalikan, dihitung dari semua periode. |
| Kas seharusnya | Perkiraan kas bila semua tunggakan dilunasi dan semua titipan dikembalikan. Rumus: Total kas + tunggakan iuran - titipan anggota. |

Bagian "Iuran dan tuan rumah":

| Istilah | Arti |
|---|---|
| Iuran | Rp15.000 yang dibayar setiap anggota di setiap pertemuan, termasuk tuan rumah. |
| Kelipatan Rp15.000 | Pembayaran harus Rp15.000, Rp30.000, Rp45.000, dan seterusnya. Pembayaran sebagian tidak diterima. |
| Tunggakan | Iuran pertemuan yang belum dibayar anggota. |
| Dibayar di muka | Iuran pertemuan yang belum berjalan tetapi sudah dibayar. |
| Titipan | Kelebihan pembayaran anggota di atas iuran periode. Dipakai otomatis untuk iuran periode berikutnya, atau dikembalikan bila anggota tidak ikut. |
| Pengembalian titipan | Titipan dikembalikan ke anggota yang tidak ikut periode berikutnya. Tidak bisa dikoreksi. |
| Pertemuan | Satu kali berkumpul di rumah tuan rumah. |
| Tuan rumah | Anggota yang rumahnya dipakai untuk pertemuan itu. Menerima bayaran tuan rumah. |
| Bayaran tuan rumah | Uang untuk tuan rumah: Rp10.000 dikali jumlah anggota. |
| Pembayaran tuan rumah | Pencatatan bahwa bayaran sudah diberikan ke tuan rumah. |
| Dipotong dari bayaran tuan rumah | Tunggakan iuran tuan rumah yang diambil dari bayarannya, jadi uang yang diterima lebih kecil. |
| Lunas lewat potongan | Iuran yang lunas karena dipotong dari bayaran tuan rumah. |
| Lunas lewat titipan | Iuran yang lunas karena memakai titipan anggota. |
| Baru sebagian | Iuran pertemuan itu baru terbayar sebagian, lewat titipan atau potongan. |
| Tutup pertemuan | Menandai pertemuan selesai. Setelah itu catatannya hanya bisa dikoreksi. |

Bagian "Periode dan anggota":

| Istilah | Arti |
|---|---|
| Periode | Satu putaran penuh: berlangsung sampai setiap anggota menjadi tuan rumah satu kali. |
| Aktif | Periode yang masih berjalan. Hanya boleh ada satu. |
| Berakhir | Periode yang sudah ditutup. Catatannya tersimpan dan hanya bisa dilihat. |
| Akhiri periode | Menutup periode. Tunggakan yang tersisa ditanggung kas. Tidak bisa dibatalkan. |
| Tunggakan ditanggung kas | Iuran yang tidak dibayar sampai periode berakhir. Dihapus dari catatan anggota dan ditanggung kas, tanpa mengubah saldo kas. |
| Arsipkan anggota | Menyembunyikan anggota dari daftar dan pilihan baru. Riwayatnya tetap ada dan bisa diaktifkan lagi. |
| Hapus anggota | Menghapus anggota yang belum punya catatan apa pun. Tidak bisa dibatalkan. |

Bagian "Catatan dan cadangan":

| Istilah | Arti |
|---|---|
| Catat kas | Halaman untuk mencatat saldo awal, pindah saldo, pinjaman, pelunasan, dan pengeluaran bersama. |
| Riwayat | Daftar semua uang masuk dan keluar, dari yang terbaru. |
| Koreksi | Cara memperbaiki catatan yang salah. Catatan lama ditandai Dikoreksi dan tidak dihitung, lalu dicatat yang benar. Catatan lama tidak dihapus. |
| Dikoreksi | Catatan lama yang sudah dibatalkan oleh koreksi. |
| Berlaku | Catatan yang masih berlaku dan dihitung. |
| Tanpa perubahan kas | Catatan yang tidak mengubah Tunai + Debit, seperti pindah saldo dan tunggakan ditanggung kas. Kolom ini ada di berkas CSV Buku kas. |
| Cadangan | Salinan semua data Mas Catat yang disimpan terpisah, agar aman bila HP hilang. |
| Salinan pengaman | Salinan otomatis sebelum data diganti, supaya bisa dikembalikan bila ada masalah. |
| Pulihkan | Mengganti semua data di HP ini dengan isi berkas cadangan. Data tidak digabung. |
| Mulai dari nol | Menghapus semua data dan memulai kosong. Salinan pengaman dibuat lebih dulu. |
| Berkas CSV | Tabel untuk dibuka di Excel atau Google Sheets. Bukan cadangan dan tidak bisa dipulihkan. |

Kata yang tidak boleh muncul di halaman ini: `pos`, `entri`, `file`, `database`, `transfer`, `payout`, `Anda`, `Kalau`, `tur`. Tambah tes sederhana di `glossary.test.ts` yang memeriksa itu, dan bahwa tiap istilah punya arti tak kosong.
Layout: 46 blok, daftar panjang yang digulir; satu kolom, tidak ada risiko terpotong selama `Text` tidak diberi `numberOfLines`. Cek di font besar bahwa tidak ada baris yang terlalu sempit.

### N6. "Sudah dibayar" menjadi "Sudah dikembalikan" (baris pinjaman)
- `src/app/kas/[entryId].tsx:97`: `<DetailRow label="Sudah dibayar" ...>` menjadi `label="Sudah dikembalikan"`
- `src/app/loans/[memberId].tsx:49`: `<ReportLine label="Sudah dibayar" ...>` menjadi `label="Sudah dikembalikan"`
`Sudah dibayar` untuk iuran dan bayaran tuan rumah (`payout.tsx:135`, `(tabs)/index.tsx:393`) tetap.
Layout: `DetailRow` memberi nilai di kanan, label tidak menyusut (`kas/[entryId].tsx:207`). Label baru 18 karakter (lama 13): pada layar 320 dp dan font besar, nilai `Rp100.000` bisa jatuh ke baris berikutnya. Cek di perangkat.

---

## 6. Pesan galat umum: satu pesan per konteks

Temuan: `GENERIC_SAVE_ERROR` (`errors.ts:18`, `Catatan belum tersimpan. Coba lagi.`) adalah nilai bawaan `toIndonesian(e)` untuk SEMUA konteks selain `'load'`. Akibatnya dipakai di konteks yang bukan "menyimpan catatan". Hasil grep `toIndonesian(`:

| Konteks | Pemanggil (berkas:baris) | Salah karena |
|---|---|---|
| Arsipkan anggota | `members/index.tsx:123` (cek pemblokir), `:140` | tidak ada "catatan" yang disimpan |
| Aktifkan kembali anggota | `members/index.tsx:154` | idem |
| Hapus anggota | `members/index.tsx:106` | idem |
| Bagikan cadangan / berkas CSV | `backup/index.tsx:54` | tidak ada penyimpanan sama sekali |
| Bagikan salinan pengaman | `backup/restore.tsx:155` (judul dialog `Gagal membagikan`) | idem |
| Periksa berkas cadangan | `backup/restore.tsx:97` | tidak ada "catatan"; data tidak disentuh |
| Pulihkan data | `backup/restore.tsx:165` | paling serius: data HP bisa sudah berubah |
| Hitung rincian (pratinjau) | `payout.tsx:82`, `pay.tsx:113`, `kas/new.tsx:217` (lewat `errorText`), `credits/index.tsx:70` | pratinjau tidak menyimpan apa-apa |
| Tutup pertemuan | `(tabs)/index.tsx:149`, `periods/[id]/index.tsx:72` | tindakan, bukan catatan |
| Akhiri periode | `close.tsx:85` | idem |
| Koreksi | `components/CorrectionForm.tsx:41` | koreksi menambah catatan, catatan asli tidak berubah |
| Pengembalian titipan | `credits/index.tsx:84` | uang |

Perubahan: perluas `ErrorContext` di `errors.ts:21` dan ganti satu konstanta menjadi peta konteks ke teks. Hanya galat yang tidak dikenal memakai teks konteks; galat yang dikenal (`RULES`, `BackupError`, `MemberArchiveError`, `HostPayoutStandsError`, `MigrationError`) tetap dipetakan lebih dulu dan tidak berubah. Pemanggil mengirim konteksnya: `toIndonesian(e, 'archive')` dan seterusnya.

```
export type ErrorContext =
  | 'load' | 'save' | 'preview' | 'archive' | 'unarchive' | 'delete_member'
  | 'close_week' | 'close_period' | 'correct' | 'refund'
  | 'share' | 'share_safety' | 'restore_check' | 'restore';
```

| Konteks | Teks final |
|---|---|
| `load` (sudah ada, tidak berubah) | `Terjadi kesalahan yang tidak dikenal. Coba lagi. Jika tetap gagal, tutup aplikasi sepenuhnya lalu buka lagi. Data tidak berubah.` |
| `save` (bawaan; pembayaran, tuan rumah, periode baru, nama anggota, catatan kas) | `Catatan belum tersimpan. Tidak ada data yang berubah. Coba lagi. Jika tetap gagal, tutup aplikasi sepenuhnya lalu buka lagi.` |
| `preview` | `Rincian belum bisa dihitung. Belum ada yang tersimpan. Ubah isian atau buka ulang halaman ini, lalu coba lagi.` |
| `archive` | `Anggota belum diarsipkan. Tidak ada data yang berubah. Coba lagi.` |
| `unarchive` | `Anggota belum diaktifkan lagi. Tidak ada data yang berubah. Coba lagi.` |
| `delete_member` | `Anggota belum dihapus. Tidak ada data yang berubah. Coba lagi.` |
| `close_week` | `Pertemuan belum ditutup. Tidak ada data yang berubah. Coba lagi.` |
| `close_period` | `Periode belum diakhiri. Tidak ada data yang berubah. Coba lagi. Jika tetap gagal, tutup aplikasi sepenuhnya lalu buka lagi.` |
| `correct` | `Koreksi belum tersimpan. Catatan asli tidak berubah. Coba lagi.` |
| `refund` | `Pengembalian belum tersimpan. Tidak ada uang yang dicatat keluar. Coba lagi.` |
| `share` | `Berkas belum bisa dibagikan. Data di HP ini tidak berubah. Coba lagi. Jika tetap gagal, tutup aplikasi sepenuhnya lalu buka lagi.` |
| `share_safety` | `Salinan pengaman belum bisa dibagikan, tetapi tetap tersimpan di HP ini.` |
| `restore_check` | `Berkas belum bisa diperiksa. Data di HP ini tidak berubah. Coba lagi, atau pilih berkas cadangan yang lain.` |
| `restore` | `Pemulihan tidak selesai karena kesalahan yang tidak dikenal. Data di HP ini kemungkinan belum berubah, tetapi belum bisa dipastikan. Periksa Beranda dan Laporan. Jika ada angka yang janggal, buka Pulihkan data dan pilih salinan pengaman terbaru.` |

Pemetaan pemanggil:
- `members/index.tsx:106` -> `'delete_member'`; `:123`, `:140` -> `'archive'`; `:154` -> `'unarchive'`.
- `backup/index.tsx:54` -> `'share'`; `restore.tsx:155` -> `'share_safety'`; `restore.tsx:97` -> `'restore_check'`; `restore.tsx:165` -> `'restore'`.
- `restore.tsx:167` hanya terjadi untuk `safety_failed` dan `busy` (galat yang dikenal, lihat `restoreErrorNeedsReload`); tidak memakai teks umum, tidak perlu konteks.
- `payout.tsx:82`, `pay.tsx:113`, `kas/new.tsx:217`, `credits/index.tsx:70` -> `'preview'`. `kas/new.tsx:179` (`errorText`) dipakai oleh `save` dan `submit`; beri `errorText` parameter konteks (`'save'` dari `save`, `'preview'` dari `submit`).
- `(tabs)/index.tsx:149`, `periods/[id]/index.tsx:72` -> `'close_week'`; `close.tsx:85` -> `'close_period'`; `CorrectionForm.tsx:41` -> `'correct'`; `credits/index.tsx:84` -> `'refund'`.
- Sisanya (`payout.tsx:105`, `pay.tsx:88`, `payments.tsx:73`, `meetings/[number].tsx:93`, `periods/new.tsx:119`, `members/index.tsx:52,64`) tetap `'save'` (bawaan).

Dasar klaim "data tidak berubah" (sudah dicek di kode, jangan dilonggarkan tanpa cek ulang):
- Semua penulisan memakai `db.transaction` (`members.ts:146-166`, `periods.ts:225`, `weeks.ts:206,231,274`, `credits.ts:149`), jadi galat berarti penulisan dibatalkan.
- Periksa berkas cadangan (`prepareRestore`, `db/backup.ts:271`) bekerja di salinan memori; data HP tidak disentuh.
- Pulihkan (`commitRestore`, `db/backup.ts:418-497`): salinan pengaman dibuat dan diverifikasi sebelum data diganti; kegagalan setelah itu dibatalkan otomatis (`rolled_back`), dan hanya jika pemulihan balik gagal juga dilempar `restore_failed`. Galat TIDAK DIKENAL yang lolos hampir pasti terjadi sebelum data disentuh (`serializeLive`, `summarizeDb`), tetapi kodenya tidak membuktikannya, dan layar sudah memuat ulang semuanya untuk keadaan ini (`restoreErrorNeedsReload`). Karena itu teks `restore` sengaja berhati-hati ("kemungkinan belum berubah, tetapi belum bisa dipastikan") dan TIDAK mengklaim "data tidak berubah".
- Keputusan untuk pemilik/developer (opsional): bila `serializeLive` dan `summarizeDb` dibungkus menjadi `BackupError('safety_failed')` (perubahan kecil di `db/backup.ts`, bukan teks), teks `restore` bisa tegas "Data tidak berubah". Hanya disarankan, bukan bagian batch teks.

Layout: pesan `restore` paling panjang (sekitar 250 karakter) dan tampil di `Alert` (native, menggulir sendiri); pesan `close_period` dan `share` sekitar 130 karakter di Notice. Tidak ada risiko terpotong; Alert Android tidak membatasi baris.

---

## 7. Daftar tes yang mengunci teks (developer perbarui)

Semua jalur dari `src/`. Ketika teks berubah, tes ikut disesuaikan (D12).

| Tes | Baris | Masalah | Tindakan |
|---|---|---|---|
| `src/ui/errors.test.ts` | 83-87, 93 | memakai `GENERIC_SAVE_ERROR` dan mengunci teks literal `Catatan belum tersimpan. Coba lagi.` | perbarui literal baris 93; tambah tes per konteks (tiap konteks mengembalikan teks sendiri untuk `new RepositoryError('something new')` dan `new Error('raw')`; `'load'` tidak berubah; tidak ada teks konteks yang memuat `Anda`, `Kalau`, `file`) |
| `src/ui/errors.test.ts` | 117-126 | `it.each(codes)` membandingkan dengan `BACKUP_ERROR_TEXT` | otomatis ikut; tambahkan pengecekan bahwa `share_unavailable` tidak memuat `Menu bagikan` |
| `src/ui/backupLabels.test.ts` | 25-27 | `CSV_HINT` harus memuat `Pindah saldo Tunai dan Debit` dan `Tanpa perubahan kas` | `CSV_HINT` harus memuat `bukan cadangan`; teks baru memakai `Bukan cadangan` (huruf besar), jadi ubah ke `/bukan cadangan/i`; pindahkan dua pengecekan lainnya ke `CSV_LEDGER_HINT` (`Tanpa perubahan kas`, `pinjaman di Keluar`, `pelunasan di Masuk`) |
| `src/ui/backupLabels.test.ts` | 83 | daftar teks untuk uji kata `kredit` | tambahkan `CSV_LEDGER_HINT` |
| `src/ui/reportLabels.test.ts` | 30-42, 77 | uji `kredit` memakai `EXPECTED_LABELS`; baris 77 `toContain('Tidak mengubah saldo kas')` | baris 77 tetap lolos dengan teks baru (masih memuat frasa itu); tambahkan `EXPECTED_SUBTITLE` ke daftar baris 31-40; tambahkan `expect(EVENT_LABELS.writeoff).toBe('Tunggakan ditanggung kas')` |
| `src/ui/kasLabels.test.ts` | 53 area | mengunci `TYPE_LABELS.credit_refund` | tetap; tambahkan `expect(TYPE_LABELS.debt_writeoff).toBe('Tunggakan ditanggung kas')` |
| `src/ui/csvFiles.test.ts` | 104 | `byType('Penghapusan tunggakan')` | ganti ke `'Tunggakan ditanggung kas'`. PERHATIAN: bila tidak diganti, perulangan `for` di atas daftar kosong dan tes tetap LOLOS tanpa memeriksa apa pun. Tambahkan `expect(rows.length).toBeGreaterThan(0)` sebelum perulangan |
| `src/ui/csvReconcile.qa.test.ts` | 79 | `r[1] === 'Penghapusan tunggakan'` | ganti sama; periksa juga daftar tidak kosong (alasan yang sama) |
| `src/ui/csvFiles.test.ts` | 207 | `table[0]` sama dengan `[...PERIOD_HEADER]` | otomatis ikut perubahan header; tambahkan satu pengecekan bahwa header memuat `Tunggakan ditanggung kas (Rp)` |
| `src/ui/components/truncation.qa.test.tsx` | 70, 72 | `ErrorState` dan `ListRow` dengan teks panjang | tetap lolos (prop `title` opsional); tambahkan satu kasus `ErrorState` dengan `title` panjang |
| `src/ui/glossary.test.ts` | baru | halaman Istilah | tiap istilah punya arti; tidak memuat kata terlarang (bagian N5) |

Tes yang menyebut `tur` sebagai isi catatan (`kasLabels.test.ts:16`, `domain/kas.test.ts:135,161`, `db/kas.test.ts`, `db/close.test.ts:485`, `csvFiles.test.ts:94`) adalah data bebas; tidak terkait teks antarmuka dan tidak perlu diubah.
Tidak ada tes yang mengunci `Bayar di muka`, `Menu bagikan ditutup`, `Data tidak bisa dibuka`, `Sudah dibayar` (kecuali data uji pada `truncation.qa.test.tsx:70`, tidak terpengaruh), `Pulihkan atau mulai dari nol`, atau teks `payout.tsx`.

---

## 8. Ringkasan teks lama dan baru (untuk centang developer)

| # | Berkas:baris | Lama | Baru |
|---|---|---|---|
| 1 | `credits/index.tsx:64` | `...TIDAK bisa dikoreksi atau dibatalkan...` | `Pengembalian ini final: tidak bisa dikoreksi atau dibatalkan. Periksa tempat uang dan tanggalnya.` + Notice judul `Tidak bisa dikoreksi` |
| 2 | `kas/new.tsx:109,114,117` | `ErrorState` merah | `ErrorState` berjudul sendiri (109); `EmptyState` + tombol `Buat periode` (114, 117) |
| 3 | `payout.tsx:117,201,206` | lihat bagian 3 | lihat bagian 3 |
| 4 | `backup/index.tsx:120,124,126`, `backupLabels.ts:18-19`, `csvFiles.ts:155-168`, `payments.tsx:123`, `members/[memberId].tsx:64`, `backup/index.tsx:75`, `errors.ts:112` | lihat bagian 4 | lihat bagian 4 |
| 5 | N1-N6 | lihat bagian 5 | lihat bagian 5 |
| 6 | `errors.ts:18,21,130-148` dan sekitar 20 pemanggil | satu pesan umum | 14 konteks, lihat bagian 6 |

---

## 9. Pemeriksaan untuk pemilik di HP (setelah dikerjakan)

1. Pengembalian titipan: pilih seorang anggota, baca Notice `Tidak bisa dikoreksi` dan dialog; tombol "Lanjut" masih terlihat tanpa menggulir terlalu jauh.
2. Buka Catat kas lewat tautan tanpa periode (hapus semua data lebih dulu atau pada HP uji): harus muncul `Belum ada periode` bukan judul merah; tombol `Buat periode` membuka halaman Buat periode dan Kembali tidak mengulang halaman prasyarat.
3. Bayar tuan rumah dengan Total kas lebih kecil dari uang keluar bersih: baca peringatan dan dialog; tidak ada kalimat yang hanya mengulang angka.
4. Cadangan dan ekspor: bagian `Pulihkan data`, caption Buku kas (4 baris di layar kecil), toast setelah membagikan.
5. Riwayat dan Laporan: label jenis `Tunggakan ditanggung kas` tidak terpotong di baris Riwayat; subtitel `Kas seharusnya` terbaca.
6. Menu: baris `Istilah` (grup `Bantuan`), buka dan gulir sampai bawah; periksa dengan font besar.
7. Rincian pinjaman: baris `Sudah dikembalikan` di font besar (apakah nilai jatuh ke baris berikutnya).
8. Pulihkan data dengan berkas yang bukan cadangan (galat yang dikenal) dan arsipkan anggota yang masih ikut periode aktif: pesan tetap yang lama. Galat umum konteks sulit dipicu di HP; cukup dites di jest.

## 10. Keputusan terbuka untuk pemilik

1. Bagian 2c: sepuluh pesan "tidak ditemukan" ikut diberi judul "Data tidak ditemukan"? (usul: ya, batch kecil terpisah).
2. DITUTUP 2026-11-13 (pemilik: "1-3 ikut usul"): TIDAK diubah. Notice `accountShort` tetap tampil, karena `kasShort` bisa berlaku tanpa `accountShort` saat Debit negatif, sehingga menyembunyikannya bisa menyembunyikan peringatan nyata. (Pertanyaan asli: tampilkan Notice `accountShort` hanya bila `!kasShort`?)
3. DITUTUP 2026-11-13 (pemilik: "1-3 ikut usul"): YA, sudah dibuat. Galat sebelum salinan pengaman ada dibungkus `safety_failed` di `commitRestore` (`src/db/backup.ts`); pesan menyebut "Data tidak berubah". (Pertanyaan asli: bungkus galat sebelum penyalinan pengaman menjadi `safety_failed`?)
4. Bagian 4b: kalimat `CSV_LEDGER_HINT` ditampilkan sebagai caption (usul) atau Notice kecil bertajuk `Cara membaca Buku kas`?
