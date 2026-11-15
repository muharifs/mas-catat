# Spesifikasi: Lewati pertemuan terakhir

Tanggal: 2026-11-15. Penulis: ui-ux-designer (lewat asisten-utama). Status: usulan, menunggu persetujuan kata baru (bagian 6) dan jawaban butir terbuka (bagian 9). Tidak ada kode yang diubah.

Fitur disetujui pemilik 2026-11-15. Periode N=19: anggota ke-19 tidak bisa menerima tamu, jadi pertemuan 19 dilewati dan giliran anggota itu pindah ke periode berikutnya. Aturan bisnis (domain) tidak diubah dokumen ini.

## 0. Dasar dan batas

Dibaca: `CLAUDE.md`, `docs/specs/ui-language-review.md`, `dialog-spec.md`, `src/ui/theme.ts`, `Badge`, `Button`, `Notice`, `ListRow`, `CorrectionForm`, `errors.ts`, `messages.ts`, `reminders.ts`, `reportLabels.ts`, `quickActions.ts`, serta layar Beranda, Jadwal, Atur pertemuan, Akhiri periode, Pembayaran, Anggota di periode, Laporan periode/pertemuan/anggota, Periode baru.

BELUM dicek di perangkat: semua tampilan di bawah (hanya dari kode). Daftar cek untuk pemilik ada di bagian 8.

Istilah kode (dev memutuskan): status pertemuan baru `skipped` di samping `open` dan `closed`. Tipe `'open' | 'closed'` ada di sekitar 12 tempat (`schedule.ts`, `report.ts`, `close.ts`, `weeks.ts`, `reminders.ts`, `exports.ts`); semua harus diperiksa. Satu risiko bagi UI: jika dev memilih `closed` + penanda, pengingat "Tuan rumah pertemuan 19 belum dibayar" (`reminders.ts` baris 66) dan tombol "Bayar tuan rumah" di Jadwal (`canPay`, baris 125) akan muncul salah. Tes wajib untuk keduanya.

## 1. Titik masuk

Prinsip: aksi jarang dan menyangkut uang, jadi tidak dibuat menonjol, tidak ada di Beranda, dan tidak ditampilkan saat tidak relevan (bukan sekadar nonaktif) kecuali ada syarat yang bisa dipenuhi pemilik.

### 1.1 Jadwal periode (`periods/[id]/index.tsx`): titik masuk utama

Kartu baru `Card tone="alt"` tepat di bawah kartu "Tutup pertemuan", di atas bagian Jadwal.

Terlihat bila SEMUA benar: periode aktif, ada pertemuan terbuka, pertemuan terbuka tertua bernomor sama dengan jumlah anggota (`oldestOpen.number === period.memberCount`). Selain itu kartu TIDAK dirender (tidak ada pertemuan 1 sampai 18 yang menampilkan kartu ini; sembilan belas minggu kartu nonaktif hanya menambah kebisingan). Setelah dilewati kartu hilang dan baris pertemuan berubah (1.4).

```
[Card alt]
Lewati pertemuan 19                                     type.titleM
Hanya pertemuan terakhir yang bisa dilewati, misalnya ketika
tuan rumah giliran terakhir tidak bisa menerima tamu. Pertemuan
yang dilewati tidak ada iuran dan tidak ada pembayaran tuan rumah.
Ini bukan libur: saat libur pertemuan tetap terbuka.    type.secondary, textSecondary
[ Lewati pertemuan 19 ]                                 Button secondary, 48dp, lebar penuh
(alasan nonaktif, bila ada)                             disabledReason
(Notice danger bila gagal)
```

Tombol `variant="secondary"`, bukan merah dan bukan primer: aksi bisa dibatalkan sampai periode berakhir, dan "Tutup pertemuan" (merah) tetap satu-satunya aksi besar di kartu atasnya.

Nonaktif (kartu tetap terlihat, tombol nonaktif memakai `disabled` + `disabledReason` bawaan Button, jadi alasan terlihat dan dibaca TalkBack). Urutan pemeriksaan, tampilkan alasan pertama yang berlaku:
1. Tuan rumah pertemuan sebelumnya belum dibayar: `Bayar dulu tuan rumah pertemuan 7, 9.` (pakai `describeWeeks`: "pertemuan 7", "pertemuan 7 sampai 9", "pertemuan 7, 9").
2. Pembayaran tuan rumah pertemuan ini masih berlaku: `Pembayaran tuan rumah pertemuan 19 sudah dicatat. Koreksi dulu pembayarannya.`

