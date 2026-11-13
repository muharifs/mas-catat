# Mas Catat: spesifikasi empat pola dompet digital (usulan, belum disetujui)

Tanggal: 2026-11-09. Penulis: ui-ux-designer. Status: USULAN. Tidak ada kode yang diubah, PROJECT.md tidak diubah.
Dasar: CLAUDE.md, AGENTS.md, PROJECT.md (spek M7.2 dan "Design system v1"), `src/ui/theme.ts`, `src/ui/components/*`, layar `src/app/(tabs)/*`, `kas/new.tsx`, `periods/[id]/pay.tsx`, `src/ui/history.ts`, `src/domain/*`, lima tangkapan layar GoPay.
Yang TIDAK saya lakukan: melihat aplikasi di HP. Semua tata letak di bawah dari membaca kode dan gambar rujukan; ukuran, tampilan di teks besar, dan kenyamanan satu tangan harus dicek pemilik di HP (daftar di akhir).

Batas pola (aturan M7.2 tetap): hanya tata letak. Tidak ada nama, logo, warna merek, atau ilustrasi GoPay. Tema tetap terang (kertas + teal). Tidak ada kategori pengeluaran (keputusan 2026-11-04: pengeluaran bersama = satu catatan dengan keterangan, tanpa anggaran atau kategori), jadi ikon kategori dan "Atur budget bulanan" di rujukan TIDAK diambil.

## 0. Ringkasan keputusan yang diusulkan

| Pola | Usulan |
|---|---|
| 1 Beranda + Pengingat | Ambil. Pengingat = daftar "yang perlu dikerjakan", satu tombol per baris, dihitung oleh satu fungsi murni baru. Grid aksi cepat 8 ubin. Baris "Sudah bayar hari ini". |
| 2 Riwayat | Kartu per hari + ringkasan bulanan Pemasukan/Pengeluaran. Chip + layar Filter TETAP (bukan dropdown). Ringkasan mengikuti bulan saja, bukan filter. Perlu fungsi domain murni + tes. Membatalkan keputusan "tanpa total" milik pemilik, jadi butuh "ya" eksplisit. |
| 3 Form jumlah + keypad | `AmountKeypad` untuk `pay.tsx` dan `kas/new.tsx`. Tanpa operator. Chip kelipatan Rp15.000 tetap. Tanggal di header lewat `DateField` yang ada. Ikon hanya untuk pilihan pos/jenis. |
| 4 Grafik Laporan | Batang Masuk/Keluar 6 bulan, dibuat dari `View` (tanpa dependensi baru). Setelah M7b. |

Urutan yang disarankan: C, D (dua bagian), H (Riwayat), K (keypad, dua bagian), E (sweep), M7b, lalu G (grafik). Alasan di bagian 5.

---

## 1. Beranda + Pengingat (isi langkah D, menggabung spek Beranda M7.2)

### 1.1 Masalah yang diselesaikan
Beranda sekarang (kode `(tabs)/index.tsx`) sudah benar secara aturan, tetapi pemilik harus membaca kartu pertemuan untuk tahu apa yang harus dikerjakan. Pola rujukan: saldo besar di atas, lalu satu kartu "yang perlu dibayar/dikerjakan" dengan satu tombol per baris, lalu grid pintasan.

### 1.2 Urutan dari atas ke bawah
1. **Header kas** (bukan gambar, Card putih biasa).
2. **Pengingat**.
3. **Pertemuan berjalan** (info + satu tombol utama + baris aksi lain).
4. **Aksi cepat** (grid 4 kolom x 2 baris).
5. **Sudah bayar hari ini** (baris inisial), hanya bila ada periode aktif dengan pertemuan terbuka.
6. **Terakhir** (3 catatan) + "Lihat semua riwayat".
Langkah awal (daftar centang) tetap, tampil di atas Pengingat selama belum selesai dan Pengingat kosong karena belum ada periode (lihat 1.4, keadaan awal).

Catatan: karena Beranda jadi panjang, hanya header + Pengingat yang terlihat tanpa menggulir di HP 640dp. Itu disengaja: dua hal itu yang paling sering dicari.

### 1.3 Header kas
> CATATAN 2026-11-13 (PROJECT.md keputusan 27; rincian di `docs/specs/design-decisions-2026-11-13.md` bagian 1): bagian ini USANG. Tombol "Catat kas" dan kolom aksi samping dibuang; "Pindah saldo" turun ke bawah Tunai/Debit (terbuka A1); mata di samping angka Total kas, hanya "Rp" yang lebih kecil; pil Piutang dan Titipan dihapus; "Bulan ini" diganti satu pil "Pengeluaran". Gambar dan teks di bawah adalah rancangan lama.

```
+--------------------------------------------------+
| Total kas                       [ Pindah saldo ] |
| Rp12.345.000  (display 28)      [ Catat kas    ] |
|                                                  |
| Tunai              Debit                         |
| Rp8.000.000        Rp4.345.000   (amountL 20)    |
|                                                  |
| (Piutang Rp600.000 >)  (Titipan Rp90.000 >)      |
+--------------------------------------------------+
```
- Komponen yang dipakai ulang: `Card`, `Money` (display, large), `Button` (secondary, compact), `Ionicons`.
- Komponen baru: `PillLink` (tombol berbentuk pil bernavigasi: teks label + `Money` kecil + chevron; tinggi sentuh 48; BUKAN `Chip` karena Chip bermakna "terpilih"). Isi: label kata ("Piutang", "Titipan") + jumlah + chevron. Latar `brandTint`, teks `brandStrong`.
- Aksi samping (kanan atas, tumpuk dua): "Pindah saldo" membuka `/kas/new?kind=transfer`; "Catat kas" membuka `/kas`. Lebar kolom 128dp; angka Total memakai `flexShrink` dan `adjustsFontSizeToFit` bila terlalu panjang. Jika di HP sempit angka terpotong, jatuhkan kedua tombol ke baris sendiri di bawah Total (cek di HP).
- Keadaan nonaktif: tanpa periode sama sekali, kedua tombol nonaktif dengan alasan "Buat periode dulu." (aturan CLAUDE.md: tanpa periode catatan kas ditolak; `kas/new` memang menampilkan galat itu). Alasan tampil di bawah tombol lewat `disabledReason`; bila terlalu sempit, satu baris `secondary` di bawah kartu: "Catatan kas butuh periode. Buat periode dulu."
- Sumber angka (UI tidak menghitung uang):

