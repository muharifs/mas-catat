# Keputusan desain 2026-11-13: spesifikasi untuk developer

Penulis: ui-ux-designer. Status: SPESIFIKASI. Tidak ada kode diubah. Hanya UI dan teks; aturan uang, data, migrasi, CSV, `formatSigned`, dan teks dialog yang dipin tes tidak disentuh. Font NORMAL saja. Kriteria pemilik: konsistensi (K), kegunaan (U), aksesibilitas (A), estetika (E).

Dasar: dibaca `CLAUDE.md`, `AGENTS.md`, audit bagian 14 dan temuan terkait, glosarium `ui-language-review.md` bagian 2, `(tabs)/index.tsx`, `riwayat.tsx`, `menu.tsx`, `backup/index.tsx`, `backup/restore.tsx`, `Money`, `PillLink`, `Notice`, `Button`, `ReminderRow`, `QuickAction`, `theme.ts`, `backupLabels.ts`, `monthSummary.ts`. Saya TIDAK melihat layar di perangkat: ukuran lebar di bawah adalah perhitungan dari kode, bukan ukur nyata. Yang harus dicek di HP ada di bagian 9.

Ukuran acuan lebar: HP 360dp. Isi kartu = 360 - 32 (padding layar) - 32 (padding kartu) = 296dp.

---

## 1. Kartu kas Beranda (`src/app/(tabs)/index.tsx`, `src/ui/components/Money.tsx`, `src/ui/components/PillLink.tsx`)

### Susunan baru kartu (atas ke bawah)

```
Total kas                                  (cardLabel)
Rp12.345.000  [mata]                       (hero + tombol mata 48dp, satu baris)
Tunai                 Debit                (dua kolom, tidak berubah)
Rp...                 Rp...
[ Pindah saldo ]                           (secondary, compact, rata kiri)
( Pengeluaran  Rp600.000  > )              (satu PillLink, bila ada data)
```

Titik yang berubah dan alasan:

- **[DIREVISI pemilik 2026-11-13: "Pindah saldo" di baris Total kas, kanan mata, angka mengecil (`fit`). Lihat PROJECT.md keputusan 27 (1).]** **Kolom tombol sisi (`sideActions`, lebar 128) dihapus dan "Pindah saldo" turun ke bawah Tunai/Debit.** Alasan hitungan: dengan kolom 128 + gap 12, kolom Total hanya 156dp. Tombol mata 48dp menyisakan 108dp untuk angka hero 36 (satu digit hero bold kira-kira 21dp, jadi "Rp12.345.000" butuh sekitar 210dp). Angka akan menyusut ke batas 0,6 atau terpotong. Dengan kolom penuh: 296 - 48 = 248dp, cukup. "Pindah saldo" memindahkan uang antara Tunai dan Debit, jadi tepat di bawah keduanya (K, U). INI KONSEKUENSI keputusan (a)/(b), bukan perubahan yang diminta pemilik; lihat butir A1 di bagian 8.
- Garis `divider` di atas blok lama dihapus; pil mengikuti `gap: spacing.md` kartu. `Card` tetap pembungkus (cek apakah `Card` punya gap; bila tidak, bungkus isi dengan `View` gap `spacing.md`, nilai yang sudah dipakai kartu ini).

### 1a. Hapus tombol "Catat kas" dari kartu

- Hapus `<Button label="Catat kas" ...>` dan seluruh `sideActions` (style juga). Ubin grid "Catat kas" (`QuickAction`, baris pertama grid) TIDAK diubah.
- "Pindah saldo" tetap: `variant="secondary"`, `compact`, `disabled={!hasAnyPeriod}`, `disabledReason={NO_PERIOD_REASON}`, tujuan `/kas/new?kind=transfer`. Tambah `style={{ alignSelf: 'flex-start' }}` agar tidak selebar kartu (`withReason` membungkus tombol bila nonaktif; pastikan pembungkus itu juga rata kiri, bukan merentang).
- Teks, label a11y, dan tujuan tidak berubah.

### 1b. Tombol mata: setelah angka Total kas, satu baris

- Baris label "Total kas" tinggal `Text` saja (tanpa mata).
- Baris angka baru: `View` `flexDirection: 'row'`, `alignItems: 'center'`, `gap: spacing.xs`. Isi: `Money` (atau mask) lalu tombol mata.
- `Money` di baris ini diberi `style={{ flexShrink: 1 }}` supaya `fit` (menyusut) bekerja dan mata tidak terdorong keluar kartu. Mask juga `flexShrink: 1`.
- Tombol mata: `Pressable` `width: MIN_TOUCH`, `height: MIN_TOUCH` (48x48 NYATA), `alignItems/justifyContent: 'center'`, `borderRadius: radius.pill`, hapus `hitSlop` dan padding lama (target 48 sekarang berupa kotak sungguhan, tidak menimpa angka). Ikon `Ionicons` `eye-outline` / `eye-off-outline`, `ICON.md` (24), warna `colors.textSecondary`. Tekan: `colors.bgMute` (sudah ada, `eyePressed`).
- A11y tidak berubah: `accessibilityRole="button"`, `accessibilityLabel={balanceToggleLabel(balanceHidden)}` ("Sembunyikan saldo" / "Tampilkan saldo"). Urutan TalkBack: "Total kas", jumlah, tombol mata (sesuai urutan visual).
- Tinggi baris menjadi 48 (sebelumnya hero 44): tambahan 4dp, wajar.
- Alasan: mata berdampingan dengan angka yang ia sembunyikan (K, U); target sentuh 48 (A).

### 1c. Total kas: HANYA "Rp" lebih kecil

**Pilihan ukuran: `type.amountL` (20), bukan `titleL` (22).** Alasan: `amountL` memang token untuk angka uang dan sama dengan ukuran "large" Tunai/Debit tepat di bawahnya, sehingga "Rp" total kas dan "Rp" Tunai/Debit sama besar (K). `titleL` adalah token judul dan 22 akan lebih besar dari "Rp" Tunai/Debit. Rasio 20/36 = 0,56, cukup terbaca (bold, kontras sama dengan angka).

**API `Money` (opt-in, default tidak berubah):** prop baru `smallPrefix?: boolean` (default `false`). Bila `true`:

- Teks tampilan yang sudah dihitung (`displayMoneyText(formatSigned(...))`) dipecah dengan regex `^([−+-]?)(Rp)(.*)$` menjadi tanda, "Rp", dan angka. Fungsi murni baru `splitMoneyText(text)` (diekspor, dites). Bila tidak cocok, render biasa (tanpa pecah).
- Render: Text luar (semua style lama: `sizeStyle`, `TABULAR`, tone, `style`, `numberOfLines`, `adjustsFontSizeToFit`, `minimumFontScale`, `maxFontSizeMultiplier`) berisi `{tanda}<Text style={prefixStyle}>Rp</Text>{angka}`.
- `prefixStyle` = HANYA `{ fontSize: type.amountL.fontSize }` (20). Jangan set `lineHeight`, `fontFamily`, atau `color` di Text bersarang: ketiganya diwarisi dari Text luar (Inter-Bold, warna tone, `lineHeight: 44`), sehingga kotak baris tetap 44 dan warna negatif/netral ikut.
- **Baseline: tidak perlu penyejajaran manual.** Di React Native, Text bersarang adalah span di dalam SATU paragraf, bukan view terpisah; semua span berbagi baseline yang sama. Jangan pakai `View` berdampingan dengan `alignItems: 'baseline'` atau `marginTop` penyetel. (Beda dengan web: di web nested `<span>` juga sebaris, tetapi di RN Anda tidak bisa memakai `vertical-align`.)
- Tanda minus/plus tetap ukuran hero dan menempel ke "Rp" (bagian dari besaran angka). Minus tetap U+2212 (`displayMoneyText`), tidak diubah.
- **A11y:** saat `smallPrefix`, Text luar mendapat `accessibilityLabel = moneyAccessibilityLabel(text) ?? text` (contoh "Rp12.345.000", "minus Rp5.000"), jadi TalkBack membaca seluruh jumlah SEKALI, bukan "Rp" lalu angka terpisah. Tanpa `smallPrefix`, perilaku lama (label hanya bila ada tanda) tidak berubah.
- `displayMoneyText`, `moneyAccessibilityLabel`, `formatSigned`, dan tes lama di `Money.test.tsx` TIDAK diubah; tes lama tetap lulus karena default tidak memecah teks.
- Dipakai hanya di: `<Money amount={balances.actual} size="hero" smallPrefix fit style={{ flexShrink: 1 }} />`.

**Mask (saldo disembunyikan) harus berbentuk sama** supaya tata letak tidak melompat saat mata ditekan: `totalMask` menjadi `<Text ...>{BALANCE_MASK.slice(0, 2)}` dibungkus: `<Text style={prefixStyle}>Rp</Text>` + `{BALANCE_MASK.slice(2)}` (sisa " ••••••"). Tetap `accessibilityLabel="Saldo disembunyikan"`. `BALANCE_MASK` itu sendiri tidak berubah.