Kebuntuan yang ditutup: sekarang pada pertemuan terakhir tanpa tuan rumah, kartu "Tutup pertemuan" menulis `Tentukan tuan rumah pertemuan 19 dulu.` dan tidak ada jalan lain. Ubah teks itu HANYA bila pertemuan itu terakhir: `Tentukan tuan rumah pertemuan 19 dulu, atau lewati pertemuan ini.`

Kartu "Akhiri periode": bila ada pertemuan dilewati, tambahkan kalimat awal `Pertemuan 19 dilewati, jadi tidak perlu ditutup.` sebelum kalimat yang ada. Hitungan "(0 pertemuan masih terbuka)" tetap.

### 1.2 Atur pertemuan (`periods/[id]/meetings/[number].tsx`): titik masuk kontekstual

Di sini masalahnya ditemukan: pemilik membuka "Tentukan" untuk pertemuan 19 dan hanya ada satu calon yang tidak bisa menerima tamu. Setelah tombol "Batal" (bawah layar), tambahkan `Card tone="alt"` dengan isi sama dengan 1.1 (judul `Lewati pertemuan 19`, kalimat bantuan yang sama, tombol secondary, alasan nonaktif yang sama). Syarat tampil sama (nomor ini = jumlah anggota, terbuka tertua, periode aktif). "Simpan" tetap aksi utama dan tetap di atas.

Perilaku: bila isian tuan rumah/tanggal sudah diubah tetapi belum disimpan, mengetuk Lewati mengabaikannya (dialog tidak perlu menyebutnya; layar langsung tertutup). Setelah sukses: toast lalu `router.back()` (sama dengan "Simpan" di layar ini).

### 1.3 Beranda: tanpa tombol baru

Alasan: Beranda sudah penuh (kartu pertemuan sudah punya tiga baris aksi), dan aksi ini hanya dipakai sekali per periode. Dua jalan sudah cukup: Pengingat (teks, bagian 3.7) mengarah ke "Tentukan" yang membuka Atur pertemuan, lalu kartu 1.2.

### 1.4 Membatalkan: dari baris Jadwal ke layar Atur pertemuan

Pola sama dengan pembayaran tuan rumah: tombol di baris Jadwal membuka layar rincian, formulir alasan ada di layar rincian (`payout.tsx` memakai `CorrectionForm` seperti itu). Lihat 2.2 dan 3.2.

## 2. Dialog

Semua lewat `showDialog` (bukan Alert). Tombol bertumpuk: aksi di atas, Batal di bawah (dialog-spec bagian 2). Tanpa kata ganti "Anda", "Jika" bukan "Kalau", "berakhir" bukan "selesai".

### 2.1 Dialog Lewati pertemuan

Judul: `Lewati pertemuan 19`

Isi (empat paragraf pendek, dipisah `\n\n`):

```
Lewati pertemuan 19?

Pertemuan ini tidak diadakan: tidak ada iuran dan tidak ada pembayaran tuan rumah. Giliran tuan rumahnya pindah ke periode berikutnya.

Iuran yang dibayar di muka untuk pertemuan ini (Rp45.000 dari 3 anggota) menjadi titipan dan dibawa ke periode berikutnya.

Setelah ini periode bisa diakhiri. Pelewatan bisa dibatalkan sampai periode berakhir.
```

Variasi paragraf 3 bila tidak ada iuran di muka: `Belum ada iuran yang dibayar di muka untuk pertemuan ini.`

Angka paragraf 3 (jumlah dan jumlah anggota) harus datang dari repositori lewat fungsi pratinjau (usul: `repos.weeks.previewSkip(periodId)` mengembalikan `{ prepaidTotal, prepaidMembers }`), bukan dihitung di UI. Alasan: dialog adalah tempat angka uang dikonfirmasi. Bila dev menolak pratinjau, pakai kalimat tanpa angka: `Iuran yang sudah dibayar di muka untuk pertemuan ini menjadi titipan dan dibawa ke periode berikutnya.` (tidak ideal).

Tanggal pertemuan sengaja TIDAK disebut: pada pertemuan tanpa tuan rumah tanggalnya masih perkiraan.

Tombol:
- `Lewati pertemuan` (role default, primer teal, BUKAN merah: bisa dibatalkan)
- `Batal` (cancel)

Satu tahap saja (bukan dua seperti Akhiri periode) karena bisa dibatalkan. Guard `busy` di layar pemanggil agar tekan ganda tidak menjalankan dua kali (sama dengan `closeOldest`).

### 2.2 Layar pertemuan yang dilewati: Batalkan pelewatan (formulir alasan + dialog)

Memakai `CorrectionForm` (kotak `errorTint`, kolom alasan wajib, tombol merah, Batal, lalu dialog). `CorrectionForm` sekarang menulis teks Koreksi di dalam komponen, jadi tambahkan prop opsional dengan bawaan = perilaku sekarang (tidak ada layar lama berubah):