| Angka | Sumber |
|---|---|
| Total kas, Tunai, Debit, Piutang | `repos.ledger.getKasBalances()` (`computeKasBalances`), sudah dipakai Beranda |
| Titipan | `repos.reports.getKasReport()` lalu `expected.creditHeld` (angka yang sama dengan baris "Titipan anggota" di Laporan). Biaya: query per anggota per periode; pada 19 anggota wajar, developer ukur di HP. Alternatif murah bila lambat: jumlahkan `repos.credits.listRefundable()`, tetapi angka itu tidak memuat titipan yang sudah dibawa ke periode baru, jadi bisa beda dari Laporan. Pilih yang sama dengan Laporan. |

- Teks: "Total kas", "Tunai", "Debit", "Piutang", "Titipan", "Pindah saldo", "Catat kas".
- Pil Titipan bernilai 0: tetap tampil dengan "Rp0" (layar tidak melompat). Pil Piutang membuka `/loans`, Titipan membuka `/credits`.
- Opsional (tidak wajib): ikon mata untuk menyembunyikan saldo. Tidak saya usulkan sekarang: HP satu orang, data lokal; tambahan state tanpa kebutuhan jelas.
- Opsional setelah langkah H: baris kecil di bawah pil, "Bulan ini: Masuk +Rp... Keluar -Rp... >" membuka Riwayat. Angkanya dari `summarizeMonth` (bagian 2).

### 1.4 Pengingat
Kartu `Card` dengan judul `SectionHeader`-gaya: "Pengingat" dan jumlah ("Pengingat (3)"). Tanpa tombol ciut (pola rujukan punya; di sini daftar pendek, tidak perlu). Tiap baris:

```
[ikon 40dp]  Judul (bodyStrong 16)            [ Tombol ]
             Keterangan (secondary 14)
```
- Komponen baru: `ReminderRow` (ikon dalam lingkaran, dua baris teks, satu `Button` variant `tertiary` compact di kanan; di layar sempit tombol turun ke bawah teks, lebar penuh, tinggi 48). Warna ikon: `warn` untuk yang mendesak, `brandStrong` untuk informasi. Kata selalu ada; ikon dan warna bukan satu-satunya penanda.
- Fungsi murni baru `src/ui/reminders.ts` (pola sama dengan `checklist.ts`, dengan tes): `homeReminders(input): Reminder[]`. UI hanya memuat fakta lalu memanggil fungsi ini; urutan dan syarat ada di fungsi, bukan di layar.

Aturan, urut dari atas (jumlah baris realistis 0 sampai 4; semua ditampilkan, tidak dipotong):

| # | Syarat (memakai aturan yang sudah ada) | Judul dan keterangan | Tombol (satu) | Tujuan | Data |
|---|---|---|---|---|---|
| 1 | Pertemuan TERTUTUP yang punya tuan rumah dan belum dibayar (menghalangi "Akhiri periode") | "Tuan rumah pertemuan N belum dibayar" / "Tutup sudah, pembayaran belum dicatat." | "Bayar tuan rumah" | `/periods/[id]/payout?week=N` | `weeks.listByPeriod` + `ledger.getWeekPayout(periodId, n)` per pertemuan tertutup (N kecil, murah) |
| 2 | Pertemuan terbuka tertua punya tuan rumah, tanggalnya hari ini atau sudah lewat, belum dibayar | "Tuan rumah pertemuan N belum dibayar" / "Tuan rumah: <nama>. Pertemuan <tanggal>." | "Bayar tuan rumah" | sama | `getWeekPayout` pertemuan terbuka (sudah dimuat Beranda) |
| 3 | Pertemuan terbuka tertua tanpa tuan rumah | "Tuan rumah pertemuan N belum ditentukan" / "Tanpa tuan rumah, pertemuan tidak bisa ditutup." | "Tentukan" | `/periods/[id]/meetings/[n]` | `week.hostMemberId === null` |
| 4 | Pertemuan terbuka tertua punya tuan rumah dan tanggalnya hari ini atau lewat | "Pertemuan N siap ditutup" / "Tanggalnya <tanggal>. Ada X anggota menunggak." (kalimat tunggakan hanya bila X > 0; menunggak hanya memperingatkan, tidak memblokir, sesuai M5c) | "Tutup pertemuan" | Alert konfirmasi yang sudah ada (`closeWeekMessage`), BUKAN langsung menutup | `arrears` dari `getArrearsSummary` |
| 5 | Pertemuan berikutnya (N+1) ada, pertemuan N sudah punya tuan rumah, N+1 belum punya tuan rumah (jendela dua pertemuan, `selectableWeekNumbers`) | "Tuan rumah pertemuan N+1 belum ditentukan" / "Tanggal sementara masih perkiraan." | "Tentukan" | `/periods/[id]/meetings/[n+1]` | `weeks` |
| 6 | Semua pertemuan tertutup | "Semua pertemuan sudah ditutup" / "Periode siap diakhiri." (bila ada tuan rumah belum dibayar, baris 1 sudah tampil di atasnya) | "Akhiri periode" (USANG 2026-11-13, keputusan 27: baris ini tidak tampil di Beranda, disaring di tampilan; tombolnya ada di kartu periode) | `/periods/[id]/close` (layar itu sudah menjelaskan alasan bila belum bisa) | `weeks` |
| 7 | `backupReminder(...).due` (aturan 7 hari, M7) | "Cadangan belum dibuat" atau "Cadangan terakhir X hari lalu" (teks dari `reminderText`) | "Buat cadangan" | `/backup` | `backupReminder` + `readLastShared()` yang sudah dipakai |

- Baris 7 menggantikan pita cadangan di atas Beranda pada spek M7.2 (pita tidak dipertahankan, supaya tidak ada dua peringatan yang sama). Itu perubahan terhadap M7.2; masuk daftar keputusan pemilik.
- Baris 7 sengaja paling bawah: kehilangan data berbahaya tetapi tidak mendesak per hari; titik merah di tab Menu tetap ada.
- Tidak ada baris untuk tunggakan: sudah ada di kartu Pertemuan dan disebut di baris 4.
- Keadaan kosong (periode aktif, tidak ada yang perlu dikerjakan): ikon centang + "Semua beres. Tidak ada yang perlu dikerjakan sekarang."
- Keadaan tanpa periode: Pengingat tidak tampil; yang tampil `EmptyState` yang sudah ada ("Belum ada anggota" atau "Belum ada periode aktif") dan daftar Langkah awal.
- Memuat: `Loading` seluruh layar seperti sekarang. Galat: `ErrorState` dengan "Coba lagi". Galat saat tombol aksi (tutup pertemuan): `Notice tone="danger"` di bawah kartu Pengingat (pola `actionError` yang ada).
- Tombol di Pengingat tidak pernah memakai variant `primary`; `primary` milik satu tombol di kartu Pertemuan.

