# Spek: jam catat transaksi

Tanggal: 2026-11-17. Penyusun: ui-ux-designer. Status: usulan, menunggu pemilik menyetujui poin 3 dan kata final di bagian 1.
Dasar: CLAUDE.md, `src/ui/dates.ts`, `src/ui/entryDetail.ts`, `src/ui/history.ts`, `src/ui/components/HistoryRow.tsx`, `src/ui/csvFiles.ts`, `src/ui/backupLabels.ts`, `src/db/ledger.ts`, `src/db/payments.ts`, `src/db/cashCounts.ts`, `src/db/reports.ts`, dan semua layar di `src/app/` yang menampilkan transaksi. Saya membaca kode, belum melihat tampilan di HP (lihat bagian 5).

Keputusan pemilik yang dihormati: jam diambil dari `created_at` yang sudah ada; tanpa migrasi, tanpa time picker; tanggal transaksi dan aturan uang tidak berubah; `created_at` rusak atau kosong tidak menampilkan apa-apa.

## 1. Format dan kata

Kata dan bentuk final:

| Keadaan | Teks | Contoh |
|---|---|---|
| Hari catat (lokal) sama dengan tanggal transaksi | `Dicatat <jam>` | `Dicatat 19.42` |
| Beda hari, tahun sama dengan tahun tanggal transaksi (baris daftar) | `Dicatat <tgl> <bln>, <jam>` | `Dicatat 18 Nov, 19.42` |
| Beda hari, tahun beda dari tahun tanggal transaksi (baris daftar) | `Dicatat <tgl> <bln> <thn>, <jam>` | `Dicatat 2 Jan 2027, 08.15` |
| Layar rincian (kas/[entryId]) | baris `Dicatat pada`, nilai selalu tanggal penuh + jam | `18 Nov 2026, 19.42` |

Alasan:
- "Dicatat" sudah ada di rincian dan di glosarium (R16, `ui-language-review.md`), dan menjawab pertanyaan pemilik ("kapan saya mengetik ini?"). Tidak pakai "Dibuat", "Dimasukkan", atau "Pukul" sendirian: jam tanpa kata kerja bisa terbaca sebagai jam pertemuan.
- Jam: 24 jam, titik pemisah, dua digit jam ("08.15", "00.05"), tanpa "WIB" dan tanpa "pukul". Mengikuti contoh pemilik ("19.42") dan kebiasaan tulis Indonesia.
- Bentuk "tgl bln, jam" dengan koma mengikuti `datePicker.ts` ("Hari ini, 17 Nov 2026"). Tahun dihilangkan di baris daftar hanya bila sama dengan tahun tanggal transaksi, karena baris sempit (kira-kira 27 karakter per baris di 14sp) dan daftar sudah memuat tahun lewat judul hari. Rincian tidak dihemat: selalu lengkap, tidak ambigu.
- Hari catat dan jam diambil dari zona waktu perangkat saat ditampilkan. Catatan lama yang dicatat di zona waktu lain bisa tampil bergeser; wajar, tidak perlu ditangani.
- Jangan pakai `Intl` / `toLocaleTimeString`: tidak dipakai di mana pun di kode, dan hasilnya bergantung mesin JS dan locale HP. Bangun teks dari `getHours()` / `getMinutes()` seperti `todayIso()`.

Helper (di `src/ui/dates.ts`, murni, dengan tes di `src/ui/format.test.ts` atau berkas tes tanggal yang ada):

```
formatTime(d: Date): string                       // "19.42"
parseCreatedAt(createdAt: string): Date | null    // null bila bukan ISO bertanda zona
recordedAtLabel(createdAt: string, txDate: string, long?: boolean): string
   // '' bila createdAt tidak valid. long=true dipakai rincian: selalu "18 Nov 2026, 19.42".
```

`parseCreatedAt` wajib ketat: terima hanya `YYYY-MM-DDTHH:mm` yang diikuti `Z` atau offset (`new Date(...)` tidak NaN). String hanya-tanggal ("2026-01-04") atau potongan lain dianggap tidak valid, karena JS membacanya sebagai UTC tengah malam dan akan menampilkan jam palsu (07.00 di WIB). Tes yang harus ada: sama hari, beda hari satu tahun, beda tahun, 00.05, kosong, "abc", "2026-01-04" (hanya tanggal), nilai dekat tengah malam UTC (batas hari lokal).