Tes baru di `Money.test.tsx`: (1) `splitMoneyText('−Rp5.000')` memberi `['−', 'Rp', '5.000']`; (2) `smallPrefix` menghasilkan Text bersarang dan label "Rp15.000"; (3) tanpa `smallPrefix` hasil identik dengan sekarang.

### 1d. Ganti blok "Bulan ini" dengan SATU pil Pengeluaran

- Hapus seluruh blok: `divider`, `Pressable monthBlock`, judul `monthTitle`, kolom Pemasukan dan Pengeluaran, `monthMask` di blok itu, dan style-nya (`monthBlock`, `monthPressed`, `monthTitleRow`, `monthTitle`, `monthCols`, `monthColsStacked`, `monthCol`). **`monthMask` tetap** (masih dipakai mask Tunai/Debit). Hapus juga `stackMonth`, `useWindowDimensions`/`fontScale` bila tidak dipakai lagi, dan impor `monthSummaryLabel`, `monthSummaryTitle`.
- Pengganti, di bawah "Pindah saldo", hanya bila `showMonth` (aturan sama seperti sekarang: `periods.length > 0 && kasEntries.length > 0`):

```tsx
<PillLink
  label="Pengeluaran"
  spokenLabel="Pengeluaran bulan ini"
  amount={summarizeMonth(kasEntries, thisMonth).moneyOut}
  hidden={balanceHidden}
  hint="Buka riwayat bulan ini"
  onPress={openMonthInRiwayat}
/>
```

- `openMonthInRiwayat` TIDAK berubah (reset filter, `setHistoryMonth(thisMonth)`, `router.push('/riwayat')`): pil membuka Riwayat bulan ini seperti blok lama.
- **Label: "Pengeluaran".** Satu kata, sama dengan label di kartu ringkasan Riwayat tujuan (K), dan terbaca penuh di 296dp (kira-kira 225dp untuk pil). Yang hilang: kata "bulan ini" tidak tampak di pil. Itu ditutup di a11y (`spokenLabel`) dan di tujuan (Riwayat membuka pada bulan yang sedang berjalan dengan pengalih bulan). Lihat butir A2 bagian 8 bila pemilik ingin "Pengeluaran bulan ini" tampak.
- Perubahan `PillLink` (kecil, tanpa dependensi): (1) prop opsional `spokenLabel?: string`; `accessibilityLabel` memakai `spokenLabel ?? label` (`"${x} Rp600.000"` atau `"${x}, saldo disembunyikan"`); (2) Text label diberi `flexShrink: 1` dan `numberOfLines={1}` TIDAK dipasang (biarkan membungkus bila ruang sempit), jumlah tidak menyusut. Tinggi tetap `MIN_TOUCH`, warna `brandTint`/`brandStrong`, ikon `chevron-forward` `ICON.sm`.
- Jumlah tampil positif `formatRupiah` seperti pil lain; kata "Pengeluaran" yang menyatakan arah. Tidak memakai `Money`.
- Disamarkan: `hidden={balanceHidden}` (PillLink sudah menampilkan `BALANCE_MASK` dan label a11y "..., saldo disembunyikan"). Pil tetap bisa diketuk.
- Pemasukan tidak tampil lagi di Beranda. Ia tetap ada di Riwayat (kartu ringkasan) dan di Laporan.
- `monthSummary.ts` (`monthSummaryTitle`, `monthSummaryLabel`) tidak lagi dipakai aplikasi, tetapi tesnya mengunci teksnya. JANGAN dihapus dalam pekerjaan ini; catat sebagai kode mati untuk dibersihkan bersama tesnya bila pemilik setuju.

### 1e. Hapus pil "Piutang (dipinjam anggota)" dan "Titipan"

- Hapus `<View style={styles.pills}>` dan dua `PillLink`, style `pills`. Hapus `creditHeld` dari `load` (dan dari `common`), karena tidak dipakai lagi; `kasReport.balances` tetap dipakai untuk `actual`, `tunai`, `debit`. `balances.piutang` tidak dipakai lagi di Beranda.
- **Pemeriksaan grid (dari kode, `index.tsx` baris 427-450): grid MASIH punya kedua ubin.** Baris kedua: ubin "Pinjaman" (`arrow-redo-outline`, `/loans`) dan ubin "Titipan" (`wallet-outline`, `/credits`). Keduanya tidak punya `disabledReason` (selalu aktif). Menu juga punya "Titipan anggota" dan "Pinjaman anggota". Jadi tidak ada jalan yang hilang; tidak ada yang perlu dikarang.
- Konsekuensi yang harus diketahui pemilik: JUMLAH Piutang dan Titipan tidak lagi tampil di Beranda (hanya di Laporan dan di layar Pinjaman/Titipan). Lihat butir A3.

### 1f. Urutan bagian Beranda tetap, komentar kepala berkas

Urutan tidak berubah: kartu kas, Langkah awal, Pengingat, kartu pertemuan, grid, "Sudah bayar hari ini", Terakhir. Ganti komentar kepala `index.tsx` (baris 39-42) menjadi:

```
// Home, top to bottom: kas card (Total kas with the eye right after the amount, Tunai, Debit, the "Pindah saldo"
// button, and ONE pill with this month's Pengeluaran that opens Riwayat for the month), first-run checklist (until set
// up), Pengingat (what to do now, from the pure homeReminders), the running meeting with its actions, the quick-action
// grid, who paid today, and the last three entries. All numbers come from the repositories; nothing is computed here.
// The eye hides every balance amount: Total kas, Tunai, Debit and the Pengeluaran pill. Pemasukan, Piutang and Titipan
// are no longer on this screen (Riwayat, Laporan, and the Pinjaman and Titipan screens show them). Every other screen
// is reachable from the grid or the Menu tab.
```

Tes: tidak ada tes yang menguji `index.tsx`. `quickActions.test`, `reminders.test`, `monthSummary.test` tidak terpengaruh.

---

## 2. B5 "Akhiri periode": satu tombol, merah outline

**Aturan:** di setiap layar yang menampilkan tombol masuk "Akhiri periode", gayanya `variant="dangerOutline"`, dan hanya SATU kali per layar.

**Beranda (ada duplikat). Keputusan: pertahankan tombol di kartu periode, hilangkan baris Pengingat `close_period`.**

Alasan:
1. Kartu periode adalah tempat aksi periode berada (Tutup pertemuan, Bayar tuan rumah, Ubah). Komentar `ReminderRow` sendiri berkata tombol Pengingat "never primary: that belongs to the meeting card".
2. Teks Pengingat ("Semua pertemuan sudah ditutup") sama persis dengan judul kartu; dengan baris dibuang, tidak ada kalimat kembar.
3. Aksi yang tidak bisa dibatalkan sebaiknya ada di tempat yang menjelaskan konteksnya; kartu menyebut nama periode.
4. Tidak menyentuh `reminders.ts` dan `reminders.test.ts` (fungsi murni tetap, perubahan hanya di tampilan).

Perilaku tepat:
- Kartu periode, cabang `week` kosong: `<Button label="Akhiri periode" variant="dangerOutline" onPress={...close} />` (dari `primary` ke `dangerOutline`).
- Di `index.tsx`: `const visibleReminders = reminders.filter((r) => r.kind !== 'close_period');` dan pakai `visibleReminders` untuk judul "Pengingat (n)", daftar, dan pengecekan kosong.
- Bagian Pengingat dirender bila `visibleReminders.length > 0 || (period && week)` (BUKAN `|| period`). Alasan: bila semua pertemuan tertutup dan tidak ada pengingat lain, tulisan "Semua beres. Tidak ada yang perlu dikerjakan sekarang." akan bertentangan dengan kartu di bawahnya yang masih meminta Akhiri periode. Maka bagian disembunyikan seluruhnya pada keadaan itu.
- Cabang `close_period` di `runReminder` boleh dibiarkan (kode tak terjangkau, tidak berbahaya) atau dihapus; pilih dibiarkan agar diff kecil.

**Layar lain:**
- Jadwal (`periods/[id]/index.tsx`): sudah `dangerOutline`, satu kali. Tidak berubah.
- Layar `close.tsx`: tombol akhir "Akhiri periode" tetap `variant="danger"` (merah penuh). Ini BUKAN tombol masuk, tetapi langkah penutup yang memunculkan dua dialog. `PROJECT.md` baris 694 sudah menetapkan "the final button on the close screen stays solid red". Pembedaan outline (masuk) dan solid (final) memberi sinyal bertingkat. Lihat butir A4: pemilik menulis "di mana pun muncul", mohon konfirmasi bahwa layar penutup dikecualikan.
- Galeri (`SectionB`) hanya contoh pengingat; tidak diubah.

Dokumen yang ikut diperbarui oleh PM: `PROJECT.md` baris 153 (daftar baris Pengingat: "all meetings closed -> Akhiri periode" sekarang tidak tampil di Beranda), baris 692 (tombol utama "Akhiri periode" menjadi merah outline), `wallet-patterns-spec.md` baris 85 dan 98.

---

## 3. G7: satu nama "Pembayaran"