### 1.5 Pertemuan berjalan
Kartu yang ada, dirapikan: nama periode (label), "Pertemuan N - <tanggal>", "Tuan rumah: <nama>", baris tunggakan (angka dari `getArrearsSummary`), `Notice` terlambat bila `overdueNotice`. Satu tombol `primary`: "Catat pembayaran" (tugas tersering). Aksi lain TETAP selalu ada sebagai `ListRow tone="alt"` (bukan tombol): "Bayar tuan rumah" (atau "Tuan rumah sudah dibayar"), "Ubah tuan rumah / tanggal", "Tutup pertemuan N" (teks merah `error`). Jadi jalur "Tutup pertemuan" tidak hilang saat belum jatuh tempo; Pengingat hanya mengangkatnya ke depan pada waktunya. Duplikat ini disengaja (pemberitahuan vs fitur); bila terasa ramai di HP, kartu bisa melipat tiga baris itu (keputusan setelah dilihat).
Tanpa tuan rumah: tombol utama "Tentukan tuan rumah pertemuan N" dan "Catat pembayaran" sekunder (perilaku M5c, tidak berubah). Semua pertemuan tertutup: kartu berisi "Semua pertemuan sudah ditutup" dan satu tombol "Akhiri periode" (berubah 2026-11-13, keputusan 27: merah outline `dangerOutline`, bukan `primary`; sekali per layar). Tombol utama "Catat pembayaran" kini bernama "Pembayaran" di Beranda (G7).

### 1.6 Aksi cepat (grid)
- 4 kolom x 2 baris, ubin 72dp tinggi minimal, lebar sama. Komponen baru `QuickAction` (lingkaran 48dp `brandTint` berisi ikon 24 `brandStrong`, label 14sp di bawah, maksimal dua baris, lebar penuh ubin = area sentuh).
- Delapan ubin: Iuran, Tuan rumah, Catat kas, Anggota / Pinjaman, Titipan, Jadwal, Menu ("Lihat semua", membuka tab Menu seperti ubin terakhir di rujukan).

| Ubin | Ikon (Ionicons) | Tujuan | Nonaktif bila (alasan) |
|---|---|---|---|
| Iuran | `cash-outline` | `/periods/[id]/payments` | tanpa periode aktif: "Belum ada periode aktif." |
| Tuan rumah | `home-outline` | `/periods/[id]/payout?week=N` | tanpa periode aktif; atau pertemuan berjalan tanpa tuan rumah: "Tentukan tuan rumah dulu." |
| Catat kas | `create-outline` | `/kas` | tanpa periode sama sekali: "Buat periode dulu." |
| Anggota | `people-outline` | `/members` | tidak pernah |
| Pinjaman | `arrow-redo-outline` | `/loans` | tidak pernah |
| Titipan | `wallet-outline` | `/credits` | tidak pernah |
| Jadwal | `calendar-number-outline` | `/periods/[id]` | tanpa periode aktif |
| Lihat semua | `grid-outline` | tab Menu | tidak pernah |

- Ubin nonaktif TETAP tampil (standar M7.2): latar `bgDisabled`, ikon dan label `textTertiary`, `accessibilityState={{disabled: true}}`, `accessibilityHint` berisi alasan. Mengetuknya memunculkan `toast(alasan)` (komponen ada). Ubin tidak bisa memuat baris alasan seperti `Button`, jadi toast + hint adalah pengganti.
- Bagian "Titipan" dan "Pinjaman" juga ada sebagai pil di header; pengulangan ini disengaja karena keduanya jarang dipakai dan grid adalah tempat orang mencari.

### 1.7 Sudah bayar hari ini
- `SectionHeader` "Sudah bayar hari ini: X dari N" (teks sama persis dengan layar Pembayaran, dipakai ulang), aksi "Lihat".
- Di bawahnya baris horizontal (menggulir) lingkaran inisial 40dp (`brandTint`, teks `brandStrong`, dua huruf pertama nama; bila dua inisial sama, tidak perlu dibedakan di tampilan, tetapi `accessibilityLabel` memuat nama lengkap). Maksimal 7 lingkaran lalu lingkaran "+N". Urut A-Z (`sortByName`). Seluruh baris SATU area sentuh (tinggi >= 56) menuju `/periods/[id]/payments`; lingkaran sendiri bukan tombol.
- Label akses untuk baris: "Sudah bayar hari ini: X dari N. Budi, Siti, ..." (nama dibacakan, bukan hanya warna).
- Kosong: teks "Belum ada yang bayar hari ini." dan baris tetap dapat diketuk. Tersembunyi bila tidak ada periode aktif atau semua pertemuan tertutup.
- Sumber: `repos.payments.listMemberIdsPaidOn(period.id, todayIso())` (ada, M5e), anggota dari `repos.members.list()`, N dari `members` periode (`period.memberCount`). Batas diketahui M5e: layar yang dibiarkan lewat tengah malam baru menyegarkan penanda pada fokus berikutnya.

### 1.8 Terakhir
`SectionHeader` "Terakhir" dengan aksi "Lihat semua riwayat" (membuka tab Riwayat). Tiga `HistoryRow` dari `repos.ledger.listKas()` (3 pertama; sudah terurut terbaru). Kosong: "Belum ada catatan." tanpa tombol. Memakai varian rata dari HistoryRow (bagian 2.4).

### 1.9 Aksesibilitas Beranda
Semua sentuhan >= 48dp (pil, ubin 72dp, tombol Pengingat). Urutan fokus pembaca layar mengikuti urutan layar. Judul bagian memakai `accessibilityRole="header"` (SectionHeader sudah). Angka uang memakai `Money` (angka tabular, `maxFontSizeMultiplier` 1.3). Teks 14sp tidak ditekan lagi; pada teks sistem besar pil dan tombol Pengingat harus membungkus ke baris baru, bukan terpotong (cek di HP).

---

## 2. Riwayat: kartu per hari + ringkasan bulanan