Perilaku saat tidak valid: seluruh baris/teks "Dicatat ..." tidak dirender (bukan "Dicatat -"). Perbaikan untuk kode sekarang: `createdDate()` di `src/ui/entryDetail.ts` mengembalikan string mentah bila tidak valid, jadi baris `Dicatat pada` di rincian bisa menampilkan teks sampah. Ganti dengan `recordedAtLabel(..., true)` dan sembunyikan baris bila hasilnya kosong. `createdDate` boleh dihapus bila tidak dipakai lagi.

Pembacaan layar (TalkBack): teks yang sama dibaca apa adanya ("Dicatat 19.42"); tidak perlu label khusus.

## 2. Di mana jam tampil

Prinsip: jam adalah informasi sekunder. Selalu satu baris sendiri berukuran `type.secondary` (14sp) warna `textSecondary`, berlabel "Dicatat". Tidak pernah di baris judul dan tidak pernah di dekat angka uang. Satu baris per catatan; tidak ada elemen baru (tanpa ikon, tanpa badge, tanpa warna baru).

| # | Tempat | Tampil? | Letak | Berkas yang diubah |
|---|---|---|---|---|
| 1 | Riwayat (tab) | Ya, tiap baris | Baris ketiga di kolom teks `HistoryRow`: setelah baris "Anggota · Masuk ke Tunai", sebelum catatan, badge "Dikoreksi", dan peringatan tanpa tempat uang | `src/ui/components/HistoryRow.tsx` (tambah baris `Text` memakai `recordedAtLabel(e.createdAt, e.date)`), `src/ui/history.ts` (`historyRowLabel`: tambahkan teks "Dicatat ..." sebelum "Dikoreksi" agar TalkBack ikut membaca) |
| 2 | Riwayat, daftar bulan | Sama dengan 1 | Daftar bulan dan filter memakai komponen yang sama (`DayCard` di `src/app/(tabs)/riwayat.tsx` memakai `HistoryRow`); tidak ada perubahan lain. Header hari tetap tanggal transaksi | tidak ada selain 1 |
| 3 | Beranda, kartu "Terakhir" (3 baris) | Ya | Sama, otomatis lewat `HistoryRow`. Kartu ini tidak punya header hari, jadi jam dan "Dicatat 18 Nov, ..." justru membantu | tidak ada selain 1 |
| 4 | Rincian catatan `kas/[entryId]` | Ya, selalu penuh | Baris `Dicatat pada` yang sudah ada tetap di bawah `Tanggal`; nilainya berubah dari tanggal saja menjadi `18 Nov 2026, 19.42` | `src/app/kas/[entryId].tsx` baris 82, `src/ui/entryDetail.ts` |
| 5 | Riwayat koreksi di rincian (`ChainRow` catatan asli dan Koreksi) | Ya | Tambah satu `RowText` kedua `Dicatat ...` di bawah baris `tanggal · jumlah` / `tanggal · Alasan`. Ini jejak audit: jam catatan asli dan jam koreksinya berguna untuk membuktikan urutan | `src/app/kas/[entryId].tsx` (komponen `ChainRow`, baris 135-150) |
| 6 | Riwayat pembayaran anggota (`periods/[id]/members/[memberId]`, bagian "Riwayat pembayaran") | Ya | Baris muted tepat di bawah judul `tanggal · Rp`, sebelum "Melunasi". Untuk pembayaran yang dikoreksi tetap tampil (tanpa coret) | `src/app/periods/[id]/members/[memberId].tsx` baris ~117; **data**: `PaymentWithCredit` belum membawa `createdAt` (lihat catatan data di bawah) |
| 7 | Daftar Kas / ledger | Tidak ada daftar tersendiri. `src/app/kas/index.tsx` hanya saldo dan tombol catat; daftarnya ada di tab Riwayat (sudah 1) | tidak ada | tidak ada |
| 8 | Detail periode dan pertemuan | Tidak. `periods/[id]/index.tsx`, `periods/[id]/meetings/[number].tsx`, `periods/[id]/payments.tsx`, `reports/period/[id]/index.tsx`, `reports/period/[id]/meetings/[number].tsx` hanya memuat tanggal pertemuan, status, dan ringkasan angka; tidak ada baris transaksi | tidak ada | tidak ada |
| 9 | Bayar tuan rumah, blok "Sudah dibayar" (`periods/[id]/payout.tsx` baris 152-160) | Ya | Satu `Text` body setelah "Tanggal 17 Nov 2026, dari Tunai": `Dicatat 19.42`. Memakai `paid.payout.createdAt` (sudah ada) | `src/app/periods/[id]/payout.tsx` |
| 10 | Riwayat anggota di Laporan (`reports/period/[id]/members/[memberId]`: bagian "Riwayat" dan "Piutang (dipinjam anggota)") | Ya, untuk kejadian yang berasal dari catatan kas atau pembayaran | Baris `hint` kedua di bawah tanggal. Tidak untuk kejadian "dari titipan" / "carry over" (`credit_applications`): itu dibuat sistem saat periode ditutup atau dibuat, bukan diketik pemilik | `src/app/reports/period/[id]/members/[memberId].tsx` (baris 86 dan 107); **data**: `HistoryEntryInput` / `HistoryEvent` di `src/domain/report.ts` (baris 225, 272) dan pengisinya di `src/db/reports.ts` (baris 181-196 dan 247-257) perlu `createdAt` |
| 11 | Riwayat Pinjaman anggota (`loans/[memberId]`) | Ya | `RowText` kedua di bawah tanggal. Tidak digabung ke satu baris karena bentuk beda-hari terlalu panjang | `src/app/loans/[memberId].tsx` baris 76 (`e.createdAt` sudah ada di `LedgerListItem`) |
| 12 | Daftar Pinjaman (`loans/index.tsx`), Titipan (`credits/index.tsx`), Anggota, Periode, Laporan | Tidak. Daftar ringkasan saldo, bukan transaksi. Form pengembalian titipan memakai tanggal pilihan, bukan transaksi yang sudah tercatat | tidak ada | tidak ada |
| 13 | Riwayat Cek kas (`periods/[id]/cek-kas.tsx`, kartu per pertemuan) | Ya | Satu baris di kartu: tanggal hitung sudah ada (`formatDate(date)` baris 48), tambahkan baris muted di bawahnya `Dicatat 19.42` dari hitungan terbaru pertemuan itu. Hasil Cek kas di layar `cek-kas/index.tsx` baris 159 (tanggal hasil): tidak ditambah (pemilik baru saja mengisinya) | `src/app/periods/[id]/cek-kas.tsx`; **data**: `StoredCountLine` (`src/domain/cash-count.ts`) dan `toLine` / `COLUMNS` di `src/db/cashCounts.ts` belum membaca `created_at` (kolomnya ada, satu nilai per batch) |