**Aturan nama:**
- Fitur/layar DAFTAR pembayaran anggota = **"Pembayaran"** di semua ubin, tombol, dan judul header yang menuju layar itu.
- FORM pencatatan satu pembayaran (`periods/[id]/pay`) = kata kerja **"Catat pembayaran"**, hanya di dua tempat: tombol di layar anggota dan judul form.
- Alasan pemisahan: daftar dan form adalah dua layar berbeda dengan tugas berbeda. Menyamakan keduanya menjadi "Pembayaran" membuat judul form sama dengan judul daftar dan pengguna tidak tahu sedang di mana. Pola ini sama dengan "Catat kas" (kata kerja untuk aksi mencatat). Jadi masalah G7 (satu tujuan, tiga nama) selesai: satu tujuan sekarang punya satu nama.

Perubahan teks (semua UI, tanpa efek uang):

| Berkas | Dari | Ke |
|---|---|---|
| `(tabs)/index.tsx` ubin grid (baris 429) | `Iuran` | `Pembayaran` |
| `(tabs)/index.tsx` tombol kartu periode, kedua kemunculan (baris 385 dan 389) | `Catat pembayaran` | `Pembayaran` |
| `periods/[id]/payments.tsx` baris 93 (teks bantuan "...lewat halaman pembayaran (ketuk baris)") | `Pembayaran kedua di hari yang sama lewat halaman pembayaran (ketuk baris).` | `Pembayaran kedua di hari yang sama dicatat lewat halaman anggota: ketuk baris, lalu Catat pembayaran.` (kalimat lama kini ambigu karena "halaman pembayaran" adalah daftar itu sendiri) |
| `periods/[id]/pay.tsx` baris 124 | judul isi `Catat pembayaran` | HAPUS (judul header layar `_layout.tsx` sudah "Catat pembayaran"; menyisakan nama anggota sebagai baris pertama). Ini lanjutan G1 yang belum dikerjakan di layar ini |

Tidak berubah (sengaja):
- Header `_layout.tsx`: `payments` = "Pembayaran", `members/[memberId]` = "Pembayaran anggota", `pay` = "Catat pembayaran".
- Tombol Jadwal `Pembayaran` (sudah benar). Tombol di layar anggota `Catat pembayaran` (membuka form).
- `quickActions.ts`: kunci `iuran` tetap (identifier kode, bukan teks; mengubahnya hanya membuat tes ikut berubah). Teks alasan tetap.
- Nama JENIS catatan: chip filter "Iuran" (`history.ts`), `kasLabels` `member_payment: 'Iuran anggota'`, `reportLabels` "Pembayaran iuran", kolom CSV. Itu menamai jenis catatan, bukan layar. Istilah "iuran" (uang Rp15.000) tetap di glosarium.
- Teks yang dipin tes: `messages.test` "Pembayaran Rp30.000 dari Budi tersimpan", "Sebagian menjadi titipan - Rp30.000" (judul dialog, tidak diubah, juga bukan target G11), `errors.test`. Tidak satu pun berubah.

Glosarium `docs/specs/ui-language-review.md` bagian 2.1 (PM/developer perbarui):
- Baris "Iuran" (bagian B): kolom "Penjelasan di" menjadi "Bantuan di Buat periode dan Catat pembayaran" (sudah, tetap benar sebagai nama form).
- Tambah dua baris di bagian B:
  - **Pembayaran** | daftar anggota dengan tunggakan per periode | Halaman untuk melihat siapa yang sudah dan belum membayar iuran, dan membuka pencatatan. | Label. Satu nama untuk ubin Beranda, tombol Beranda, tombol Jadwal, dan judul halaman | Ganti: ubin `Iuran` dan tombol `Catat pembayaran` di Beranda menjadi `Pembayaran`.
  - **Catat pembayaran** | form satu pembayaran | Form mencatat satu pembayaran iuran anggota. Hanya tombol di halaman anggota dan judul form. | Bantuan di form | Tetap.
- Baris "Piutang" (bagian A): tambah catatan "Beranda tidak lagi menampilkan pil Piutang (keputusan 2026-11-13); jumlahnya ada di Laporan dan Pinjaman."
- Baris "Bulan ini" (bagian D): "Beranda: satu pil Pengeluaran bulan ini; ringkasan lengkap (Pemasukan dan Pengeluaran) di Riwayat."
- Opsional (bukan syarat): istilah "Pembayaran" di `src/ui/glossary.ts` (Istilah dalam aplikasi). `glossary.test` hanya mengunci nama grup, jadi aman.

Risiko lebar (cek HP): ubin grid lebar kira-kira 71dp di 360dp; "Pembayaran" (10 huruf, 14sp) kira-kira 75dp, bisa melebihi dan terpotong di tengah kata. Pada 392-412dp ubin 80-84dp, aman. Bila terpotong di HP pemilik: beri Text label `QuickAction` `numberOfLines={2}` dengan `adjustsFontSizeToFit` dan `minimumFontScale={0.85}`, BUKAN ganti kata (jangan kembali ke nama kedua).

---

## 4. G10 dan L3

- **G10**: tombol mata tetap hanya berlaku di Beranda. Tidak ada perubahan. Dicatat: pil Pengeluaran membuka Riwayat yang menampilkan jumlah apa adanya, sesuai keputusan ini (komentar kode sudah menyebut itu disengaja).
- **L3**: urutan bagian tab Laporan tetap. Tidak ada perubahan.

---

## 5. Aturan peringatan berulang (Bk1 dan R4)

**Aturan:** (1) Satu peringatan atau penjelasan muncul SATU kali per layar. (2) Rincian panjang pindah ke dialog yang dibuka tombolnya, atau ke balik tautan "Selengkapnya" (yang membuka dialog). (3) Teks yang sudah disetujui dipindah, tidak ditulis ulang; satu-satunya kalimat baru adalah satu baris pendek penunjuk. (4) Alasan tombol nonaktif (di bawah tombol) bukan pengulangan, karena ia menjelaskan keadaan tombol, bukan memperingatkan.

### Bk1: Cadangan (`backup/index.tsx`)

Kartu "Cadangan" menjadi: `lastSharedText` (body) -> `<Notice tone="warn">{BACKUP_WARNING}</Notice>` -> tombol "Buat dan bagikan cadangan". HAPUS dari layar: `<Text>{OFFSITE_HINT}</Text>` (baris 95) dan `<Text style={styles.caption}>{NO_ENCRYPTION_HINT}</Text>` (baris 97). Dialog `confirmBackup` TIDAK berubah (sudah memuat `BACKUP_WARNING`, `OFFSITE_HINT`, `NO_ENCRYPTION_HINT`). Impor tetap dipakai oleh dialog; `styles.caption` masih dipakai di bagian lain. Tes `backupLabels.test` tidak berubah (konstanta tidak diubah).

Alasan: pengguna yang menekan tombol memang membaca dialog; di layar, satu Notice warna kuning cukup (U, E). Catatan: kalimat "Jika HP hilang atau rusak, salinan di dalam HP ikut hilang" (alasan menyimpan di luar HP) kini hanya terlihat di dialog; `BACKUP_WARNING` tetap menyebut tujuan kirim ("diri sendiri atau Google Drive pribadi"). Kalimat `BACKUP_WARNING` ada di Notice dan di dialog; itu dua permukaan yang berbeda (layar lalu konfirmasi). Bila pemilik menganggapnya masih berulang, lihat butir A5.

### R4: Riwayat (`riwayat.tsx`)

Di kartu ringkasan, ganti `<Text style={styles.summaryNote}>` panjang (baris 98-101) dengan satu baris:

```
Hanya uang masuk dan keluar dari Tunai dan Debit.        Selengkapnya
```

- Teks pendek (baru, satu-satunya kalimat baru): **`Hanya uang masuk dan keluar dari Tunai dan Debit.`**
- Layout: `View` `flexDirection: 'row'`, `alignItems: 'center'`, `gap: spacing.sm`. Kiri: `Text` `summaryNote` (`type.secondary`, `textSecondary`) dengan `flex: 1`. Kanan: `Pressable` link.
- Link: teks **`Selengkapnya`**, `type.label` warna `colors.brandStrong` (sama seperti "Hapus filter"), `minHeight: MIN_TOUCH`, `justifyContent: 'center'`, `paddingHorizontal: spacing.sm`, `accessibilityRole="button"`, `accessibilityLabel="Selengkapnya tentang ringkasan"`. `maxFontSizeMultiplier={1.3}`.
- Aksi: `Alert.alert('Ringkasan bulan ini', FULL, [{ text: 'Tutup' }])`, `FULL` = teks lengkap yang sudah disetujui, KATA DEMI KATA: `Ringkasan ini menghitung uang yang masuk dan keluar dari Tunai dan Debit. Tidak dihitung: pindah saldo, pinjaman dan pelunasannya, saldo awal, tunggakan ditanggung kas, serta catatan yang sudah dikoreksi.` Simpan sebagai konstanta (mis. `SUMMARY_NOTE_FULL` di `src/ui/history.ts`) agar satu sumber; judul dialog dan tombol "Tutup" juga kata baru kecil (lihat bagian 7).
- Catatan filter ("Ringkasan memuat semua catatan bulan ini. Daftar di bawah sedang difilter.") TIDAK berubah, tetap di bawahnya.
- Alasan: daftar mulai lebih tinggi di layar (catatan lama 4-5 baris, kini baris 48dp). Dialog bukan komponen baru dan tidak menambah dependensi.