### 2.1 Layar
```
Riwayat (header tab)
[ <  November 2026  > ]                 <- pemilih bulan
+--------------------------------------------+
| Pemasukan        Pengeluaran               |
| +Rp215.045       -Rp902.976                |
| Tidak termasuk: pindah saldo, pinjaman,    |
| pelunasan pinjaman, saldo awal. Catatan    |
| yang dikoreksi tidak dihitung.             |
+--------------------------------------------+
[Semua][Iuran][Tuan rumah][Pinjaman]...  (chip, yang ada)
[Filter]  [Hapus filter]
+-- Kemarin  8 Nov 2026 ---------------------+
| (ikon) Iuran anggota        +Rp15.000      |
|        Budi - Masuk ke Tunai               |
| --------------------------------------     |
| (ikon) Pengeluaran bersama  -Rp65.476      |
+--------------------------------------------+
+-- Jumat  6 Nov 2026 ---...
```
- Pemilih bulan baru `MonthSwitcher` (dua tombol 48dp "Bulan sebelumnya"/"Bulan berikutnya" + judul bulan; tombol "berikutnya" nonaktif di bulan berjalan dengan alasan di label akses "Sudah di bulan terbaru"). Bawaan: bulan HP saat ini. Bulan memfilter DAFTAR dan RINGKASAN. Tanggal catatan tidak pernah di masa depan (aturan tanggal), jadi tidak ada bulan depan.
- Ringkasan: `Card` dengan dua kolom berlabel kata ("Pemasukan", "Pengeluaran"), angka `Money` size large dengan tanda dan warna (hijau `moneyIn`, merah `moneyOut`). Tanda +/- tetap ada, warna bukan satu-satunya penanda.
- Kartu per hari: `Card` (tanpa elevasi; aturan Design system v1 "tanpa bayangan di baris Riwayat", jadi kartu hari memakai `bgCard` + garis `divider`) berisi header hari (`SectionHeader`-gaya: "Kemarin" bold + tanggal biasa; teks dari `dateSectionTitle`) dan baris `HistoryRow` varian rata dipisah garis tipis. Header hari TIDAK memuat total harian (ditunda; satu angka per layar sudah cukup).
- Developer: `SectionList` tidak bisa membungkus satu seksi dalam satu kartu. Pakai `FlatList` dengan data = hasil `groupByDate`, tiap item satu kartu hari yang memetakan barisnya (satu hari paling banyak sekitar N catatan, puluhan; aman). Header daftar (`ListHeaderComponent`) berisi pemilih bulan, ringkasan, chip, tombol Filter.
- `HistoryRow` diberi prop `flat` (tanpa border dan latar kartu sendiri); tampilan lama tetap dipakai oleh Beranda "Terakhir" hanya bila Beranda tidak memakai kartu. Pilihan: Beranda juga memakai varian rata di dalam Card.

### 2.2 Apa yang dihitung (definisi pasti)
Fungsi murni baru di domain, `summarizeMonth(entries, month)` dalam `src/domain/report.ts` (atau berkas baru `src/domain/flow.ts`), dengan tes unit. Masukan: seluruh `listKas()`; `month` = "YYYY-MM". Aturan:
1. Hanya catatan dengan `date` di bulan itu. Tanggal catatan yang dipakai (bukan waktu dibuat). Catatan koreksi memakai tanggal koreksi (hari ini), sudah diatur di aplikasi.
2. Catatan yang dikoreksi dan catatan koreksinya DUA-DUANYA dikecualikan (sama dengan `summarizePeriod` dan keputusan M6 nomor 5). Catatan koreksi dari bulan lain mengecualikan aslinya di bulan asalnya, jadi ringkasan bulan lama bisa berubah setelah koreksi; itu benar.
3. Pemasukan = jumlah catatan masuk yang tandanya "+" di baris Riwayat; Pengeluaran = jumlah catatan keluar yang tandanya "-". Memakai satu aturan tanda yang SAMA dengan baris (`amountSign` / `entryDirection`): satu fungsi domain `cashFlowSign` dipanggil oleh ringkasan DAN oleh `kasLabels.amountSign` / `history.entryDirection` (menggantikan salinan). Tes konsistensi: untuk setiap jenis catatan, klasifikasi ringkasan = tanda baris.
4. Perlakuan tiap jenis:

| Jenis | Ringkasan | Alasan |
|---|---|---|
| member_payment (Iuran) | Pemasukan | uang masuk Tunai |
| host_offset (potongan tunggakan tuan rumah) | Pemasukan | menyamai tanda "+" di baris; iuran tuan rumah "terbayar" lewat potongan. Lihat keputusan A. |
| host_payout | Pengeluaran | uang keluar sebesar 10.000 x N |
| shared_goal | Pengeluaran | tur dan sejenisnya |
| credit_refund | Pengeluaran | titipan dikembalikan |
| transfer Tunai/Debit | tidak dihitung (netral) | total kas tidak berubah |
| loan (pinjaman ke anggota) | tidak dihitung (netral) | uang pindah ke Piutang; baris netral tanpa tanda (M7.2) |
| loan_repayment | tidak dihitung (netral) | pindah dari Piutang ke Tunai; netral di baris |
| opening_balance | tidak dihitung | saldo awal bukan pemasukan; `summarizePeriod` juga mengecualikan. Catatan: barisnya menampilkan "+" hijau, jadi satu-satunya jenis yang tanda barisnya tidak ikut ringkasan (dijelaskan di teks di bawah ringkasan) |
| debt_writeoff | tidak dihitung | tidak mengubah saldo kas |
| catatan tanpa pos (data lama) | tidak dihitung | tidak mengubah saldo, sudah berperingatan |
| reversal | tidak dihitung (dan aslinya juga) | lihat 2 |

5. Keluaran: `{ moneyIn, moneyOut }` bilangan bulat rupiah; tanpa pecahan, tanpa selisih (selisih bisa ditambah nanti). Tidak ada "Perubahan saldo kas" di v1; teks kaki ringkasan menyebut yang tidak dihitung supaya Pemasukan - Pengeluaran yang tidak sama dengan perubahan saldo (karena pinjaman) tidak membingungkan.
6. Tes minimal: bulan kosong; satu jenis tiap baris tabel; koreksi dalam bulan sama; koreksi lintas bulan; transfer tidak masuk; pinjaman dan pelunasan tidak masuk; pembatas bulan (31 Okt vs 1 Nov); jumlah besar; konsistensi dengan tanda baris.

### 2.3 Apakah ringkasan mengikuti filter
Usulan: TIDAK. Ringkasan mengikuti hanya bulan. Chip dan layar Filter mempersempit DAFTAR. Bila ada chip/filter aktif, satu baris di bawah ringkasan: "Ringkasan memuat semua catatan bulan ini. Daftar di bawah sedang difilter." Alasan: chip "Pengeluaran" membuat Pemasukan jadi Rp0, chip "Pinjaman" membuat keduanya Rp0; angka yang melompat membingungkan. Alternatif bila pemilik ingin "total Budi bulan ini": ringkasan mengikuti filter Anggota/Pos/Periode tetapi tidak chip; saya TIDAK menyarankan karena aturannya lebih sulit dijelaskan. (Keputusan B.)

### 2.4 Dropdown atau chip + layar Filter
Usulan: PERTAHANKAN chip + layar Filter. Alasan: chip satu ketukan dan semua pilihan terlihat; sudah dites di HP (M7.2 bagian 1 lolos); dropdown di Android berarti modal atau lembar bawah, yaitu komponen baru dan tiga ketukan; filter Anggota dan Periode punya banyak pilihan sehingga tetap butuh layar sendiri. Satu-satunya "dropdown" baru adalah pemilih bulan. Biaya kalau pemilik tetap mau dropdown: komponen baru `Dropdown` + lembar pilihan, sekitar +1 hari, tanpa nilai tambah untuk satu pengguna.