Catatan data (hanya pembacaan, tanpa migrasi):
- Ledger: `createdAt` sudah di `LedgerListItem`; tidak ada perubahan.
- Pembayaran: tabel `payments` punya `created_at` tetapi `PaymentRow` dan `toPayment` tidak membacanya. Tambahkan `created_at` ke `SELECT` di `listWithCredit` dan expose sebagai `createdAt` di `PaymentWithCredit` saja (jangan ubah tipe `Payment` domain agar fungsi uang tidak tersentuh). `payments.created_at` dan `ledger_entries.created_at` dibuat dari dua panggilan `deps.now()` terpisah, jadi bisa beda beberapa milidetik; menit yang tampil praktis sama. Rincian catatan kas dan riwayat pembayaran tidak akan terlihat berbeda.
- Cek kas: baca `created_at` dari baris yang sudah dipilih; tidak menambah kueri.

Alasan tidak menampilkan di tempat lain: daftar tanpa baris transaksi tidak punya "jam catat" yang bermakna, dan menambah jam di baris ringkasan hanya menambah kebisingan.

Dampak ke tinggi baris: Riwayat dan Beranda bertambah satu baris (sekitar 20dp) per catatan; kira-kira satu baris Riwayat kurang tampil per layar. Itu harga dari "setiap transaksi" yang disetujui pemilik. Bila terasa sesak di HP, opsi yang bisa dipilih pemilik tanpa mengubah spek lain: tampilkan baris "Dicatat" di Riwayat hanya saat beda hari (catatan mundur), dan jam hanya di rincian. Jangan memilihnya sekarang kecuali pemilik menyatakannya; ini keputusan setelah dicoba di HP.