### Layar lain dengan pengulangan serupa

Hasil pembacaan layar yang diminta. Layar lain (kas/new, close, payout, loans, credits, members) tidak saya baca ulang di sesi ini; hanya yang tertulis di audit.

BOLEH DIBANGUN (trivial dan netral teks, hanya penempatan):
1. Beranda: baris Pengingat `close_period` dan tombol kartu periode (bagian 2).
2. Cadangan (Bk1) dan Riwayat (R4), di atas.

HANYA DILAPORKAN ke pemilik (perlu mengubah kata, mengurangi kalimat, atau menyentuh aturan tombol nonaktif):
- Pulihkan (`restore.tsx`, keadaan awal): Notice "Memulihkan mengganti data di HP ini dengan isi cadangan. Data tidak digabung." lalu `ONE_PHONE_HINT` ("...Data dari dua HP tidak bisa digabung."): "tidak digabung" dua kali, dan "Mulai dari nol" di bawahnya mengulang "Mengganti semua data". Perlu memilih kalimat mana yang dibuang. Dilaporkan, tidak dibangun.
- Cadangan: `BACKUP_WARNING` ("Berisi nama dan uang anggota...") dan `CSV_HINT` ("...Isinya memuat nama dan uang anggota.") menyatakan fakta yang sama di dua bagian layar. Perlu kalimat dikurangi.
- Form pembayaran (`pay.tsx`): pesan galat merah di bawah jumlah ("Jumlah harus kelipatan Rp15.000...") dan alasan di bawah tombol ("Ubah jumlah jadi kelipatan Rp15.000.") (audit P2). Menghapus salah satu menyentuh aturan "tombol nonaktif punya alasan". Dilaporkan.
- Jadwal (`periods/[id]/index.tsx`): dua kartu aksi dengan hint panjang ("Tutup pertemuan", "Akhiri periode") dan di bawahnya dialog yang mengulang (audit J3). Butuh lipat atau ringkas. Dilaporkan.
- Catat kas (`kas/new.tsx`): paragraf bantuan panjang (audit C4). Dilaporkan.

---

## 6. Kata kecil baru (semua UI, tanpa efek uang)

### M3: "Terlambat" di Menu (`menu.tsx`)

- `MenuRow`: bila `warning`, tampilkan setelah label: `<Dot tone="error" />` lalu `<Text style={styles.warningText}>Terlambat</Text>` (`type.label`, `colors.error`, `flexShrink: 0`). Titik tetap (K dengan Beranda), kata menambah sinyal selain warna (A).
- A11y: label baris tidak berubah (`"${label}. ${warning}"` = "Cadangan dan ekspor. Cadangan terlambat"); Dot dan Text "Terlambat" tidak dibaca terpisah (`importantForAccessibility="no-hide-descendants"` pada kelompok itu, karena `Pressable` sudah punya label).
- Kontras: `#B3261E` di `bgMute` `#EEF0F5` kira-kira 5,7:1, memenuhi AA untuk teks 14 bold.
- Lebar: pada 360dp, baris 296dp: ikon 24 + label "Cadangan dan ekspor" (16sp, kira-kira 165dp) + titik 10 + "Terlambat" (kira-kira 65dp) + panah 24 + padding dan gap melebihi 296. Karena `flexShrink` bawaan RN adalah 0, label akan terpotong. Maka: `rowLabel` diberi `flexShrink: 1` dan baris `height: ROW_HEIGHT` diganti `minHeight: ROW_HEIGHT` (sejalan M1/G8), sehingga label membungkus menjadi dua baris bila perlu. Bila pemilik tidak suka label dua baris: alternatif, "Terlambat" sebagai baris kedua di bawah label (cek HP). Spacer `flex: 1` tetap.

### Rs1: alasan di bawah tombol Pulihkan (`restore.tsx`, `backupLabels.ts`)

- Tombol di keadaan `review`: tambah `disabledReason={phrase ? phraseReason(phrase) : undefined}`.
- **Jangan pakai `phraseInstruction`.** Alasan: kalimatnya ("Untuk melanjutkan, ketik PULIHKAN di bawah ini.") sudah tampil tepat di atas kolom (jadi muncul dua kali di layar yang sama, melanggar aturan bagian 5), dan "di bawah ini" menunjuk arah yang salah bila dibaca di bawah tombol (kolomnya di atas).
- Teks baru pendek, mengikuti pola alasan lain ("Isi jumlah dulu.", "Buat periode dulu."): **`Ketik ${phrase} dulu.`** (jadi "Ketik PULIHKAN dulu." atau "Ketik HAPUS SEMUA dulu."). Fungsi murni baru `phraseReason(phrase)` di `backupLabels.ts` dengan tes; `phraseInstruction` tidak diubah.
- `Button` sudah menampilkan alasan di bawah tombol dan sebagai `accessibilityHint` saat nonaktif; tidak ada kode tombol baru. Jarak tombol ke "Batal" (Rs3) tidak diubah di sini.

### B7: label a11y daftar Langkah awal (`index.tsx`)

- Tiap baris item: tambah `accessible` dan `accessibilityLabel={`Langkah ${index + 1}: ${item.label}, ${item.done ? 'selesai' : 'belum'}`}`. Teks tampil (`✓`/`○`, nomor, label, coret) tidak berubah. Pembaca layar tidak lagi membaca glyph `✓`/`○`.
- Kata baru: "selesai" dan "belum" (ditulis huruf kecil di tengah kalimat; disetujui pemilik sebagai "Selesai"/"Belum"), dan "Langkah" (sudah menjadi judul kartu "Langkah awal").

### G11: pemisah "·" menggantikan " - " di baris sekunder

- Buat konstanta di berkas baru kecil `src/ui/separator.ts`: `export const SEP = ' · ';` (spasi tak terputus SEBELUM titik, spasi biasa sesudahnya). Dengan ini titik tidak bisa lepas ke awal baris dan "Pertemuan 1 ·" tidak berakhir menggantung dengan tanggal di baris berikutnya tanpa penanda (kasus di audit G11).
- Ganti " - " menjadi `${SEP}` di TEMPAT PERSIS ini (teks tampilan baris sekunder/ringkasan saja):
  - `src/ui/components/HistoryRow.tsx:56` `.join(' - ')` (baris kedua "Dedi · Masuk ke Tunai"; ini juga dipakai baris "Terakhir" di Beranda).
  - `(tabs)/index.tsx:367` "Pertemuan N - tanggal".
  - `(tabs)/laporan.tsx:81-82` "Aktif - mulai ..." dan " - sampai ...".
  - `periods/[id]/index.tsx:83-84` ("Aktif - N anggota - mulai ..." dan " - sampai ...") dan `:124` ("Pertemuan N - tanggal").
  - `periods/new.tsx:170-171` ("Pertemuan N - tanggal", " - Belum ditentukan", " - tuan rumah otomatis").
  - `periods/[id]/members/[memberId].tsx:87` dan `:103` ("... - tanggal", "tanggal - Rp...").
  - `periods/[id]/payout.tsx:134` ("Pertemuan N (tanggal) - nama").
  - `kas/[entryId].tsx:137` dan `:145` ("tanggal - Rp...", "tanggal - Alasan: ...").
  - `reports/period/[id]/index.tsx:46-47`, `:73`, `:80`; `reports/period/[id]/meetings/[number].tsx:40`; `reports/period/[id]/members/[memberId].tsx:65`.
- JANGAN diubah:
  - `messages.ts:15` judul dialog "Sebagian menjadi titipan - Rp..." (dipin `messages.test`, dan teks dialog).
  - `reportLabels.ts:110`/`EXPECTED_FORMULA` dan `glossary.ts:24` (tanda minus hitungan, bukan pemisah).
  - `payout.tsx:194` (`- pertemuan N: ...` adalah penanda butir daftar).
  - Semua kolom, nilai, dan petunjuk CSV, `csvFiles.ts`, `formatSigned`/`formatRupiah` (`-Rp5.000` tetap hubung ASCII), tanda negatif di `Money`.
- Tidak ada tes yang mengunci baris sekunder di atas (dicek dengan Grep). `truncation.qa.test.tsx` tidak saya baca; jalankan seluruh tes.
- Pembacaan TalkBack untuk "·" belum saya periksa (bisa dibaca "titik" atau dilewati). Cek HP bagian 9.

### R2: baris "Filter aktif (n)" di Riwayat (`riwayat.tsx`), bentuk minimal