### 2.5 Keadaan
- Memuat: `Loading`. Galat: `ErrorState`.
- Kosong sama sekali: `EmptyState` "Belum ada catatan" (pemilih bulan tersembunyi, ringkasan tersembunyi).
- Ada catatan tetapi bulan ini kosong: pemilih bulan tampil, ringkasan "Rp0 / Rp0", teks "Tidak ada catatan di bulan ini." dan tombol "Bulan sebelumnya".
- Filter tanpa hasil: `EmptyState` yang ada ("Tidak ada catatan yang cocok", "Hapus filter").
- Pemilih bulan dan ganti bulan: filter chip tetap; `resetHistoryFilter` saat `dataVersion` berubah (yang ada) juga mengembalikan bulan ke bulan ini.

---

## 3. Form jumlah dengan keypad

### 3.1 Form mana
| Form | Pakai keypad | Catatan |
|---|---|---|
| `periods/[id]/pay.tsx` Catat pembayaran | Ya (K1) | chip jumlah cepat tetap |
| `kas/new.tsx` (saldo awal, pindah saldo, pinjaman, pelunasan, pengeluaran bersama) | Ya (K2) | satu layar, jenis dari parameter |
| `payout.tsx` (Bayar tuan rumah) | Tidak | jumlah tetap dari domain, tidak ada input |
| `credits` (kembalikan titipan) | Tidak | tidak ada input jumlah |
| Ketik PULIHKAN / HAPUS SEMUA, nama anggota, catatan | Tidak | teks, tetap `TextField` |
| `AmountField` | dipertahankan untuk sementara, dihapus setelah K2 bila tidak ada pemakai | |

### 3.2 Komponen baru
- `AmountDisplay`: kotak tampilan jumlah. "Rp" kecil di kiri + angka besar berpemisah titik, rata tengah, satu baris, `adjustsFontSizeToFit` dan `minimumFontScale` 0.6. Ukuran angka: tambah SATU token `hero` (36sp, lineHeight 44, bold) di `theme.ts`; hanya dipakai di sini (skala tipe Design system v1 berhenti di 28; ini penambahan kecil yang perlu "ya" pemilik, atau pakai `display` 28 bila ingin skala tidak berubah). Kosong: "Rp" abu (`textTertiary`) + "0" samar; tanpa kursor (tidak ada TextInput).
- `AmountKeypad`: tiga kolom, empat baris: `1 2 3 / 4 5 6 / 7 8 9 / 000 0 ⌫`. TANPA operator (+ - x bagi) karena tidak ada hitungan; kolom operator rujukan dibuang. Tombol: `Pressable`, tinggi 56 (>= 48), lebar 1/3, `bgCard`, garis `divider`, radius md, teks 22sp bold (pakai `titleL`), ditekan `bgMute`. Ikon hapus `backspace-outline` 24.
- `IconChoice`: ubin pilihan ikon + kata untuk pos/jenis (radio). Tinggi 72, ikon 24 dalam lingkaran 40, terpilih = `brandTint` + garis 2dp `brandStrong` + centang (bukan hanya warna). Dipakai menggantikan `PosPicker` (Tunai/Debit/Piutang) dan tombol arah transfer.
- Fungsi murni baru (domain, dengan tes): `appendAmountDigits(current: string, key: '0'..'9' | '000'): string` (hapus nol di depan, batas 12 digit sesuai `parseRupiahInput`, "000" pada kosong tetap kosong), `deleteLastDigit(current)`, `groupDigits(text)` untuk tampilan titik (atau pakai `formatRupiah` yang ada tanpa "Rp"), `checkPaymentAmount(amount)` -> `'ok' | 'empty' | 'not_multiple'` membungkus `assertDuesMultiple` (UI tidak boleh memakai `% 15000` sendiri), `checkRepaymentAmount(amount, remaining)` -> `'ok' | 'above_remaining'` membungkus `assertRepaymentWithinLoan`.
- State jumlah tetap STRING digit murni, sehingga `parseRupiahInput`, `previewPayment`, `buildKasEntry`, dan semua repo tidak berubah.

### 3.3 Tata letak (pay.tsx)
```
[X]  Catat pembayaran
     Budi Santoso
     (kalender) Hari ini, 9 Nov 2026  v         <- header, ketuk membuka DateField
+--------------------------------------------+
|              Rp 45.000                     |   <- AmountDisplay (hero)
|  Kelipatan Rp15.000. 3 pertemuan.          |   <- baris bantu / galat
+--------------------------------------------+
(1 minggu Rp15.000)(2 minggu)(4 minggu)(Lunasi tunggakan Rp...)   <- chip, menggulir mendatar
Uang masuk ke Tunai.  (teks bantu, secondary)
[ 1 ][ 2 ][ 3 ]
[ 4 ][ 5 ][ 6 ]
[ 7 ][ 8 ][ 9 ]
[000][ 0 ][ ⌫ ]
[          Lanjut          ]                    <- CTA tetap di bawah
```
- Bagian atas (header, jumlah, chip) bisa menggulir; keypad + CTA menempel di bawah dengan padding sisi bawah dari `react-native-safe-area-context` (sudah ada di dependensi). Tinggi keypad 4 x 56 + celah 8 = sekitar 248; CTA 48; total blok bawah sekitar 316dp. Di HP 640dp sisa untuk header + jumlah + chip sekitar 250dp: cukup tetapi mepet (cek di HP).
- Tanggal di header: baris `Pressable` tinggi 48, teks "Hari ini, 9 Nov 2026" (atau tanggal penuh bila bukan hari ini) + ikon panah. Diketuk membuka panel `DateField` yang ADA (ketik angka + pintasan), tanpa pemilih tanggal bawaan Android (pemilih bawaan butuh dependensi `@react-native-community/datetimepicker` dan "Native date picker" tercatat ditunda di M5c; dependensi itu ikut Expo Go tetapi tetap tambahan). Bila pemilik ingin pemilih seperti rujukan: biaya satu dependensi + 0,5 hari, ajukan sebagai keputusan terpisah. Galat tanggal tampil di dalam panel dan juga menandai header ("Tanggal tidak valid") sehingga tidak tersembunyi saat panel ditutup; panel membuka sendiri bila tanggal tidak valid.
- Nama anggota di header, bukan di badan form.