Tes yang terpengaruh: `src/ui/entryDetail.test.ts` (`createdDate`), tes `historyRowLabel`, dan fixture `src/ui/gallery/fixtures.ts` (semua `createdAt` sama `2026-01-04T10:00:00.000Z`; tambahkan satu fixture beda hari dan satu `createdAt` rusak di galeri `src/ui/gallery/SectionB.tsx` agar kedua keadaan bisa dicek di HP). Galeri komponen `docs/specs/component-gallery.md` perlu satu baris untuk variasi baru.

Ketidakkonsistenan yang perlu diputuskan: `safetyCopyLabel` di `src/ui/backupLabels.ts` (baris 110) memakai "pukul 09:05" dengan titik dua, dikunci tes `backupLabels.test.ts` baris 108. Format jam baru memakai titik. Saran: ubah salinan pengaman menjadi "pukul 09.05" dalam perubahan yang sama (satu aturan jam di seluruh aplikasi), atau pemilik memutuskan membiarkannya. Saya sarankan menyamakan. Nama berkas `pengaman-YYYYMMDD-HHMMSS` tidak berubah.

## 3. Rekomendasi ekspor CSV (jangan diubah sekarang)

Rekomendasi: ya, tambahkan satu kolom `Dicatat` (nilai penuh `2026-11-18 19:42`, zona waktu HP) di PALING KANAN Buku kas (setelah `Alasan koreksi`), dan nanti juga di CSV Pembayaran. Alasan:
- Pemilik yang memeriksa selisih kas di spreadsheet butuh urutan pencatatan nyata, terutama untuk catatan mundur. Urutan baris CSV sekarang memakai `rowid` (urutan catat), jadi kolom ini sekadar membuat urutan itu terlihat.
- Tidak menyentuh aturan D10: kolom jumlah tetap tepat satu dari Masuk / Keluar / Tanpa perubahan kas, dan `csvAmountColumns` (`src/domain/flow.ts`) tidak berubah. Jumlah Masuk - Keluar tetap sama dengan kas aktual.
- Ke CSV, gunakan format mesin, bukan "19.42": `YYYY-MM-DD HH:mm` dikenali Excel dan Google Sheets sebagai tanggal-waktu dan bisa diurutkan. Tanggal transaksi tetap `YYYY-MM-DD` tanpa jam supaya rumus lama (SUMIFS per tanggal) tidak pecah.

Risiko yang harus disebut kepada pemilik:
- Menambah kolom di tengah menggeser kolom di sebelah kanannya; spreadsheet atau rumus yang merujuk kolom berdasarkan huruf (mis. `H:H` untuk Masuk) akan salah. Karena itu kolom baru ditaruh di paling kanan, bukan di sebelah `Tanggal`.
- Pemakai yang mengimpor CSV ke tabel yang sudah ada dengan header tetap perlu tahu ada kolom baru.
- Jam bergantung zona waktu HP; CSV tidak membawa zona. Cukup untuk satu HP satu pemilik.
- Tes CSV yang mengunci `LEDGER_HEADER` (`src/ui/csvFiles.ts`) dan teks petunjuk CSV di `backupLabels.ts` perlu diperbarui. Catat sebagai keputusan di PROJECT.md bila disetujui; baris di CLAUDE.md untuk D10 tidak perlu diubah karena aturan jumlah tetap.

Keputusan yang diminta dari pemilik: tambah kolom `Dicatat` di paling kanan CSV Buku kas (dan Pembayaran)? Ya / tidak / nanti.

## 4. Urutan daftar terhadap jam catat (hanya laporan, tidak diubah)

Temuan, urut dampak:

1. **Sedang. Kartu "Terakhir" di Beranda tidak menampilkan catatan yang baru saja diketik bila tanggalnya mundur.** `listKas()` (`src/db/ledger.ts` baris 401-404) mengurutkan `ORDER BY e.date DESC, e.rowid DESC`, dan Beranda mengambil tiga pertama (`src/app/(tabs)/index.tsx` baris 132). Pembayaran bertanggal 12 Nov yang dicatat hari ini 17 Nov duduk di bawah semua catatan bertanggal 13-17 Nov, jadi tidak muncul di "Terakhir" meskipun baru saja dicatat. Setelah jam catat tampil, kartu berjudul "Terakhir" dengan baris "Dicatat 19.42" yang tidak ada di atas akan tampak salah. Pilihan untuk pemilik: (a) biarkan dan ubah judul menjadi "Catatan terbaru menurut tanggal"; (b) urutkan Beranda menurut `created_at` (urutan catat) dengan tanggal tetap ditampilkan; Riwayat tetap menurut tanggal. Saran saya (b) untuk Beranda saja, karena pertanyaan Beranda adalah "apa yang baru saya catat". Ini tidak mengubah uang.
2. **Rendah. Di dalam satu hari, Riwayat sudah benar secara urutan catat.** `e.rowid DESC` setelah `date DESC` berarti catatan yang dicatat belakangan tampil lebih atas dalam hari yang sama. Satu keadaan kecil: bayar tuan rumah menulis dua entri (bayaran lalu potongan) yang baris keduanya (potongan, rowid lebih besar) tampil di atas bayaran; wajar, tidak salah.
3. **Rendah. Arah urutan tidak seragam.** Riwayat: terbaru di atas. Riwayat Pinjaman anggota (`listLoanHistory`, baris 396): `ORDER BY e.date, e.rowid` yaitu terlama di atas. Riwayat pembayaran anggota (`listWithCredit`, `ORDER BY p.date, p.rowid`): terlama di atas. Dengan jam di tiap baris perbedaan ini lebih terlihat. Bukan salah terhadap jam; hanya kandidat penyeragaman, keputusan pemilik.
4. Catatan: urutan bergantung `rowid` (bukan `created_at`) untuk catatan hasil pemulihan cadangan. Bila `rowid` setelah pemulihan tidak mengikuti urutan catat asli, urutan dalam satu hari bisa tidak cocok dengan jam. Perlu dicek oleh developer/QA; saya tidak menemukan kode pemulihan yang menyusun ulang `rowid`.

## 5. Yang perlu dicek pemilik di HP

- Baris Riwayat dengan nama anggota panjang, catatan panjang, dan "Dikoreksi" sekaligus: apakah tiga sampai lima baris masih nyaman (fixture galeri `HISTORY_EXTREME`).
- Teks beda-hari di lebar layar sempit dan dengan ukuran huruf sistem besar: "Dicatat 18 Nov, 19.42" boleh membungkus ke baris kedua, jangan terpotong.
- Catatan mundur yang dicatat dekat tengah malam (hari catat lokal vs UTC) tampil di hari yang benar.
- Satu catatan lama (dari data nyata) menampilkan jam masuk akal; satu catatan dengan `created_at` rusak (bila ada) tidak menampilkan apa pun dan tidak error.

## Ringkasan urutan kerja untuk developer

1. `dates.ts`: `formatTime`, `parseCreatedAt`, `recordedAtLabel` + tes.
2. `entryDetail.ts` / `kas/[entryId].tsx`: baris `Dicatat pada` pakai helper; sembunyikan bila kosong; baris `Dicatat` di `ChainRow`.
3. `HistoryRow.tsx` + `historyRowLabel`: baris ketiga; otomatis ke Riwayat dan Beranda.
4. `loans/[memberId].tsx`, `payout.tsx` (sudah punya data).
5. `payments.ts` `listWithCredit` membawa `createdAt`; `members/[memberId].tsx`.
6. `report.ts` / `reports.ts` membawa `createdAt` untuk kejadian ledger dan pembayaran; layar laporan anggota.
7. `cashCounts.ts` / `cash-count.ts` membawa `created_at`; `cek-kas.tsx`.
8. Galeri dan tes diperbarui; putuskan `safetyCopyLabel`.
Semua perubahan hanya tampilan dan pembacaan; tidak ada perubahan fungsi uang di `src/domain/` selain tipe masukan laporan dan hitungan Cek kas (field tampilan saja).