- Kondisi sekarang: baris `clearRow` (hanya tautan "Hapus filter" rata kanan) tampil bila `!isFilterEmpty(filter)`. JANGAN membangun ulang R2 (satu baris Filter + chip sudah ada di `filterRow`).
- Ubah `clearRow` menjadi `flexDirection: 'row'`, `alignItems: 'center'`, `justifyContent: 'space-between'`. Tambah di kiri `<Text style={styles.summaryNote}>` (`type.secondary`, `textSecondary`, `flexShrink: 1`): **`Filter aktif (n)`**. Tautan "Hapus filter" tetap di kanan, tidak berubah (`minHeight: MIN_TOUCH`).
- `n` = `activeFilterCount(filter) + (filter.group !== null ? 1 : 0)`: semua yang mempersempit daftar, karena "Hapus filter" (`resetHistoryFilter`) menghapus chip juga. Tombol "Filter (n)" TIDAK diubah (ia hanya menghitung isi layar Filter). Lihat butir A6.
- Jangan tambah `accessibilityRole` ke teksnya; `accessibilityLiveRegion` tidak perlu.

### Teks baru: ringkasan

| Teks | Tempat | Catatan |
|---|---|---|
| `Selengkapnya` | Riwayat, tautan ringkasan | Kata pendek |
| `Hanya uang masuk dan keluar dari Tunai dan Debit.` | Riwayat, baris pendek R4 | Satu kalimat baru |
| `Ringkasan bulan ini` (judul dialog) dan `Tutup` (tombol) | Dialog Selengkapnya | Dialog baru; `Tutup` sudah dipakai di app |
| `Pengeluaran` (label pil), `Pengeluaran bulan ini` (a11y) | Beranda | Kata sudah ada di glosarium/Riwayat |
| `Terlambat` | Menu | Disetujui |
| `Ketik PULIHKAN dulu.` / `Ketik HAPUS SEMUA dulu.` | Pulihkan | Pola "..., dulu." |
| `Langkah n: label, selesai/belum` | A11y Langkah awal | Tidak tampil |
| `Filter aktif (n)` | Riwayat | Disetujui |
| `Pembayaran` (ubin, tombol Beranda) | Beranda | G7 |
| `Pembayaran kedua ... dicatat lewat halaman anggota: ketuk baris, lalu Catat pembayaran.` | payments.tsx | Penyesuaian karena G7 |

---

## 7. Token yang dipakai (tidak ada token baru)

`type.hero` (digit total kas), `type.amountL` (prefiks "Rp", Tunai/Debit), `type.label`, `type.secondary`, `colors.text`, `colors.textSecondary`, `colors.error`, `colors.brandStrong`/`brandTint`/`brandTintPressed` (pil), `colors.bgMute` (tekan mata), `spacing.xs/sm/md/lg`, `radius.pill`, `MIN_TOUCH` 48, `ICON.md`/`ICON.sm`. Tidak ada warna atau ukuran baru.

---

## 8. Titik ambigu yang butuh pemilik

- **A1 (Pindah saldo)**: dengan kolom tombol dihapus, "Pindah saldo" saya pindah ke bawah Tunai/Debit karena kolom Total terlalu sempit untuk angka hero + mata (bagian 1). Bila pemilik ingin tetap di samping Total, perlu menerima angka mengecil banyak di 360dp; saya tidak menyarankan.
- **A2 (label pil)**: "Pengeluaran" tidak memuat "bulan ini". Alternatif: "Pengeluaran bulan ini" (kira-kira 295dp, penuh di 360dp dengan jumlah besar, label membungkus) atau "Keluar bulan ini" (kata "Keluar" dipakai di CSV, bukan di UI). Rekomendasi: tetap "Pengeluaran".
- **A3 (info hilang di Beranda)**: jumlah Piutang dan Titipan tidak lagi tampil di Beranda; pemilik harus membuka Laporan atau layar Pinjaman/Titipan. Pemilik sudah memutuskan; dicatat sebagai konsekuensi. Glosarium D9 ("Piutang (dipinjam anggota)" di semua layar) tidak lagi berlaku untuk Beranda.
- **A4 (layar penutup)**: tombol akhir di `close.tsx` saya biarkan merah penuh (`danger`) sesuai `PROJECT.md`; ia bukan tombol masuk. Konfirmasi.
- **A5 (Bk1)**: `BACKUP_WARNING` tampil di Notice dan di dialog. Saya biarkan karena dialog harus utuh. Pemilik boleh memutuskan dialog hanya memuat `OFFSITE_HINT` dan `NO_ENCRYPTION_HINT`; itu mengubah susunan dialog, bukan kata.
- **A6 (R2)**: hitungan "Filter aktif (n)" memasukkan chip jenis, sedangkan tombol "Filter (n)" tidak. Bila pemilik ingin sama, hapus chip dari hitungan (maka bila hanya chip aktif, tulis `Filter aktif` tanpa angka).
- **A7 (Pengingat versus kartu, di luar permintaan)**: pola yang sama (Pengingat dan kartu periode sama-sama punya tombol) ada untuk "Tutup pertemuan", "Bayar tuan rumah", "Tentukan tuan rumah". Aturan "satu kali per layar" yang dipilih pemilik hanya saya terapkan ke "Akhiri periode". Bila ingin diperluas, itu keputusan terpisah.
- **A8 (kode mati)**: `monthSummaryTitle` dan `monthSummaryLabel` tidak lagi dipakai; hapus bersama tesnya atau biarkan.

---

## 9. Yang harus dicek pemilik di HP (font normal)

1. Beranda 360dp bila ada: angka Total kas besar (mis. Rp100.000.000) tidak terpotong, mata tetap terlihat; tombol mata bisa ditekan dengan satu tangan.
2. Total kas: "Rp" kecil sejajar baseline dengan digit (tidak melayang atau turun); `fit` menyusutkan prefiks bersama digit (perilaku span bersarang di Android, belum diuji); minus pada saldo negatif.
3. Mask saldo: bentuk sama dengan angka (tidak melompat); TalkBack: "Saldo disembunyikan".
4. TalkBack pada Total kas: dibaca sekali "Rp..." (bukan "Rp" lalu angka).
5. Pil Pengeluaran: terbaca "Pengeluaran bulan ini Rp...", membuka Riwayat bulan ini, tersamar saat mata menutup.
6. Ubin "Pembayaran": tidak terpotong di tengah kata pada HP 360dp.
7. Beranda saat semua pertemuan tertutup: tombol "Akhiri periode" merah outline sekali; tidak ada "Semua beres" bersama kartu itu.
8. Menu dengan cadangan terlambat: "Terlambat" terbaca, label tidak terpotong.
9. Pulihkan: alasan "Ketik PULIHKAN dulu." muncul di bawah tombol nonaktif dan hilang setelah frasa benar.
10. TalkBack untuk pemisah "·" pada baris Riwayat dan Jadwal.
11. Riwayat: baris pendek + "Selengkapnya" muat, dialog terbaca penuh.
12. Cadangan: hanya satu Notice dan satu tombol sebelum bagian CSV; dialog konfirmasi masih memuat ketiga teks.

## 10. Berkas yang disentuh (ringkas)

`src/app/(tabs)/index.tsx`, `src/ui/components/Money.tsx` (+ `Money.test.tsx`), `src/ui/components/PillLink.tsx`, `src/app/(tabs)/riwayat.tsx` (+ konstanta di `src/ui/history.ts`), `src/app/(tabs)/menu.tsx`, `src/app/backup/index.tsx`, `src/app/backup/restore.tsx`, `src/ui/backupLabels.ts` (+ tes), `src/app/periods/[id]/payments.tsx` (satu kalimat), `src/app/periods/[id]/pay.tsx` (hapus judul isi), berkas baru `src/ui/separator.ts`, daftar berkas G11 di bagian 6. Dokumen: `docs/specs/ui-language-review.md`, `PROJECT.md` (catat keputusan; baris 153, 692), `docs/specs/wallet-patterns-spec.md` (baris 85, 98), `docs/qa/cek-hp-3.md` (baris R3 menyebut "Catat kas" di kartu kas Beranda; kini tidak ada).

---

## 11. Batch worth-it (2026-11-13)

Penulis: ui-ux-designer. Status: SPESIFIKASI. Tidak ada kode diubah. Hanya UI. Tanpa perubahan aturan uang, `src/domain`, `src/db`, migrasi, CSV, `format.ts`, atau teks dialog yang dipatok tes. TEXT-NEUTRAL: tidak ada kata baru dan tidak ada kata yang berubah; hanya kata yang sudah ada dipindah, dipakai ulang, atau (satu kasus, J4) tidak lagi tampil sebagai tombol. Font NORMAL saja. A7 tidak disentuh (baris Pengingat Beranda tidak diubah, termasuk saat B6 menyentuh kartu pertemuan yang sama). Saya TIDAK melihat layar di perangkat; semua di bawah dari membaca kode pada HEAD `187ff52` (`src/app`, `src/ui/components`, `src/ui/gallery`). Yang perlu dicek di HP ada di 11.5.

### 11.1 Verifikasi per temuan (kode sekarang)