### 3.4 Tata letak (kas/new.tsx)
Header: judul jenis ("Pengeluaran bersama", dll.) + tanggal seperti di atas. Badan menurut jenis (urutan): [pemilih anggota bila perlu: `OptionRow` radio yang ada] -> `AmountDisplay` -> baris sisa/maksimal (pelunasan) -> `IconChoice` pos/arah -> catatan (`TextField`, wajib untuk pengeluaran bersama) -> keypad -> CTA "Lanjut".
- Jenis dan ikon pilihan pos: Tunai `cash-outline`, Debit `card-outline`, Piutang `people-outline`. Arah transfer: dua ubin "Tunai ke Debit" dan "Debit ke Tunai" (`arrow-forward-outline`). Tidak ada ikon kategori.
- Catatan: saat `TextField` catatan fokus, papan ketik sistem muncul; sembunyikan keypad selama papan ketik terlihat (`Keyboard.addListener('keyboardDidShow'/'keyboardDidHide')`) dan CTA naik di atas papan ketik (`KeyboardAvoidingView` yang ada). Setelah selesai mengetik keypad kembali.

### 3.5 Validasi dan keadaan
Keypad tidak menolak digit; validasi muncul di baris bantu di bawah jumlah dan pada CTA.

| Keadaan | Baris bantu | CTA |
|---|---|---|
| Jumlah kosong | netral: "Ketuk angka untuk mengisi jumlah." | nonaktif, alasan "Isi jumlah dulu." |
| Pembayaran, bukan kelipatan Rp15.000 | galat merah dengan ikon: "Jumlah harus kelipatan Rp15.000, misalnya Rp30.000." | nonaktif, alasan "Ubah jumlah jadi kelipatan Rp15.000." |
| Pembayaran sah | netral: "Terbaca: Rp45.000" (sama dengan `AmountField`) | aktif |
| Pembayaran melebihi sisa iuran | TIDAK dicegah. Peringatan tetap di dialog konfirmasi yang ada ("sebagian menjadi titipan") sebelum menyimpan (aturan CLAUDE.md). Pratinjau langsung tanpa dialog tetap ditunda (M5c). | aktif |
| Pelunasan pinjaman: jumlah > sisa | galat: "Jumlah melebihi sisa pinjaman Budi (Rp300.000). Kurangi jumlah, atau ketuk Bayar lunas." | nonaktif, alasan "Kurangi jumlah sampai Rp300.000 atau kurang." |
| Pelunasan: anggota terpilih | baris tetap "Sisa pinjaman Budi: Rp300.000" + chip "Bayar lunas Rp300.000" (yang ada) | |
| Pengeluaran bersama tanpa catatan | galat pada catatan "Isi catatan, misalnya DP tur ke Bali." | nonaktif, alasan "Catatan wajib diisi." |
| Menyimpan | | `Button loading` (ada) |
| Galat dari repo/domain | `Notice tone="danger"` di atas CTA, lewat `toIndonesian` (yang ada) | |
Keputusan angka tetap di domain; layar hanya menampilkan hasil `checkPaymentAmount` / `checkRepaymentAmount`, dan repositori tetap menolak lagi saat simpan (tidak ada yang dilonggarkan).
- Chip jumlah cepat pembayaran: tetap dari `paymentChoices` (selalu kelipatan 15.000), dipindah ke baris menggulir mendatar di atas keypad; memilih chip mengisi jumlah (mengganti ketikan), chip terpilih bila jumlah sama (`typedAmount === amount`, yang ada). Catatan sisa tunggakan bukan kelipatan (`arrearsRemainderNote`) tetap tampil.
- Pos penerima pembayaran anggota tetap Tunai dan hanya teks ("Uang masuk ke Tunai."); tidak ada pilihan (keputusan M5d 4).

### 3.6 Aksesibilitas dan khusus React Native
- Tombol keypad >= 48dp tinggi (56 usulan), lebar >= 64; jarak antar tombol 8dp.
- Label pembaca layar: "Angka 7"; "000" berlabel "Tiga nol"; hapus berlabel "Hapus satu angka" dengan aksi akses tambahan "Hapus semua" (`accessibilityActions` + `onAccessibilityAction`; tekan lama juga mengosongkan).
- `AmountDisplay` memakai `accessibilityRole="text"`, `accessibilityLabel="Jumlah Rp45.000"` (kosong: "Jumlah belum diisi"), `accessibilityLiveRegion="polite"` supaya TalkBack membacakan perubahan.
- Penjelasan RN untuk developer: di web Anda memakai `<input type="number">` dan papan ketik bawaan; di RN `TextInput` selalu memunculkan papan ketik sistem. Dengan keypad sendiri ada dua jalan. (1) Tanpa `TextInput`: jumlah ditampilkan sebagai `Text` dari state string (usulan; paling sederhana, tidak ada papan ketik yang muncul, tidak bisa menempel/paste, tidak ada kursor). (2) `TextInput` dengan `showSoftInputOnFocus={false}`: kursor dan IME tetap ada, tetapi ada risiko fokus aneh dengan TalkBack; tidak dipilih. Karena tanpa `TextInput`, tidak ada `keyboardType` untuk jumlah.
- Tema terang terkunci; keypad memakai token (`bgCard`, `divider`, `text`, `bgMute`), tidak ada warna baru.
- Tidak ada getar/haptik (butuh modul tambahan).
- Pemilik harus cek di HP: apakah jumlah 12 digit muat di lebar 360dp, apakah keypad tertutup bilah navigasi/gestur Android (padding bawah), apakah papan ketik catatan menutupi CTA.

---

## 4. Grafik di Laporan

### 4.1 Apa yang digrafikkan
"Arus kas bulanan": batang berkelompok Masuk dan Keluar untuk 6 bulan terakhir (bulan berjalan di kanan). Memakai definisi dan fungsi `summarizeMonth` bagian 2 (satu aturan, angka sama dengan Riwayat). Alasan memilih ini dari pilihan lain:
- "Saldo kas per pertemuan": saldo itu global dan bukan per pertemuan (laporan M6 sengaja menyebut "Belum terealisasi" bila belum lunas); grafiknya menyesatkan.
- "Iuran terkumpul per pertemuan" (terkumpul vs 15.000 x N): bermakna untuk arisan, tetapi per periode, bukan per bulan; usulan untuk nanti di laporan periode, bukan sekarang.
Fungsi baru `monthlyFlowSeries(entries, endMonth, count)` -> daftar `{ month, moneyIn, moneyOut }` dengan tes; `barHeights(values, maxDp)` mengembalikan tinggi dp bilangan bulat (hitungan tampilan, bukan uang; tetap di fungsi murni dengan tes: nilai 0 memberi tinggi 0 atau 2dp rintisan, nilai terbesar memberi `maxDp`).