| Prop baru | Bawaan sekarang | Nilai untuk Batalkan pelewatan |
|---|---|---|
| `explain` | `Koreksi membatalkan catatan ini. Catatan lama tetap terlihat, ditandai Dikoreksi, dan tidak dihitung.` | `Pertemuan 19 dibuka lagi dan iuran mulai dihitung lagi. Alasan disimpan sebagai catatan perubahan.` |
| `reasonLabel` | `Alasan koreksi (wajib)` | `Alasan pembatalan (wajib)` |
| `placeholder` | `Contoh: salah memilih anggota` | `Contoh: tuan rumah ternyata bisa menerima tamu` |
| `requiredText` | `Alasan koreksi wajib diisi.` | `Alasan pembatalan wajib diisi.` |
| `errorContext` | `'correct'` | `'unskip_week'` |

Tombol di dalam formulir: `Batalkan pelewatan` (merah, bawaan CorrectionForm) dan `Batal` (secondary). Merah di sini selaras dengan Koreksi lain: membatalkan sebuah keputusan yang mengubah hitungan uang.

Dialog konfirmasi (dari `CorrectionForm`):
- Judul: `Batalkan pelewatan pertemuan 19`
- Isi: `Pertemuan 19 dibuka lagi. Iuran pertemuan ini dihitung lagi seperti biasa, dan titipan dari iuran di muka kembali dipakai untuk pertemuan ini. Pertemuan bisa dilewati lagi nanti.`
- Tombol: `Batalkan pelewatan` (destructive), `Batal` (cancel).

CATATAN untuk dev/domain: kalimat "titipan dari iuran di muka kembali dipakai" harus cocok dengan perilaku domain sebenarnya (alokasi dihitung ulang tertua dulu?). Jika berbeda, ubah kalimat itu, jangan ubah aturannya. Bagian 9, butir 2.

### 2.3 Dialog Akhiri periode (tambahan satu kalimat)

Dialog langkah dua (`close.tsx`) bila ada pertemuan dilewati: tambahkan kalimat penutup `Pelewatan pertemuan 19 juga tidak bisa dibatalkan lagi.` Dialog langkah satu tidak berubah.

## 3. Status "Dilewati" per layar

Kata: `Dilewati` (kata baru, bagian 6). "Pertemuan" tetap untuk week. Badge: `<Badge label="Dilewati" tone="neutral" />` (abu `neutralTint`, teks `colors.text`, sudah lolos kontras). Tidak ada warna atau ikon baru.

Mengapa netral dan bukan amber/merah: bukan masalah dan bukan sukses; amber dan merah di aplikasi berarti "ada yang perlu dikerjakan". Hanya satu pertemuan per periode yang berbeda dari 18 lainnya, jadi kata `Dilewati` di samping `Ditutup` sudah cukup membedakan. Pembeda kedua tanpa ikon: baris itu memiliki satu kalimat bantuan tambahan (3.1) sehingga bentuknya lain. Tanpa ikon karena `Badge` tidak mendukung ikon; menambahnya mengubah komponen bersama demi satu kata.