| ID | Status | Alasan (bukti di kode) | Putusan |
|---|---|---|---|
| G3 | BERLAKU | `(tabs)/index.tsx` (container `gap: lg`), `laporan.tsx` dan `periods/[id]/index.tsx` (`gap: md`), `members/index.tsx` (`form gap: md`): `SectionHeader` berjarak sama dari kartu atas dan kartunya. Cadangan sudah benar (bungkus `View gap: sm`). Commit 2b20e60..187ff52 tidak mengubah pola ini. | Bangun (11.2-1) |
| G4 | SEBAGIAN | Menu sudah punya panah. `restore.tsx` baris keselamatan sudah punya "Pulihkan" + panah sendiri. Selebihnya `ListRow` yang punya `onPress` TIDAK punya panah: kartu pertemuan Beranda (3 baris), Laporan (periode), Cadangan ("Pulihkan dari cadangan"), Anggota, `periods/index`, `loans/index`, `reports/period/*`. | Bangun versi sempit: panah otomatis di `ListRow`, tanpa gaya baris baru (11.2-2) |
| B6 | BERLAKU | Kartu pertemuan Beranda masih tiga `ListRow tone="alt"` berjarak 8dp (gap Card), tanpa panah; "Tutup pertemuan N" (merah) menempel di "Ubah tuan rumah / tanggal". Hanya teks tombol utama yang berubah oleh 2b20e60 ("Pembayaran"). | Bangun (11.2-3) |
| R3 | SEBAGIAN | Setelah R2 (sudah dibangun), "Filter" ada di kiri dan `chipScroll` (`flex: 1`) berhenti di garis padding kanan layar, jadi chip terpotong di tengah layar bukan di tepi: BERLAKU untuk sisi kanan. "Label pecah dua baris": TIDAK berlaku, karena `ScrollView` horizontal mengukur anak tanpa batas lebar, sehingga label tidak membungkus. `numberOfLines` pada `Chip` justru bisa memotong label di baris `flexWrap` lain (tanggal, jumlah cepat); tidak dipasang. | Bangun hanya potong di tepi (11.2-4) |
| R5 | BERLAKU | `HistoryRow` `Pressable role=button` tanpa `accessibilityLabel`; ikon Ionicons tanpa penanda dekorasi; tanda +/- dibaca tergantung mesin. | Bangun (11.2-5). Tanpa kata baru |
| J1 | BERLAKU | `periods/[id]/index.tsx`: "Terbuka" (`styles.open`, teal) dan "Ditutup" (`styles.closed`, abu) masih teks biasa; `Badge` sudah ada dan punya nada `brand` dan `neutral`. | Bangun, hanya "Terbuka" dan "Ditutup" (11.2-6) |
| J2 | SEBAGIAN | Pertemuan berjalan (`oldestOpen`) tetap tidak dibedakan. Tetapi lencana "Pertemuan berjalan" hanya ada sebagai potongan kalimat di `laporan.tsx` ("pertemuan berjalan" huruf kecil), bukan label berdiri: KATA BARU. | Bangun bagian tanpa kata (garis aksen kiri 4dp); lencana berkata: BUTUH KATA PEMILIK |
| J3 | BERLAKU, DITUNDA | Dua kartu aksi dengan hint panjang masih mendahului/menyusul jadwal. Setiap cara memendekkan hint butuh baris ringkas baru (tidak ada kalimat pendek yang sudah disetujui untuk kartu ini). Memindah kartu "Tutup pertemuan" ke bawah daftar menyembunyikan aksi mingguan di akhir 10-12 kartu: lebih buruk. | TIDAK dibangun. BUTUH KATA PEMILIK (11.3) |
| J4 | SEBAGIAN | Pertemuan ditutup dan sudah dibayar (periode aktif) masih membawa tombol `secondary` selebar penuh "Lihat pembayaran tuan rumah", berulang per kartu. Tombol "Bayar tuan rumah" (primer) dan "Ubah" pada pertemuan terbuka tidak diubah. | Bangun versi sempit: hanya kartu ditutup + dibayar jadi satu area ketuk (11.2-7) |
| J5 | BERLAKU | `View` teks kartu pertemuan tanpa `gap`; `row` `padding: md` sementara kartu lain `lg`. | Bangun (11.2-6, satu berkas dengan J1) |
| C2 | BERLAKU | `kas/new.tsx` baris 312-313: kedua `IconChoice` transfer sama-sama `arrow-forward-outline`. | Bangun (11.2-8) |
| L2 | BERLAKU | `laporan.tsx`: tombol primer "Buka {periode}" dan baris `ListRow` untuk periode yang sama (urutan `periods.list` = `start_date DESC`, `defaultReportPeriod` memilih aktif atau terbaru, jadi hampir selalu baris pertama). | Bangun (11.2-9) |
| Bk3 | BERLAKU, LEBIH LUAS | `backup/index.tsx`: Notice `busy` DAN Notice galat paling atas di dalam `ScrollView`; saat tombol CSV di bawah ditekan keduanya di luar layar (galat berbagi gagal juga tidak terlihat). | Bangun (11.2-10) |
| Rs1 | (dilewati, selesai) | | |
| Rs2 | BERLAKU | `restore.tsx` review: dua `Card` bertumpuk, nilai `Text` tanpa `TABULAR`. | Bangun versi sempit (11.2-11) |
| Ag2 | BERLAKU | `members/index.tsx`: baris anggota tanpa panah; mode ubah: tombol merah "Hapus anggota"/"Arsipkan anggota" berjarak `sm` (8) dari Simpan/Batal. Ag1 sudah selesai (label "Nama anggota" ada). Ag3 (`radius.sm` pada `editRow`) ikut diperbaiki karena baris yang sama. | Bangun (11.2-12) |
| Gl1 | SEBAGIAN | Sudah ada: `smallPrefix` (SectionC), `HISTORY_CORRECTED` (masuk, tidak flat), `HISTORY_FLAT`, tanda + / - / tanpa (hanya ukuran `large`). Kurang: tanda di empat ukuran, baris dikoreksi arah keluar dan versi flat, kasus ditekan, kasus baru batch ini, judul grup masih `titleM`. Kontrol filter satu baris adalah isi layar, bukan komponen: tidak masuk galeri. | Bangun (11.2-13) |

Urutan pengerjaan yang disarankan (kecil dan aman dulu): C2, J5+J1, L2, Ag2, B6, R3, Bk3, R5, G4 (komponen), G3, J4, Rs2, Gl1 (galeri ikut tiap langkah).

### 11.2 Spesifikasi per temuan yang dibangun

Semua memakai token yang ada di `src/ui/theme.ts`. Tidak ada warna, ukuran, atau ikon baru kecuali `chevron-forward` (sudah dipakai Menu, `PillLink`, `restore.tsx`).

**1. G3: pola Section (K)**

- Berkas: BARU `src/ui/components/Section.tsx`; dipakai di `(tabs)/index.tsx`, `(tabs)/laporan.tsx`, `periods/[id]/index.tsx`, `members/index.tsx`.
- `Section` props: `title: string`, `actionLabel?`, `onAction?` (diteruskan ke `SectionHeader`), `contentGap?: number` (default `spacing.sm`), `children`. Render: `View style={{ gap: spacing.sm }}` berisi `SectionHeader` lalu `View style={{ gap: contentGap }}` dengan `children`. `SectionHeader` tidak diubah.
- Aturan: judul ke isinya `sm` (8); antar bagian = gap kontainer layar. Beranda: kontainer tetap `lg`. Laporan: kontainer `gap: md` menjadi `lg`, bagian berisi judul + `EXPECTED_SUBTITLE` (kalau ada) + kartu. Jadwal: kontainer `md` menjadi `lg`, `Section title="Jadwal" contentGap={spacing.md}` membungkus semua kartu pertemuan (jarak antar kartu tetap 12).
- Beranda: tiga bungkus: `Pengingat` (+ Notice galat `actionError` di dalam isinya, setelah Card), judul `paidView.summary` (dengan "Lihat") + Card, "Terakhir" (dengan "Lihat semua riwayat") + Card. `visibleReminders` dan kondisi `period && week` TIDAK diubah (A7).
- Anggota: judul "N anggota" + teks petunjuk dibungkus `Section` (isi: petunjuk). Form `gap: md` tetap di atasnya.
- Tidak berubah: Cadangan, Pulihkan (sudah benar). Layar lain yang memakai `SectionHeader` (`kas/[entryId]`, `reports/period/*`, `periods/new`, `close`, `members/[memberId]`, `meetings/[number]`, `istilah`, `loans/[memberId]`): TIDAK disentuh batch ini; catat sebagai lanjutan.
- Galeri: tambah demo "Section" di `SectionD`: dua bagian berurutan dalam kontainer `gap: lg`, satu dengan `actionLabel`, satu dengan `contentGap: md` dan tiga baris.

**2. G4: panah otomatis pada ListRow (K, versi sempit)**