### 4.2 Perpustakaan
Tanpa dependensi baru. `react-native-svg` TIDAK ada di `package.json` (saya periksa; tidak ada di `node_modules`). Batang dapat dibuat dari `View` dengan tinggi tetap (`height` dari `barHeights`), 12 batang saja. `react-native-svg` ikut Expo Go (`npx expo install react-native-svg`) dan baru perlu bila nanti ada garis/kurva; biayanya satu dependensi native (build ulang M7b bila ditambah sesudahnya). Hindari pustaka grafik berat (victory, gifted-charts, dll.).

### 4.3 Tata letak (di tab Laporan, setelah kartu "Saldo kas")
```
Arus kas bulanan
Nov 2026: Masuk +Rp215.045   Keluar -Rp902.976      <- baris detail bulan terpilih
 |   ##                                              <- batang: kiri Masuk, kanan Keluar
 | ## ## ##   ##  ##                                  tinggi relatif ke nilai terbesar
 +--Jun--Jul--Agu--Sep--Okt--Nov--
 [#] Masuk   [#] Keluar                               <- legenda dengan kata
Tabel nilai (selalu terlihat):
 Jun 2026   Masuk Rp...   Keluar Rp...
 ...
```
- Komponen baru: `BarChart` (kontainer tinggi 160, garis dasar, 6 kelompok). Satu kelompok = satu `Pressable` (tinggi >= 48 meski batang pendek) yang memilih bulan; bulan terpilih diberi garis bawah tebal (bentuk, bukan hanya warna).
- Warna dari token: Masuk `moneyIn`, Keluar `moneyOut`. Keduanya >= 3:1 terhadap `bgCard` (WCAG 1.4.11; angka kontras `theme.test.ts` yang sudah ada menjadi acuan, developer menambah dua pasangan itu bila belum). Penanda lain selain warna: posisi (Masuk selalu kiri), legenda berkata "Masuk"/"Keluar", dan tabel nilai.
- Alternatif untuk pembaca layar dan untuk yang tidak melihat warna: tabel nilai berupa teks di bawah grafik (jumlah dengan `Money` + kata), dan tiap kelompok berlabel akses "November 2026: masuk Rp215.045, keluar Rp902.976". Grafik sendiri `accessibilityElementsHidden`-nya TIDAK dipakai; tabel boleh ringkas tetapi tidak boleh dihapus.
- Sumbu Y: tidak digambar angka; hanya satu garis putus-putus di tengah dan label nilai maksimum ("maks Rp902.976", teks 14sp). Menghindari label sumbu "800rb" yang kecil.
- Keadaan: memuat `Loading` (dibagi dengan halaman); galat `ErrorState`; kosong (tidak ada catatan Pemasukan/Pengeluaran 6 bulan): `Notice` "Belum ada catatan kas. Grafik muncul setelah ada iuran atau pengeluaran."; bulan tanpa data: batang rintisan 2dp dan teks "Rp0" di tabel.
- Opsional: tombol "Lihat riwayat bulan ini" yang membuka Riwayat pada bulan itu (memakai `historyFilterStore`; ditunda bila menyulitkan).

### 4.4 Sebelum atau sesudah M7b
Saya setuju dengan saran sesi utama: SESUDAH M7b. Grafik tidak mengubah uang atau data, tidak menghalangi uang nyata, dan bisa memakai data nyata setelah cutover untuk dicek. Sisi biaya bila diundur: tidak ada. `summarizeMonth` sudah dibuat di langkah H sehingga grafik tinggal tampilan.

---

## 5. Rencana langkah (kecil, masing-masing dengan tes + cek HP)

Estimasi adalah tebakan perancang untuk waktu pengembang, belum disepakati siapa pun; satuan hari kerja.

Urutan: C -> D1 -> D2 -> (cek 2) -> H -> K1 -> K2 -> E -> (cek 3) -> M7b -> G.
Alasan: H dan K menyentuh `riwayat`, `pay.tsx`, `kas/new.tsx` yang juga disapu E; mengerjakan H dan K sebelum E menghindari mengubah berkas yang sama dua kali. K (cara memasukkan uang) harus terbukti dengan data contoh SEBELUM uang nyata, jadi sebelum M7b dan cutover. G tidak menghalangi uang nyata, jadi setelah M7b.

| Langkah | Isi | Berkas dibuat / diubah | Tes | Cek HP | Est. |
|---|---|---|---|---|---|
| C (sudah dalam rencana) | Detail catatan `kas/[entryId].tsx` di komponen baru | `src/app/kas/[entryId].tsx` | yang ada | cek 2 | 0,5 |
| D1 | Header kas: aksi samping, pil Piutang/Titipan, kartu Pertemuan dirapikan, "Terakhir" | dibuat: `src/ui/components/PillLink.tsx`; diubah: `src/app/(tabs)/index.tsx`, `HistoryRow.tsx` (prop `flat`) | tes kecil untuk teks bila ada fungsi baru | cek 2 | 0,5-1 |
| D2 | Pengingat, grid aksi cepat, baris "Sudah bayar hari ini" | dibuat: `src/ui/reminders.ts` + `reminders.test.ts`, `src/ui/components/ReminderRow.tsx`, `QuickAction.tsx`, `InitialsRow.tsx`; diubah: `(tabs)/index.tsx` | `homeReminders`: tiap baris tabel 1.4, urutan, kosong, tanpa periode, tuan rumah belum bayar di pertemuan tertutup, backup due | cek 2 | 1-1,5 |
| H | Riwayat: pemilih bulan, ringkasan, kartu per hari | dibuat: `src/ui/components/MonthSwitcher.tsx`; domain `summarizeMonth` + `cashFlowSign` di `src/domain/report.ts` atau `flow.ts` + tes; diubah: `src/ui/kasLabels.ts` (`amountSign` memanggil domain), `src/ui/history.ts` (`entryDirection`), `(tabs)/riwayat.tsx`, `historyFilterStore.ts` (bulan), `HistoryRow.tsx` | seluruh daftar 2.2 butir 6 + tes konsistensi tanda | cek 3a | 1-1,5 |
| K1 | `AmountDisplay`, `AmountKeypad`, fungsi digit + `checkPaymentAmount`; dipasang di `pay.tsx` | dibuat: `src/ui/components/AmountDisplay.tsx`, `AmountKeypad.tsx`, `src/domain/amount-input.ts` + tes; diubah: `src/domain/payment-preview.ts`, `src/ui/theme.ts` (token `hero`, bila disetujui), `periods/[id]/pay.tsx` | `appendAmountDigits` (nol depan, 000, batas 12 digit, kosong), `deleteLastDigit`, `checkPaymentAmount`; `theme.test.ts` bila token | cek 3b | 1-1,5 |
| K2 | `IconChoice`, `kas/new.tsx` pakai keypad; hapus `AmountField` bila tak terpakai | dibuat: `src/ui/components/IconChoice.tsx`; diubah: `kas/new.tsx`, `src/domain/loans.ts` atau `kas.ts` (`checkRepaymentAmount`) | `checkRepaymentAmount` | cek 3b | 1 |
| E (sudah dalam rencana) | Sapuan layar lain, hapus alias | banyak | | cek 3 | sesuai rencana |
| G (setelah M7b) | Grafik Laporan | dibuat: `src/ui/components/BarChart.tsx`; domain `monthlyFlowSeries`, `barHeights` + tes; diubah: `(tabs)/laporan.tsx` | tes dua fungsi | cek 4 | 1 |