Aturan warna teks status per anggota (`members/[memberId].tsx`, laporan anggota, laporan pertemuan): `isSettledState` sekarang memilih hijau atau merah. `Dilewati` TIDAK boleh merah (bukan tunggakan) dan tidak hijau (bukan lunas). Tambah fungsi `weekStateTone(state)` yang mengembalikan `ok | bad | neutral`; `Dilewati` = `neutral`: gaya `type.label`, `colors.textSecondary`. Kontras textSecondary (#4A5162) di atas putih dan `bgMute` memenuhi AA.

### 3.1 Jadwal (baris pertemuan)

```
Pertemuan 19 · 17 Nov 2026                   bodyStrong
Tuan rumah: tidak ada                        secondary, textSecondary
[Dilewati]                                   Badge neutral
Tidak ada iuran dan tidak ada pembayaran tuan rumah. Giliran tuan rumahnya pindah ke periode berikutnya.   secondary
[ Batalkan pelewatan ]                       Button secondary, hanya periode aktif
```

- Tanggal ditampilkan tanpa "(perkiraan)".
- Jangan menampilkan nama tuan rumah di baris ini walaupun datanya ada: nama itu membuat pembaca mengira ada pembayaran. Bila domain bisa menurunkan anggota yang tidak sempat jadi tuan rumah, kalimat bantuan boleh `Giliran Budi pindah ke periode berikutnya.`; bila tidak, kalimat umum di atas.
- Tombol `Batalkan pelewatan` membuka Atur pertemuan pertemuan itu (2.2). `accessibilityLabel="Batalkan pelewatan pertemuan 19"`.
- Periode berakhir: tanpa tombol; baris tetap terbaca.

### 3.2 Atur pertemuan (keadaan dilewati)

Sekarang layar ini untuk pertemuan tidak terbuka menampilkan `Tuan rumah dan tanggal hanya bisa diatur untuk pertemuan saat ini ...` dan satu tombol Kembali. Tambahkan cabang khusus SEBELUM cabang itu:

```
Pertemuan 19                                  titleL
[Dilewati]                                    Badge neutral
Pertemuan ini dilewati. Tidak ada iuran dan tidak ada pembayaran tuan rumah. Tuan rumah dan tanggal tidak bisa diubah selama pertemuan dilewati.   body
[ Batalkan pelewatan ]   secondary (periode aktif)  -> membuka CorrectionForm di tempat
[ Kembali ]              secondary
```

Periode berakhir: ganti tombol Batalkan dengan teks `Periode sudah berakhir, pelewatan tidak bisa dibatalkan.` (sejajar dengan `Periode sudah berakhir, koreksi tidak bisa dilakukan.` di `payout.tsx`). Edit tanggal dan tuan rumah tidak ditampilkan sama sekali pada layar ini (bukan bidang nonaktif yang membingungkan); alasannya ditulis di kalimat bantuan.

Setelah pembatalan sukses: `reload()` di tempat; layar berubah menjadi layar Atur pertemuan biasa untuk pertemuan 19 yang terbuka (pola sama dengan koreksi pembayaran tuan rumah).

### 3.3 Laporan

Laporan periode (`reports/period/[id]/index.tsx`), bagian "Per pertemuan":
- Baris pertemuan dilewati: judul seperti biasa; `RowText`: `Tuan rumah: tidak ada`; `RowText` (nada `muted`, bukan ok/warn): `Dilewati{SEP}tidak ada iuran`. Sisi kanan: TIDAK ada angka (jangan tampilkan Rp0 netral: itu terbaca "lunas"). Gunakan `MEETING_STATUS_LABELS.skipped = 'Dilewati'`.
- Kartu Ringkasan: hint "Total iuran periode" jadi `Rp15.000 x anggota x pertemuan` + bila ada yang dilewati ` Pertemuan yang dilewati tidak dihitung.`

Laporan pertemuan (`reports/period/[id]/meetings/[number].tsx`) untuk pertemuan dilewati:
- Baris keterangan: `17 Nov 2026{SEP}Dilewati`.
- Ganti tiga bagian (Iuran, Tuan rumah dan kas, Status anggota) dengan satu `Notice tone="info"`: `Pertemuan ini dilewati. Tidak ada iuran dan tidak ada pembayaran tuan rumah.`
- Bila ada iuran di muka yang jadi titipan dan datanya tersedia: satu `ReportLine` `Iuran dibayar di muka menjadi titipan` (jumlah).

### 3.4 Riwayat

- Tab Riwayat (daftar catatan kas): TIDAK ada baris baru. Melewati pertemuan tidak menggerakkan Tunai, Debit, atau Piutang. Jika dev membuat catatan jejak perubahan (change trail), jangan tampil di tab Riwayat atau CSV Buku kas.
- Riwayat anggota di laporan (`reports/period/[id]/members/[memberId].tsx`): bagian "Status per pertemuan" menampilkan `Dilewati` (3 aturan warna di atas) dan baris kedua `Tidak ada iuran.`. Tidak ada jenis kejadian baru: pembayaran yang tadinya melunasi pertemuan 19 harus otomatis menampilkan `Menjadi titipan: Rp15.000` (turunan dari alokasi). Syarat: baris `Melunasi: ...` TIDAK boleh menyebut pertemuan yang dilewati.
- Jejak pembatalan (tanggal dan alasan) sebaiknya terlihat di layar 3.2 saat pertemuan dibuka lagi: satu baris `type.secondary` `Pernah dilewati, dibatalkan: {alasan}`. Opsional, butuh data dari dev (bagian 9, butir 5).

### 3.5 Anggota di periode (`members/[memberId].tsx`), dan Pembayaran

Layar anggota, bagian "Status per pertemuan": baris pertemuan 19: kiri `Pertemuan 19 · 17 Nov 2026`, kanan `Dilewati` (netral, 3 di atas), baris kedua muted `Tidak ada iuran.`. Daftar "Melunasi: ..." di Riwayat pembayaran tidak boleh memuat pertemuan yang dilewati; kelebihannya tampil lewat baris `Menjadi titipan: ...` yang sudah ada.

Pembayaran (`payments.tsx`): header sudah menulis `Tunggakan dihitung sampai pertemuan 19.` Bila pertemuan itu dilewati, tambahkan baris `type.secondary` di bawahnya: `Pertemuan 19 dilewati: tidak ada iuran.` Tidak ada perubahan pada baris anggota (angka tunggakan, `Dibayar di muka`, `Titipan` berasal dari repositori).

### 3.6 Akhiri periode (pratinjau, `close.tsx`)

Tepat di bawah judul, di atas kartu "Belum bisa diakhiri"/Ringkasan, bila ada pertemuan dilewati, `Notice tone="info"`:

`Pertemuan 19 dilewati: tidak ada iuran dan tidak ada pembayaran tuan rumah. Iuran yang dibayar di muka menjadi titipan dan dibawa ke periode berikutnya. Pelewatan bisa dibatalkan di Jadwal sampai periode berakhir.`

Teks pemblokir "Pertemuan yang masih terbuka: ..." tidak menyebut pertemuan dilewati (bukan terbuka). Dialog 2.3.

### 3.7 Beranda dan Pengingat

`reminders.ts`: `ReminderWeek.status` menjadi `'open' | 'closed' | 'skipped'`. Aturan: pertemuan dilewati tidak pernah menghasilkan baris `pay_host` atau `close_week`, dan bukan "terbuka" (tidak ikut `open`).

- Semua pertemuan ditutup atau dilewati (baris `close_period`): bila ada pertemuan dilewati, judul `Semua pertemuan sudah ditutup atau dilewati`; isi `Periode siap diakhiri.`; tombol `Akhiri periode`. Tanpa dilewati: teks sekarang tidak berubah. Catatan: Beranda menyembunyikan baris `close_period` karena "Akhiri periode" ada di kartu periode (`index.tsx` baris 137-138); itu tetap. Teks yang sama dipakai sebagai judul kartu periode di Beranda saat tidak ada pertemuan terbuka: `Semua pertemuan sudah ditutup atau dilewati` dan satu baris `type.body` di bawahnya `Pertemuan 19 dilewati.`
- Pertemuan terakhir tanpa tuan rumah (`choose_host`): isi `Tanpa tuan rumah, pertemuan tidak bisa ditutup. Jika tuan rumahnya tidak bisa menerima tamu, pertemuan ini bisa dilewati.` Hanya untuk pertemuan terakhir; satu tombol tetap `Tentukan` (ReminderRow hanya punya satu tombol). Butuh input baru `lastMeetingNumber` (= jumlah anggota) di `HomeReminderInput`.
- `quickActions.ts`: alasan ubin "Bayar tuan rumah" saat tidak ada pertemuan terbuka `Semua pertemuan sudah ditutup.` menjadi `Semua pertemuan sudah ditutup atau dilewati.` (hanya bila ada yang dilewati; tes `quickActions.test.ts` mengunci teks).
- Kartu pertemuan Beranda: tidak ada tombol Lewati (1.3).

### 3.8 CSV

`csvFiles.ts` baris 108: nilai status pertemuan `Dilewati` selain `Ditutup` dan `Terbuka`. Tes `csvFiles.test.ts` dan `csvReconcile.qa.test.ts` ikut. Tidak ada kolom baru.

## 4. Toast, galat, perilaku

### 4.1 Toast (di `toasts` pada `messages.ts`)

| Kunci | Teks |
|---|---|
| `weekSkipped(number)` | `Pertemuan 19 dilewati. Periode sudah bisa diakhiri.` |
| `skipCancelled(number)` | `Pelewatan pertemuan 19 dibatalkan` |

Kalimat kedua pada `weekSkipped` menutup alur (langkah berikutnya jelas) tanpa tombol tambahan; panjangnya masih satu sampai dua baris. Pola nama sama dengan `weekClosed`.

Gagal: tidak memakai toast. Tampilkan `Notice tone="danger"` DI DALAM kartu Lewati (Jadwal dan Atur pertemuan), tepat di bawah tombol. Alasan: di Jadwal `actionError` sekarang ditampilkan paling bawah layar (`index.tsx` baris 217), jauh dari kartu Tutup pertemuan di atas, dan pemilik tidak melihatnya. Disarankan sekalian memindahkan galat "Tutup pertemuan" ke tempat yang sama (perbaikan kecil, dampak sedang). Notice danger berperan `alert`, terbaca otomatis oleh TalkBack.

### 4.2 Konteks galat baru (`ErrorContext` di `errors.ts`)

| Konteks | Teks |
|---|---|
| `skip_week` | `Pertemuan belum dilewati. Tidak ada data yang berubah. Coba lagi.` |
| `unskip_week` | `Pelewatan belum dibatalkan. Tidak ada data yang berubah. Coba lagi.` |

### 4.3 Pesan galat yang dipetakan

Pesan Inggris di kolom kiri adalah USULAN nama kunci; developer boleh mengubah kata asal pola `RULES` di `errors.ts` cocok. Letakkan semuanya SEBELUM aturan umum `week \d+ not found`, `is already closed`, dan `has ended; ...` agar "first match wins" tidak mengambilnya.

| Dilempar (Inggris) | Teks UI |
|---|---|
| `only the last meeting can be skipped` | `Hanya pertemuan terakhir yang bisa dilewati.` |
| `week N is not the oldest open meeting; it cannot be skipped` | `Pertemuan N belum bisa dilewati. Tutup dulu pertemuan sebelumnya.` (angka dari `match`) |
| `cannot skip: closed meetings have no host payout in force` | `Belum bisa dilewati: masih ada tuan rumah yang belum dibayar. Bayar dulu semuanya.` |
| `week N has a standing host payout; it cannot be skipped` | `Pembayaran tuan rumah pertemuan ini sudah dicatat. Koreksi pembayarannya dulu, lalu lewati pertemuan.` (konstanta `SKIP_PAYOUT_STANDS_TEXT`, sejajar `HOST_PAYOUT_STANDS_TEXT`) |
| `week N is already skipped` | `Pertemuan ini sudah dilewati.` |
| `week N is not skipped` | `Pertemuan ini tidak sedang dilewati.` |
| `period X has ended; a skip cannot be changed` | `Periode sudah berakhir. Pelewatan tidak bisa diubah lagi.` |
| `skip cancel reason is required` | `Alasan pembatalan wajib diisi.` |
| `week N is skipped; its host and date cannot be changed` | `Pertemuan yang dilewati tidak bisa diubah tuan rumah atau tanggalnya. Batalkan dulu pelewatannya.` |
| `week N is skipped; it has no host payout` | `Pertemuan yang dilewati tidak ada pembayaran tuan rumah.` |
| `week N is skipped; it cannot be closed` | `Pertemuan yang dilewati tidak perlu ditutup.` |

Perhatikan: aturan lama `/week \d+ is closed; its host cannot be changed/` tidak cocok dengan pesan baru, jadi pesan "skipped" butuh aturan sendiri. Tes `errors.test.ts` perlu satu kasus per baris.

### 4.4 Perilaku ringkas

- Setelah lewati sukses: toast; dari Jadwal `reload()` di tempat (kartu Lewati dan Tutup hilang, baris berubah); dari Atur pertemuan `router.back()`.
- Dua kali ketuk: guard `busy` di pemanggil.
- Pertemuan dilewati: tidak bisa diubah tuan rumah atau tanggal (tidak ada bidang, 3.2). Tidak ada "Bayar tuan rumah", "Tutup pertemuan", atau "Ubah" di baris Jadwal. Tidak ada pembayaran tuan rumah di layar payout (defensif: bila dibuka lewat tautan, tampilkan `Pertemuan ini dilewati. Tidak ada pembayaran tuan rumah.`).

## 5. Petunjuk di Periode baru dan Pilih tuan rumah (opsional)

Data: anggota periode berakhir terakhir yang belum sempat jadi tuan rumah karena pertemuannya dilewati. Hanya satu per periode (hanya satu pertemuan boleh dilewati). Jika tuan rumah pertemuan yang dilewati belum diisi, anggota itu dapat diturunkan: satu-satunya anggota periode yang tidak pernah menjadi tuan rumah di pertemuan ditutup. Perlu satu fungsi baca di repositori (tidak ada uang); butir 3 bagian 9.

### 5.1 Periode baru (`periods/new.tsx`)

`Notice tone="info"` tepat setelah daftar "Perkiraan tanggal pertemuan", sebelum bagian titipan. Tampil hanya bila periode berakhir terakhir punya pertemuan dilewati.
- Anggota itu terpilih: `Budi belum sempat jadi tuan rumah di Periode 1 karena pertemuan 19 dilewati. Pilih Budi sebagai tuan rumah pertemuan 1.`
- Tidak terpilih: `Budi belum sempat jadi tuan rumah di Periode 1 karena pertemuan 19 dilewati, tetapi tidak dipilih di periode ini.`
Tidak memblokir dan tidak mengubah pilihan. Tidak ada tombol (pilih tuan rumah terjadi di layar berikutnya).

### 5.2 Pilih tuan rumah (Atur pertemuan, periode baru)

Tepat di bawah `SectionHeader "Tuan rumah"`, di atas kalimat bantuan yang ada: `Notice tone="info"`: `Budi belum sempat jadi tuan rumah di Periode 1 karena pertemuan 19 dilewati.` Tampil selama anggota itu belum punya tuan rumah di periode ini dan masih bisa dipilih. Tidak ada pilihan awal (tidak dipilihkan otomatis): pemilik memilih sendiri, dan pilihan awal yang salah bisa tersimpan tanpa disadari. Daftar tetap urut A-Z; pencarian (bila ada) tidak menyembunyikan baris terpilih, dan Notice menyebut nama sehingga mudah dicari.

## 6. Kata baru untuk disetujui pemilik

Terpisah dari kata yang sudah ada. Setelah disetujui, tambahkan ke `src/ui/glossary.ts` (pekerjaan dev) dan tabel 2.1 `ui-language-review.md`.

| Kata | Dipakai di | Arti satu kalimat | Catatan |
|---|---|---|---|
| **Dilewati** | Badge, status, laporan, CSV | Pertemuan terakhir yang tidak diadakan di periode ini: tidak ada iuran dan tidak ada pembayaran tuan rumah. | Dari istilah pemilik. Alternatif: **Tidak diadakan**. Pertimbangan: `Lewati` dekat dengan `sudah lewat 3 hari` (pertemuan terlambat, `messages.ts`), keduanya bisa dibaca "lewat". Penjelasan "bukan libur" ada di bantuan Jadwal (1.1). Jika pemilik ingin menghindari, ganti seluruh `Dilewati`/`Lewati` dengan `Tidak diadakan`/`Tiadakan`. |
| **Lewati pertemuan** | Tombol, judul dialog, kartu | Aksi menandai pertemuan terakhir sebagai dilewati. | Disetujui sebagai fitur. |
| **Batalkan pelewatan** | Tombol, formulir, dialog | Membuka kembali pertemuan yang dilewati; hanya sampai periode berakhir; wajib alasan. | `pelewatan` kata benda baru (imbuhan pe-an dari `lewat`), sah menurut KBBI. |
| **Alasan pembatalan** | Label kolom | Alasan membatalkan pelewatan, wajib diisi. | Padanan `Alasan koreksi`. |
| **Tidak diadakan** | Isi dialog, bantuan | Pertemuan itu tidak berlangsung sama sekali. | Dipakai di kalimat, bukan sebagai status. |
| **Pertemuan terakhir** | Bantuan | Pertemuan bernomor sama dengan jumlah anggota. | `terakhir` sudah dipakai di tempat lain. |

Kata yang SUDAH ada dan dipakai ulang apa adanya: Pertemuan, Iuran, Dibayar di muka, Titipan, Titipan dibawa ke periode berikutnya, Tuan rumah, Pembayaran tuan rumah, Akhiri periode, Berakhir, Jadwal, Atur pertemuan, Alasan, Batal, Ditutup, Terbuka, Libur.

Pasangan istilah yang perlu dibedakan di Bantuan: **Libur** (pertemuan tetap terbuka, tanggal diubah, nanti tetap diadakan) dan **Dilewati** (tidak diadakan sama sekali di periode ini, giliran pindah).

## 7. Aksesibilitas

- Semua teks memakai token `type.*` (Inter) tanpa `fontWeight`. Tidak ada tinggi tetap, tidak ada `numberOfLines`: kalimat bantuan panjang membungkus. Pada 1.3x: kartu Lewati bertambah tinggi dan layar sudah menggulir; tombol tetap lebar penuh dan satu baris ("Lewati pertemuan 19" muat di 280dp pada 1.3x; "Batalkan pelewatan pertemuan" tidak dipakai sebagai label tampak). `Badge` sudah membatasi `maxFontSizeMultiplier` 1.3.
- Target sentuh: semua tombol memakai `Button` (minimum 48dp). Tidak ada ketuk-pada-teks kecil. Tombol di baris Jadwal terpisah `spacing.sm` dari tombol lain.
- Peran dan label: `Button` sudah `accessibilityRole="button"`. `Batalkan pelewatan` di Jadwal: `accessibilityLabel="Batalkan pelewatan pertemuan 19"`. Tombol Lewati memuat nomor di label tampak. Alasan nonaktif memakai `disabledReason` (terbaca sebagai petunjuk dan terlihat).
- Status tidak hanya warna: `Dilewati` selalu kata. Kata itu juga harus muncul pada label aksesibilitas baris ditutup-dan-dibayar bila relevan; baris dilewati tidak memakai `wholeCardTap`, jadi TalkBack membaca teks apa adanya: judul pertemuan, tuan rumah, `Dilewati`, kalimat bantuan, tombol.
- Kontras: `Badge` netral (text di `neutralTint`), `textSecondary` di putih dan `bgMute`, `Notice` info (`text` di `brandTint`) semuanya memakai token yang sudah lolos `theme.test.ts`. Tidak ada kombinasi baru.
- Dialog: fokus ke judul, `accessibilityViewIsModal`, kata `Batal` selalu paling bawah (dialog-spec). Isi dialog memakai `colors.text` (angka uang).
- Formulir alasan: kolom wajib diberi label tampak `Alasan pembatalan (wajib)`; galat kosong tampil di bawah kolom (sama dengan CorrectionForm sekarang). Keyboard: kolom ada di bagian atas layar (di bawah kalimat bantuan), jadi tidak tertutup keyboard; cek di HP.
- Toast `accessibilityLiveRegion="polite"` sudah ada. Setelah kartu Lewati hilang dari Jadwal, fokus TalkBack tidak punya tujuan; toast mengumumkan hasilnya dan baris berubah menjadi `Dilewati`. Cukup.

## 8. Yang perlu dicek pemilik di HP (font normal, lalu 1.3x)

1. Jadwal pada pertemuan terakhir terbuka: kartu "Lewati pertemuan 19" muncul; pada pertemuan 1 sampai 18 kartu tidak ada.
2. Pertemuan 19 tanpa tuan rumah: kartu Tutup menulis "...atau lewati pertemuan ini."; tombol Lewati aktif.
3. Dengan pembayaran tuan rumah pertemuan 19 tercatat: tombol Lewati nonaktif dengan alasan terlihat.
4. Dialog Lewati terbaca utuh, angka titipan benar; Batal menutup tanpa efek.
5. Setelah lewati: toast, baris "Dilewati", kartu Tutup dan Lewati hilang, Akhiri periode bisa; Beranda menulis "Semua pertemuan sudah ditutup atau dilewati".
6. Pembayaran: anggota yang tadinya bayar di muka pertemuan 19 kini punya titipan; "Melunasi" tidak menyebut pertemuan 19.
7. Akhiri periode: Notice info muncul; dialog kedua memuat kalimat pelewatan.
8. Batalkan pelewatan lewat Jadwal ke layar rincian: formulir alasan, alasan kosong ditolak, dialog, pertemuan terbuka lagi.
9. Setelah periode berakhir: Jadwal tanpa tombol Batalkan; layar rincian menulis "tidak bisa dibatalkan".
10. Periode baru: Notice petunjuk di Periode baru dan Pilih tuan rumah.
11. TalkBack di baris Dilewati dan di dialog; 1.3x di Jadwal, dialog, dan Beranda.

## 9. Butir terbuka (keputusan atau data dari pemilik, PM, dev)

1. Kasus N=1 (satu anggota, satu pertemuan): aturan "nomor = jumlah anggota" membolehkan melewati satu-satunya pertemuan sehingga periode tanpa pertemuan. Usul: pemilik memutuskan; desain ini tidak menampilkan kartu Lewati bila jumlah anggota 1 sampai diputuskan (usul aman).
2. Dampak membatalkan terhadap titipan (2.2): harus dicocokkan dengan domain; kalimat dialog menyesuaikan.
3. Sumber data petunjuk bagian 5 (anggota yang belum sempat jadi tuan rumah) dan apakah host pertemuan yang dilewati tetap tersimpan atau dikosongkan.
4. Pratinjau lewati (`prepaidTotal`, `prepaidMembers`) dari repositori.
5. Jejak pembatalan (alasan dan tanggal) apakah disimpan dan bisa dibaca UI (3.4).
6. Kata `Dilewati` atau `Tidak diadakan` (bagian 6).
7. Perubahan komponen bersama: hanya `CorrectionForm` (lima prop opsional, bawaan tidak berubah). Tidak ada komponen baru, tidak ada dependensi, tidak ada token baru.

## 10. Daftar berkas yang terkena (untuk dev)

`src/ui/messages.ts` (teks dialog, toast), `src/ui/errors.ts` (konteks, aturan, konstanta), `src/ui/reportLabels.ts` (`MEETING_STATUS_LABELS`, `WEEK_STATE_LABELS` bila status per anggota memakai `skipped`, `weekStateTone`), `src/ui/reminders.ts`, `src/ui/quickActions.ts`, `src/ui/csvFiles.ts`, `src/ui/components/CorrectionForm.tsx`, `src/ui/glossary.ts` (setelah kata disetujui), layar: Jadwal, Atur pertemuan, Akhiri periode, Pembayaran, Anggota di periode, Beranda, Laporan periode, Laporan pertemuan, Laporan anggota, Periode baru. Tes yang mengunci teks ikut berubah (D12).