- Berkas: `src/ui/components/ListRow.tsx`; pemakai yang harus diberi `chevron={false}`: baris salinan pengaman `restore.tsx` (sudah punya "Pulihkan" + panah), dan baris "Tutup pertemuan" Beranda (membuka dialog, bukan layar).
- Prop baru: `chevron?: boolean`, default `Boolean(onPress)`. Bila true: ikon `Ionicons name="chevron-forward"` `size={ICON.sm}` (20) `color={colors.textTertiary}` setelah `right` (urutan: `main` | `right` | panah), `flexShrink: 0`, `accessibilityElementsHidden`/`importantForAccessibility="no"`. Kontras 636A7B di atas EEF0F5 kira-kira 4,8:1 (hitungan, bukan ukur), di atas FFFFFF lebih tinggi; melampaui 3:1 untuk ikon.
- Tidak ada gaya baris baru: `tone` default/alt/danger tetap. Dua gaya yang dimaksud audit terpenuhi oleh aturan "dapat diketuk = ada panah, informasi = tanpa panah". Baris Jadwal (kartu putih) bukan `ListRow` dan tidak disatukan di sini.
- Tinggi baris tidak berubah (`minHeight: 48`). Lebar: `right` berisi `Money` heading (kira-kira 110dp untuk Rp12.345.000) + panah 20 + gap 8 masih muat di 296dp dengan judul `flex: 1` membungkus.
- Galeri (`SectionB`, bagian ListRow): dapat ditekan tanpa dan dengan `right` Money T8 (jumlah tidak terdorong keluar), `chevron={false}` pada baris dapat ditekan, baris tidak dapat ditekan tidak punya panah.
- Tes: `truncation.qa.test.tsx` perlu dijalankan ulang (baris `ListRow` bertambah satu elemen).

**3. B6: kartu pertemuan Beranda (U)**

- Berkas: `(tabs)/index.tsx`, cabang `week.hostMemberId !== null`.
- "Bayar tuan rumah" / "Lihat pembayaran tuan rumah" dan "Ubah tanggal" / "Ubah tuan rumah / tanggal": panah otomatis (G4). Teks, `right` ("Sudah dibayar") dan tujuan tidak berubah.
- "Tutup pertemuan N": `chevron={false}`; bungkus dalam `View style={{ marginTop: spacing.md }}`. Jarak total ke baris di atasnya = gap Card 8 + 12 = 20dp (dua kali jarak antar baris biasa). Tanpa garis pemisah (menghindari garis ketiga di kartu). Merah (`destructive`) dan dialog konfirmasi tidak berubah.
- Cabang `hostMemberId === null` dan tombol "Pembayaran": tidak berubah. Baris Pengingat: tidak disentuh.

**4. R3: chip sampai tepi layar (E, versi sempit)**

- Berkas: `(tabs)/riwayat.tsx`.
- `chipScroll`: `{ flex: 1, marginRight: -spacing.lg }`. `chips` (contentContainerStyle): `{ gap: spacing.sm, paddingRight: spacing.lg }`. Hasil: chip bergulir sampai tepi kanan layar dan chip terakhir berhenti dengan jarak 16 dari tepi saat digulir habis. Sisi kiri tidak berubah (dibatasi tombol "Filter").
- `FlatList` `list` padding `lg` tetap. Tidak ada perubahan `Chip`.

**5. R5: label pembaca layar baris riwayat (A)**

- Berkas: `src/ui/history.ts` (fungsi murni baru `historyRowLabel`) + tes di berkas tes history yang ada; `HistoryRow.tsx` (pakai).
- `historyRowLabel(parts)` = `[title, memberName, historyFlowText(e), formatRupiah(e.amount), note, peringatanTanpaPos, 'Dikoreksi' bila corrected].filter((s) => s !== '').join(', ')`. Hanya kata yang sudah tampil di baris. Arah masuk/keluar sudah dibawa kata "Masuk ke"/"Keluar dari" di `historyFlowText`, jadi TIDAK perlu kata "masuk/keluar" baru. Jumlah tanpa tanda (`formatRupiah`, bukan `formatSigned`), agar tidak bergantung pada pembacaan "+" atau "-".
- `HistoryRow`: `Pressable` mendapat `accessibilityLabel={historyRowLabel(...)}`; `View` ikon mendapat `importantForAccessibility="no"` dan `accessibilityElementsHidden`. Tampilan tidak berubah. Berlaku juga untuk baris "Terakhir" di Beranda (komponen sama).
- Contoh yang diharapkan dites: `Pembayaran, Dedi, Masuk ke Tunai, Rp50.000`; baris dikoreksi: `..., Rp50.000, Dikoreksi`; entri tanpa anggota: bagian anggota dilewati (tidak ada koma ganda); transfer: `Pindah saldo, Tunai ke Debit, Rp100.000`. (Judul persisnya dari `entryTitle`; developer menulis tes dari keluaran nyata.)
- Galeri: baris yang ada sudah mencakup 8 jenis; cukup tambah caption "Cek TalkBack: dibaca satu kalimat" pada Demo `Delapan jenis` (teks galeri, bukan teks pengguna).

**6. J1 + J5: kartu pertemuan Jadwal (K, E)**

- Berkas: `periods/[id]/index.tsx`.
- J5: `View` teks (yang membungkus judul, tuan rumah, status): tambah `style={{ gap: spacing.xs }}`; `row` `padding: spacing.md` menjadi `spacing.lg`.
- J1: ganti `<Text style={styles.open}>Terbuka</Text>` dengan `<Badge label="Terbuka" tone="brand" />` dan `<Text style={styles.closed}>Ditutup</Text>` dengan `<Badge label="Ditutup" tone="neutral" />`. Hapus style `open` dan `closed` bila tidak dipakai lagi (`closed` masih dipakai baris "Pembayaran tuan rumah: sudah dibayar"; biarkan). Baris "Pembayaran tuan rumah: sudah dibayar" tetap teks abu (lencana "Tuan rumah dibayar" = kata baru, tidak dibangun).
- Urutan teks di kartu tidak berubah. `Badge` sudah `alignSelf: 'flex-start'`.

**7. J4: kartu pertemuan ditutup dan dibayar jadi satu area ketuk (U, versi sempit)**

- Berkas: `periods/[id]/index.tsx`.
- Berlaku hanya bila `canViewPayout && w.status === 'closed'` (periode aktif, dibayar, ditutup; pertemuan terbuka yang sudah dibayar tidak berubah: masih "Ubah tanggal" + "Lihat pembayaran tuan rumah").
- Kartu `row` menjadi `Pressable accessibilityRole="button"` dengan `onPress` ke `/periods/[id]/payout?week=N` (sama dengan tombol lama), gaya `pressed`: `backgroundColor: colors.bgMute`. Isi: teks yang ada + baris "Pembayaran tuan rumah: sudah dibayar" (kini tampil juga untuk kasus ini; kalimat yang sudah ada di kode) + panah `chevron-forward` `ICON.sm` `textTertiary` di kanan tengah (baris `flexDirection: 'row'`, teks `flex: 1`).
- Tombol "Lihat pembayaran tuan rumah" dihapus dari kartu ini. Kata "Lihat pembayaran tuan rumah" tetap ada di `accessibilityLabel` kartu: `` `Pertemuan ${n}, ${nama tuan rumah}, Ditutup, Lihat pembayaran tuan rumah, sudah dibayar` `` (semua potongan sudah ada). Ini penghapusan tampilan sebuah tombol; mohon pemilik menyadarinya (lihat 11.3 butir 3).
- Pertemuan yang butuh aksi ("Bayar tuan rumah" primer, "Tentukan", "Ubah") tidak berubah.

**8. C2: dua arah transfer berbeda ikon (A)**

- Berkas: `kas/new.tsx` baris 313: ikon "Debit ke Tunai" menjadi `arrow-back-outline` (baris 312 tetap `arrow-forward-outline`). Label dan `accessibilityLabel` tidak berubah. Pengecualian: tidak ada tes yang mengunci ikon (cek: `truncation.qa.test` hanya memakai label).
- Galeri: `SectionE` IconChoice sudah memiliki 2 ubin; ganti ikon contoh pasangan sama agar galeri mencerminkan layar.

**9. L2: periode tidak muncul dua kali (U)**

- Berkas: `(tabs)/laporan.tsx`.
- Hapus `<Button label={`Buka ${preferred.name}`} .../>` dan `preferred`/`defaultReportPeriod` bila tidak dipakai lagi (impor ikut dibuang; fungsinya di `src/domain` tidak disentuh). Daftar `ListRow` tetap (urutan sudah terbaru dulu), kini dengan panah (G4). Satu jalan masuk per periode, tidak ada tombol primer di bagian bawah tab, bagian "Laporan per periode" tampil di dalam `Section`.
- `Notice` "Belum ada periode." tetap.
- Keputusan: tidak menambah lencana pada baris pertama (butuh kata). Status "Aktif" hijau di `RowText` sudah menandai periode berjalan.

**10. Bk3: umpan balik berjalan dan galat selalu terlihat (U)**

- Berkas: `backup/index.tsx`.
- Pindahkan `{busy ? <Notice tone="info">{busy}</Notice> : null}` dan `{error ? <Notice tone="danger">{error}</Notice> : null}` keluar dari `ScrollView`, ke blok di atasnya: `View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm }}`, dengan pembungkus layar `View style={{ flex: 1 }}`. Teks tidak berubah. Blok hanya ada saat salah satunya tampil (layar tidak bergeser saat idle).
- `ScrollView` `container` padding atas tetap `lg`.
- Catatan: `Button loading` tidak dipakai (label a11y "sedang menyimpan" akan menjadi pernyataan baru untuk ekspor CSV).