Tambahan total untuk empat pola di atas rencana yang ada (C, D semula, E): sekitar 5-7 hari kerja, G termasuk. Perkiraan kasar.

Dependensi baru: TIDAK ADA di usulan ini. Opsional, hanya bila pemilik meminta: `react-native-svg` (garis/kurva di grafik), `@react-native-community/datetimepicker` (pemilih tanggal bawaan Android). Keduanya ikut Expo Go; install lewat `npx expo install`. Tidak ada migrasi basis data, tidak ada perubahan `app.json`, tidak ada perubahan aturan uang.

Daftar cek HP per langkah (pemilik):
- D1/D2: header muat di lebar HP (angka Total panjang + dua tombol samping); pil dan tombol Pengingat membungkus pada teks sistem besar; ubin nonaktif memunculkan alasan; "Bayar tuan rumah"/"Tutup pertemuan" dari Pengingat membuka layar atau dialog yang sama dengan sebelumnya; baris Sudah bayar hari ini cocok dengan layar Pembayaran; TalkBack membaca urutan layar.
- H: ringkasan cocok dengan hitungan tangan dari daftar hari itu; koreksi mengeluarkan kedua baris dari ringkasan; pinjaman/transfer tidak mengubah angka; ganti bulan; kartu hari tidak patah pada hari dengan puluhan baris.
- K1/K2: ketik 45000 lewat 4,5,000; hapus; "000" pada kosong; kelipatan salah menonaktifkan tombol dengan alasan; kelipatan sah ke dialog konfirmasi lama (titipan tetap diperingatkan); pelunasan di atas sisa ditolak; tanggal lewat header; keypad tidak tertutup bilah gestur; papan ketik catatan; TalkBack membacakan angka dan jumlah.
- G: batang sesuai tabel; tabel terbaca tanpa warna.

## 6. Keputusan yang harus diambil pemilik

A. Pemasukan memuat "potongan tunggakan tuan rumah" (host_offset)? Usulan: ya (sesuai tanda "+" di baris; iuran tuan rumah dianggap diterima lewat potongan). Alternatif: tidak dihitung, tetapi maka Pemasukan - Pengeluaran makin jauh dari perubahan saldo.
B. Ringkasan bulanan hanya mengikuti bulan (usulan) atau juga filter Anggota/Pos/Periode?
C. Membatalkan keputusan M7.2 "tanpa total hasil filter" (ringkasan sekarang ada): setuju?
D. Chip + Filter tetap (usulan), bukan dropdown?
E. Pita cadangan di atas Beranda diganti baris Pengingat (usulan)? Titik merah di tab Menu tetap.
F. Aksi samping "Pindah saldo" dan "Catat kas" di header; delapan ubin grid di atas dipilih? Ganti bila ada yang lebih sering dipakai.
G. Token `hero` 36sp (usulan) atau cukup `display` 28?
H. Tanggal tetap `DateField` ketik+pintasan (usulan) atau pemilih tanggal bawaan Android (+1 dependensi, +0,5 hari)?
I. Urutan: H dan K sebelum E dan M7b (usulan), atau setelah M7b agar uang nyata lebih cepat? Risikonya bila setelah: cara memasukkan uang berubah tepat setelah data nyata mulai.
J. Grafik setelah M7b (usulan).

## 7. Bentrokan dan risiko

1. CLAUDE.md "UI never computes money": ringkasan bulanan, seri grafik, dan pengecekan jumlah (`checkPaymentAmount`, `checkRepaymentAmount`) harus fungsi domain murni dengan tes; layar hanya menampilkan. Tinggi batang adalah hitungan tampilan, tetap dibuat di fungsi murni.
2. PROJECT.md M7.2: "No total of filtered results (owner agreed)" bertentangan dengan pola 2 (keputusan C). Spek Beranda M7.2 (pita cadangan di atas, kartu Kas dengan satu baris Piutang, empat aksi cepat) digantikan di bagian 1; PM yang menggabungkan, saya tidak mengubah PROJECT.md.
3. Keputusan 2026-11-04 "pengeluaran bersama tanpa kategori/anggaran": ikon kategori dan anggaran dari rujukan sengaja tidak diambil.
4. Design system v1: "tanpa bayangan di baris Riwayat" (kartu hari memakai garis, bukan elevasi), skala tipe tujuh langkah (token `hero` menambah satu; keputusan G), teks minimal 14sp (semua teks baru 14sp ke atas), bobot 400/700 saja, tidak ada ilustrasi, tema terang terkunci. Pil dan ubin memakai token yang ada; tidak ada warna baru.
5. Aturan tanda baris vs ringkasan: baris "Saldo awal" tampil "+" hijau tetapi tidak masuk Pemasukan (ditulis di teks kaki). Jika membingungkan, keputusan lanjutan: ubah tanda baris Saldo awal menjadi netral (menyentuh keputusan M7.2).
6. Koreksi lintas bulan mengubah angka bulan lama (benar secara aturan append-only: dikoreksi tidak dihitung).
7. `kas/new.tsx` menolak bila tidak ada periode; tombol samping/ubin "Catat kas" harus nonaktif dengan alasan agar tidak membuka layar galat.
8. Beban baca Beranda: bertambah `getKasReport` (Titipan) dan `getWeekPayout` per pertemuan tertutup. Developer ukur di HP; bila terasa lambat, ganti ke satu query ringkas dan catat sebagai keputusan baru.
9. Dua jalur aksi pertemuan (Pengingat dan kartu Pertemuan) bisa terasa ramai; dinilai pemilik setelah D2.
10. Keypad menggantikan papan ketik sistem di dua form uang: tidak bisa menempel (paste) jumlah. Diterima untuk satu pengguna; sebutkan di cek HP.
11. Teks besar sistem dan layar kecil: header, pil, ubin, keypad paling berisiko terpotong; belum dilihat di perangkat.
12. Belum ada tes UI otomatis di proyek; hanya fungsi murni yang bisa dites. Tampilan hanya terbukti lewat cek HP.