**11. Rs2: satu kartu pembanding (U, versi sempit)**

- Berkas: `backup/restore.tsx` (keadaan `review`).
- Ganti `View compare` dengan SATU `Card`. Baris pertama: dua judul berdampingan (`flexDirection: 'row'`, `gap: spacing.lg`, tiap `flex: 1`): kiri "Di HP ini sekarang", kanan `isReset ? 'Setelah mulai dari nol' : 'Isi cadangan'` (teks sudah ada, `styles.heading` titleM; boleh membungkus dua baris). Lalu satu blok per butir dari `summaryRows(live)` dan `summaryRows(candidate)` (indeks sama, label sama, dicek `summaryRows` di `backupLabels.ts`): label sekali (`caption`) di atas, di bawahnya dua nilai berdampingan, kolom sama lebar seperti judul; nilai memakai `...TABULAR` pada `styles.value`. Garis `divider` (1dp) antar butir, `gap: sm`.
- Tidak ada tinted card kedua. Angka dan label tidak berubah. `SummaryLine` boleh dipakai ulang dengan prop dua nilai atau diganti baris baru; developer memilih.
- Cek HP 320 dan 360 dp: "Total kas (Tunai + Debit)" membungkus di label; "Rp12.345.000" bodyStrong (kira-kira 100dp) muat di kolom 140dp.

**12. Ag2 (+ Ag3): baris anggota dan aksi merah (U, K)**

- Berkas: `members/index.tsx`.
- Baris anggota aktif: panah otomatis (G4). Baris arsip ("Aktifkan lagi") tidak punya `onPress` di baris, jadi tidak berubah.
- Mode ubah: bungkus tombol "Hapus anggota"/"Arsipkan anggota" dalam `View style={{ marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}`. Total jarak dari Simpan/Batal kira-kira 28dp plus garis. Teks, `dangerOutline`, dialog tidak berubah.
- Ag3: `editRow` `borderRadius: radius.sm` menjadi `radius.md`.
- Tidak menambah ikon pensil (ikon baru; panah dan petunjuk "Ketuk nama..." sudah cukup).

**13. Gl1: galeri menutup kasus batch ini (K)**

- Berkas: `src/ui/gallery/SectionC.tsx`, `SectionB.tsx`, `fixtures.ts`, `ComponentGallery.tsx`, `SectionD.tsx` (Section), `SectionE.tsx`.
- SectionC (Money): demo "Tanda +, -, tanpa tanda pada empat ukuran" (`hero`, `large`, `heading`, `body`) berdampingan dalam satu `Demo`.
- SectionB (HistoryRow): (a) dikoreksi ARAH KELUAR, (b) dikoreksi ARAH MASUK flat di dalam `Card`, (c) dikoreksi ARAH KELUAR flat. Tambah ke `fixtures.ts` satu pasangan keluar (mis. `host_payout` out dengan `reversedById`) mengikuti `item()` yang ada; `HISTORY_CORRECTED` (masuk, non flat) tetap. Caption Demo flat: "Tahan baris untuk melihat warna tekan (tanpa prop khusus galeri, supaya komponen produksi tidak berubah)."
- SectionB (ListRow): kasus panah G4 (lihat 11.2-2).
- `ComponentGallery.tsx`: judul grup A-F memakai `Text accessibilityRole="header"` dengan gaya baru `groupTitle: { ...type.titleL, color: colors.text }` menggantikan `SectionHeader` (titleM) agar beda tingkat dari judul komponen.
- SectionD: demo `Section` (11.2-1). SectionE: ikon IconChoice (11.2-8).
- Tidak ada prop `forcePressed`: tidak dipilih agar komponen produksi tidak ketambahan prop khusus galeri.

### 11.3 BUTUH KATA PEMILIK

Hanya bagian tanpa kata baru yang saya spesifikasikan; bagian di bawah menunggu kata.

1. **J2, lencana pertemuan berjalan.** Dibangun hanya tanpa kata: pada kartu `oldestOpen` aktif, `row` diberi `borderLeftWidth: 4` dan `borderLeftColor: colors.brand` (token aksen; tidak sebagai teks, jadi aman dari batas kontras; informasi pendukung, bukan satu-satunya sinyal karena kartu itu juga satu-satunya yang punya tombol aksi pembayaran). Usul kata: lencana `Badge tone="brand"` dengan label **"Pertemuan berjalan"** di sebelah "Terbuka". Dapat diganti **"Sekarang"** (lebih pendek; muat di 296dp bersama "Terbuka").
2. **J3, hint panjang dua kartu aksi Jadwal.** Tidak dibangun. Usul: satu baris ringkas per kartu, mis. "Tutup pertemuan: yang paling awal terbuka, harus sudah punya tuan rumah." dan "Akhiri periode: setelah semua pertemuan ditutup dan semua tuan rumah dibayar.", dengan teks panjang yang sekarang pindah ke dialog lewat tautan "Selengkapnya" (kata sudah disetujui, pola sama dengan R4). Alternatif tanpa kata baru yang bisa dibangun kapan saja: hint panjang langsung di balik "Selengkapnya" TANPA baris ringkas (judul dialog = judul kartu, tombol "Tutup"), dengan akibat penjelasan aturan tidak terlihat di kartu. Pilih salah satu.
3. **J4, kata tombol "Lihat pembayaran tuan rumah".** Pada kartu pertemuan ditutup dan dibayar, kata itu tidak lagi tampil sebagai tombol (hanya di label pembaca layar); ketuk kartu + panah menggantikannya, kalimat "Pembayaran tuan rumah: sudah dibayar" ada di kartu. Bila pemilik ingin kata itu tetap tampil, kembalikan sebagai teks di dalam kartu (bukan tombol) tanpa tambahan kata.
4. **J1, lencana "Tuan rumah dibayar" (usul audit).** Tidak dibangun; kalimat "Pembayaran tuan rumah: sudah dibayar" tetap. Usul bila ingin: `Badge tone="ok"` "Dibayar" (kata sudah dipakai di label "Sudah dibayar" Beranda, tetapi bentuk berbeda).
5. **Rs2, judul kolom singkat.** Judul "Di HP ini sekarang" dan "Isi cadangan" membungkus di 140dp (dua baris). Usul audit bila pemilik ingin satu baris: "Di HP ini" dan "Di cadangan".
6. **L2, penanda periode pilihan pertama.** Tidak ada lencana (butuh kata). Usul: "Terbaru" bila pemilik menginginkannya.

Tidak butuh kata baru: R5 (label dari kata yang ada, arah dibawa "Masuk ke"/"Keluar dari"), C2, G3, G4, B6, R3, J5, Bk3, Ag2, Rs2 (selain butir 5), Gl1.

### 11.4 Berkas yang disentuh (ringkas)

Baru: `src/ui/components/Section.tsx`. Diubah: `src/ui/components/ListRow.tsx`, `src/ui/components/HistoryRow.tsx`, `src/ui/history.ts` (+ tesnya), `src/app/(tabs)/index.tsx`, `src/app/(tabs)/laporan.tsx`, `src/app/(tabs)/riwayat.tsx`, `src/app/periods/[id]/index.tsx`, `src/app/members/index.tsx`, `src/app/backup/index.tsx`, `src/app/backup/restore.tsx`, `src/app/kas/new.tsx`, galeri (`SectionB`, `SectionC`, `SectionD`, `SectionE`, `fixtures.ts`, `ComponentGallery.tsx`). TIDAK disentuh: `src/domain`, `src/db`, `format.ts`, `Money.tsx`, `Chip.tsx`, CSV, teks dialog, `reminders.ts`, baris Pengingat Beranda.

### 11.5 Cek di HP (font normal)

1. Beranda: jarak judul ke kartunya lebih rapat dari jarak antar bagian (Pengingat, Terakhir); kartu pertemuan: panah di dua baris, "Tutup pertemuan" jelas terpisah, panah tidak ada di baris itu.
2. Riwayat: chip meluncur sampai tepi kanan; chip terakhir tidak terpotong setelah digulir habis.
3. TalkBack baris riwayat: dibaca satu kalimat berurutan, tanpa "plus/minus" dobel dan tanpa glyph ikon.
4. Jadwal: lencana Terbuka/Ditutup; kartu ditutup + dibayar bisa diketuk seluruhnya dan membuka halaman tuan rumah; garis aksen di pertemuan berjalan terlihat tanpa menyiratkan "dipilih".
5. Catat kas, pindah saldo: dua ikon berbeda arah.
6. Laporan: tidak ada tombol "Buka ..."; baris periode berpanah.
7. Cadangan: tekan satu tombol CSV di bagian bawah; Notice "Menyiapkan berkas..." atau galat tetap terlihat di atas layar saat menggulir.
8. Pulihkan (review) 320 dan 360 dp: dua kolom nilai tidak terpotong, angka rata.
9. Anggota: panah di baris; mode ubah: garis dan jarak sebelum tombol merah.
10. ListRow dengan `right` Money besar: tidak terdorong keluar oleh panah.
