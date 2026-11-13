# Spesifikasi dialog dan toast dalam aplikasi (menggantikan Alert.alert dan ToastAndroid)

Status: usulan untuk disetujui pemilik, belum dibangun. Tanggal 2026-11-13. Hanya dokumen; tidak ada kode yang diubah.

Masalah: `Alert.alert` dan `ToastAndroid` memakai font sistem (MiSans di Xiaomi pemilik), bukan Inter. Dialog adalah tempat angka uang dikonfirmasi, jadi tampilannya harus sama dengan layar lain. Hasil kerja: 21 pemanggilan `Alert.alert` di 14 file, dan satu fungsi `toast` yang dipakai 12 file.

Yang sudah dicek di kode: tidak ada test yang memock `Alert.alert` atau `ToastAndroid` (grep di `*.test.*` kosong). Teks dialog dipin lewat test konstanta saja (`src/ui/messages.test.ts`, `src/ui/backupLabels.test.ts`), jadi mengganti pemanggilnya tidak merusak test selama teksnya tidak diubah. Yang belum dilihat: tampilan di HP. Daftar cek ada di bagian 8.

## 1. API

Dua file baru dan satu pemasangan di root.

- `src/ui/dialog.ts`: logika murni dan antrean, tanpa import `react-native` (supaya bisa dites di Jest). Nama file sengaja bukan `...Store.ts`, karena `gallery.test.ts` menolak impor yang berakhiran `Store'` dari file galeri.
- `src/ui/components/DialogHost.tsx`: tampilan (RN `Modal`), membaca antrean lewat `useSyncExternalStore`.
- `src/app/_layout.tsx`: pasang `<DialogHost />` dan `<ToastHost />` di `RootLayout`, sebagai saudara `DatabaseProvider` (bukan di dalamnya, bukan di dalam `<Stack key={dataVersion}>`). Alasannya: `restore.tsx` memanggil `reloadEverything()` (menaikkan `dataVersion`, seluruh navigator dibuang) lalu langsung membuka dialog. Host harus tetap hidup melewati itu. Host hanya dirender setelah font siap (sudah begitu: `RootLayout` mengembalikan `null` sampai `fontsDone`).

```ts
type DialogRole = 'default' | 'cancel' | 'destructive';

interface DialogButton {
  label: string;
  role?: DialogRole;            // default 'default'
  onPress?: () => void | Promise<void>;
}

interface DialogOptions {
  title: string;
  message?: string;             // paragraf dipisah "\n\n", persis seperti sekarang
  body?: ReactNode;             // opsional, tampil di bawah message (belum dipakai; untuk pemakaian nanti)
  buttons: DialogButton[];      // 1 sampai 3
  cancelable?: boolean;         // default true; false = Back dan ketuk-luar tidak melakukan apa pun
}

export function showDialog(options: DialogOptions): void;
export function showMessage(title: string, message: string): void; // satu tombol "Tutup", untuk Alert.alert 2 argumen
```

Keputusan: callback `onPress`, bukan Promise. Semua 21 pemanggil sekarang memakai callback pada tombol; mengubahnya menjadi `await` akan mengubah urutan operasi (dan menambah risiko pada `restore.tsx` dan `close.tsx` yang menumpuk dialog). Dengan callback, setiap pemanggil cukup mengganti `Alert.alert(t, m, [{ text, style, onPress }])` menjadi `showDialog({ title: t, message: m, buttons: [{ label, role, onPress }] })`. Pemetaan: `style: 'cancel'` jadi `role: 'cancel'`, `style: 'destructive'` jadi `role: 'destructive'`, tanpa style jadi `role: 'default'`. `text` jadi `label`. Isi `onPress` tidak berubah.

Urutan operasi (harus sama dengan Alert native: dialog tertutup dulu, baru callback jalan):
1. Tombol ditekan. Jika dialog itu sudah `settled`, abaikan (bagian 3, satu kali).
2. Tandai `settled`, keluarkan dialog dari kepala antrean TANPA memberi tahu pendengar.
3. Panggil `onPress` secara sinkron dalam `try/finally`. Galat atau Promise yang ditolak tidak ditelan (sama seperti Alert) dan tidak boleh membuat host macet.
4. Di `finally`: beri tahu pendengar sekali. Dialog berikutnya (antrean, atau yang dibuka dari dalam `onPress`, misalnya Lanjut di `close.tsx` dan `restore.tsx`) langsung tampil. Karena `Modal` tetap terpasang selama masih ada dialog, tidak ada kedip tutup lalu buka.

`onPress` async (mis. `closeOldest` di Beranda) tidak ditunggu oleh host. Persis seperti Alert.

Tidak ada tombol loading di dalam dialog. Guard seperti `lock.current`, `paidTodayRef`, `setBusy` tetap di layar pemanggil dan tidak berubah.

## 2. Tampilan

Semua dari token yang ada (`src/ui/theme.ts`, `Card`, `Button`). Tidak ada warna, ukuran font, atau radius baru.

```
[ scrim: colors.scrim, penuh layar, termasuk status bar ]
      +--------------------------------------+   lebar = min(layar - 2*spacing.xl, 400)
      | Card tone default (radius.lg, shadow) |   padding spacing.lg (bawaan Card)
      |  Judul          type.titleM  colors.text   accessibilityRole header
      |  (spacing.md)                          |
      |  Pesan          type.body    colors.text   di dalam ScrollView
      |  (spacing.lg)                          |
      |  [ Tombol utama   ]  48 dp penuh lebar |
      |  (spacing.sm)                          |
      |  [ Batal          ]                    |
      +--------------------------------------+
```

- Posisi: di tengah layar, `paddingHorizontal: spacing.xl`. Card dari `Card` (tone `default`, sudah `radius.lg`, `elevation.low`; boleh `elevation.high` lewat `style` karena melayang di atas scrim).
- Font: lewat token `type.*` yang sudah memuat `fonts.regular` dan `fonts.bold`. Jangan pernah mengatur `fontWeight`. Semua `Text` memakai token (aturan Android Fabric di `theme.ts`).
- Pesan memakai `colors.text`, bukan `textSecondary`, karena isinya angka uang yang harus dibaca teliti.
- Tombol: selalu ditumpuk vertikal, lebar penuh. Alasan: label seperti "Ya, akhiri periode", "Ya, ganti semua data", "Kembalikan uang" tidak muat berdampingan dalam lebar 312 dp, dan satu aturan lebih konsisten daripada aturan yang berganti. Tombol aksi di atas (paling dekat jempol saat dialog di tengah layar, dan sama dengan CorrectionForm yang menaruh aksi di atas Batal), Batal paling bawah.
- Urutan tombol: semua tombol non-cancel dalam urutan yang diberikan pemanggil, lalu tombol `cancel` paling akhir (fungsi murni `orderButtons`). Untuk 3 tombol: aksi 1, aksi 2, Batal.
- Varian (komponen `Button` yang sudah ada): `destructive` menjadi `danger`; `default` menjadi `primary`; `cancel` menjadi `secondary`. Dialog satu tombol (info) memakai `default` menjadi `primary`. Tombol "Bayar" dan "Simpan" yang sekarang bukan `destructive` tetap `primary` (bukan merah).
- Pesan panjang: judul tetap, pesan di `ScrollView` dengan `maxHeight = tinggi layar x 0,6` (`useWindowDimensions`), indikator gulir terlihat, tombol selalu terlihat di bawah. Pesan terpanjang saat ini ada di `kas/new.tsx` dan `credits/index.tsx` (sekitar 8 baris pada font normal) sehingga di HP normal kemungkinan tidak perlu gulir; tetap wajib ada untuk font besar dan layar 320 dp.
- Skala font: ikuti pengaturan HP seperti layar lain. Pemilik hanya menguji font normal; jangan pasang batas khusus selain bawaan aplikasi.
- Animasi: `Modal animationType="fade"`. Tidak ada animasi lain.

## 3. Perilaku

Pilihan Modal atau host sendiri: pakai RN `Modal` (`transparent`, `statusBarTranslucent`), dipasang SEKALI di root oleh `DialogHost`. Alasan:
- `Modal` di Android adalah window sendiri, jadi menutup header native-stack dan tab bar tanpa perlu memikirkan urutan z. View absolut di root bisa tertimpa header native.
- `onRequestClose` memberi tombol Back dengan benar, dan TalkBack otomatis terkunci di dalam window `Modal`.
- Tetap hidup saat navigator dibangun ulang karena dipasang di luar `<Stack key>`.
- Biaya: `Modal` tidak ikut menyesuaikan diri dengan keyboard (lihat bawah). Tanpa dependensi baru.

Aturan:
- Back: jalankan `onPress` tombol `cancel` (artinya sama dengan menekan Batal). Jika tidak ada tombol cancel dan hanya satu tombol: Back sama dengan menekan tombol itu. Jika `cancelable: false`, Back diabaikan. Fungsi murni `backTarget(options)` mengembalikan indeks tombol atau `null`.
- Ketuk di luar kartu (scrim): HANYA menutup dialog satu tombol (info), dengan aksi tombol itu. Dialog dengan tombol destructive atau lebih dari satu tombol TIDAK ditutup lewat scrim (konfirmasi uang tidak boleh hilang karena salah ketuk). Fungsi murni `scrimTarget(options)`. `cancelable: false` mematikan keduanya.
- Satu kali: setiap dialog punya `id` dan flag `settled`. Tekan ganda, Back lalu tombol, atau tombol saat animasi tutup hanya menjalankan callback sekali.
- Antrean: FIFO. `showDialog` saat ada dialog terbuka menaruh dialog baru di belakang antrean; tampil setelah yang sekarang selesai. Dialog yang dibuka dari dalam `onPress` (Lanjut di `close.tsx` dan `restore.tsx`) masuk ke belakang antrean seperti dialog lain (FIFO murni, mudah diprediksi). Karena tidak ada dialog lain yang menunggu pada alur nyata, ia tampil langsung setelah yang pertama tertutup.
- Pemanggilan sebelum host terpasang: tersimpan di antrean dan tampil begitu host terpasang.
- Keyboard: saat sebuah dialog menjadi tampil, host memanggil `Keyboard.dismiss()` agar dialog tidak setengah tertutup keyboard (form `pay`, `kas/new`, `CorrectionForm` sering membuka dialog saat keyboard masih terbuka). Efek: fokus kolom hilang setelah dialog. Alert native tidak melakukan ini; perlu dicek di HP (bagian 8).
- TalkBack: kartu dibungkus `accessibilityViewIsModal`; judul `accessibilityRole="header"`; saat tampil, fokus aksesibilitas dipindahkan ke judul (`AccessibilityInfo.setAccessibilityFocus` setelah satu frame), lalu TalkBack lanjut ke pesan dan tombol sesuai urutan visual. Tombol memakai `Button` (role button, label sama dengan tulisan). Jangan menambah `announceForAccessibility` (akan terbaca dua kali). Tidak ada `role alertdialog` di RN; `Modal` sudah menyatakan jendela baru.
- Fokus kembali: setelah dialog tertutup, fokus kembali ke layar di bawah (perilaku bawaan window `Modal`).

## 4. Toast: masuk cakupan (kecil, ya)

`ToastAndroid` memakai font sistem juga, dan 12 layar memakainya, jadi satu pekerjaan yang sama. Tanda tangan tidak berubah: `toast(message: string): void` tetap di `src/ui/toast.ts`, sehingga 12 file pemanggil dan `SectionE.tsx` tidak perlu diubah. Implementasi baru: simpan satu pesan aktif di modul (`id`, `message`), `ToastHost.tsx` membacanya. Kehilangan `Platform.OS === 'android'` penjaga tidak masalah; host hanya ada di dalam aplikasi, di test tidak dirender.

- Tampilan: `View` absolut di root (BUKAN `Modal`, agar tidak memblokir sentuhan), `pointerEvents="none"`, di tengah horizontal, `marginHorizontal: spacing.lg`, `maxWidth: 480`. Latar `colors.text`, teks `colors.bgCard` memakai `type.body`, `radius.md`, padding `spacing.md` vertikal dan `spacing.lg` horizontal, `elevation.high`. Kontras sekitar 16:1.
- Posisi: `bottom = insets.bottom + 80` (dari `react-native-safe-area-context`, sudah terpasang). 80 = tinggi tab bar sekitar 56 + jarak `spacing.lg` agar toast di atas tab bar di Beranda dan Riwayat, dan masih wajar di layar tanpa tab bar. Simpan sebagai konstanta `TOAST_BOTTOM_OFFSET`. Nilai pastinya perlu dicek di HP.
- Durasi: 3000 ms (ToastAndroid.SHORT sekitar 2000 ms terlalu cepat untuk kalimat seperti "Pastikan cadangan benar-benar terkirim."). Pesan baru menggantikan pesan lama dan memulai ulang pengatur waktu (tidak antre: yang terbaru yang relevan). Animasi: fade 150 ms dengan `Animated` bawaan.
- Aksesibilitas: wadah memakai `accessibilityLiveRegion="polite"` (tanpa `accessibilityRole`). Perlu dicek di TalkBack; jika tidak terbaca, ganti dengan `AccessibilityInfo.announceForAccessibility(message)` (jangan pakai keduanya). Toast hanya konfirmasi; hasilnya juga terlihat di layar (angka berubah), jadi hilang otomatis tidak membuat pengguna TalkBack kehilangan informasi penting.
- Jika dialog sedang tampil, toast tertutup scrim. Satu kasus: `restore.tsx` (toast lalu dialog "Salinan pengaman"). Diterima: toast hanya konfirmasi.

## 5. Tabel pemanggil (21 Alert.alert, 14 file)

Teks disalin dari kode. Ekspresi dengan `${...}` dibiarkan sebagai ekspresi. Semua `Batal` adalah `role: 'cancel'`. Semua `onPress` tidak berubah. "info" = dialog tanpa Batal.

| # | File:baris | Judul | Pesan | Tombol (label, role) |
|---|---|---|---|---|
| 1 | `src/ui/components/CorrectionForm.tsx:31` | `title` (prop, mis. "Koreksi pembayaran Rp45.000") | `message` (prop) | `Batal` cancel; `submitLabel` (default `Koreksi`) destructive, `onPress` async: `setBusy(true)` lalu `await onSubmit(reason.trim())`, galat ke `setError` |
| 2 | `src/app/credits/index.tsx:65` | `` `Kembalikan uang ${formatRupiah(preview.entry.amount)}` `` | `lines.join('\n\n')` (baris 55-64) | `Batal` cancel; `Kembalikan uang` destructive |
| 3 | `src/app/periods/[id]/payout.tsx:120` | `` `Bayar tuan rumah ${formatRupiah(preview.payout)}` `` | `confirmMessage(hostName, week, date, preview) + warning` | `Batal` cancel; `Bayar` default (primary, bukan merah) |
| 4 | `src/app/periods/[id]/payments.tsx:73` | `Pembayaran gagal` | `toIndonesian(e)` | info: `showMessage` (Tutup, baru; lihat keputusan 2) |
| 5 | `src/app/periods/[id]/pay.tsx:104` | `paymentConfirmTitle(preview)` | `confirmMessage(memberName, date, preview)` | `Batal` cancel; `Simpan` default |
| 6 | `src/app/(tabs)/riwayat.tsx:103` | `Ringkasan bulan ini` | `SUMMARY_NOTE_FULL` | `Tutup` default (info, sudah ada) |
| 7 | `src/app/backup/restore.tsx:147` | `Data lama dikembalikan` | `ROLLED_BACK_TEXT` | info: `showMessage` (Tutup, baru) |
| 8 | `src/app/backup/restore.tsx:152` | `Salinan pengaman` | `safetyOfferText(outcome)` | `Nanti` cancel; `Bagikan` default, `onPress` memanggil `shareSafetyCopy(...)` dan galatnya memunculkan #9 |
| 9 | `src/app/backup/restore.tsx:157` | `Gagal membagikan` | `toIndonesian(e, 'share_safety')` | info: `showMessage` (Tutup, baru). Dipanggil dari catch async, jadi tampil setelah #8 tertutup |
| 10 | `src/app/backup/restore.tsx:167` | `Pemulihan bermasalah` | `toIndonesian(e, 'restore')` | info: `showMessage` (Tutup, baru). Dibuka tepat setelah `reloadEverything()`; host di luar `<Stack key>` menjamin aman |
| 11 | `src/app/backup/restore.tsx:185` | `restoreTexts.firstDialogTitle` ("Ganti semua data?") | `restoreTexts.firstDialogBody` | `Batal` cancel; `Lanjut` default, `onPress` membuka #12 |
| 12 | `src/app/backup/restore.tsx:190` | `restoreTexts.secondDialogTitle` ("Yakin ingin mengganti semua data?") | `restoreTexts.secondDialogBody` | `Batal` cancel; `restoreTexts.secondDialogOk` ("Ya, ganti semua data") destructive |
| 13 | `src/app/backup/index.tsx:62` | `Bagikan cadangan` | `` `${BACKUP_WARNING}\n\n${OFFSITE_HINT}\n\n${NO_ENCRYPTION_HINT}` `` | `Batal` cancel; `Lanjut bagikan` default |
| 14 | `src/app/(tabs)/index.tsx:139` | `` `Tutup pertemuan ${number}` `` | `closeWeekMessage(number, week.date, arrears)` | `Batal` cancel; `Tutup pertemuan` destructive |
| 15 | `src/app/periods/[id]/meetings/[number].tsx:110` | `Tukar tuan rumah` | `` `${summary}\n\n${swapNote}` `` | `Batal` cancel; `Simpan` default |
| 16 | `src/app/periods/[id]/index.tsx:63` | `` `Tutup pertemuan ${number}` `` | `closeWeekMessage(number, oldestOpen.date, arrears)` | `Batal` cancel; `Tutup pertemuan` destructive |
| 17 | `src/app/periods/[id]/close.tsx:94` | `Akhiri periode` | `` `Akhiri "${periodName}" pada ${formatDate(endDate)}?\n\nTunggakan ${formatRupiah(preview.totalWriteoff)} dari ${preview.writeoffs.length} anggota akan ditanggung kas dan dihapus dari catatan anggota. Sisa titipan anggota tetap tersimpan.` `` | `Batal` cancel; `Lanjut` default, `onPress` membuka #18 |
| 18 | `src/app/periods/[id]/close.tsx:102` | `Yakin ingin mengakhiri periode?` | `Ini tidak bisa dibatalkan. Setelah periode berakhir, pembayaran, pertemuan dan pembayaran tuan rumah periode ini tidak bisa diubah lagi.` | `Batal` cancel; `Ya, akhiri periode` destructive |
| 19 | `src/app/members/index.tsx:92` | `` `Hapus ${name}?` `` | `` `${name} belum punya data apa pun, jadi akan dihapus dari daftar. Tindakan ini tidak bisa dibatalkan.` `` | `Batal` cancel; `Hapus` destructive |
| 20 | `src/app/members/index.tsx:126` | `` `Arsipkan ${name}?` `` | `` `${name} akan disembunyikan dari daftar anggota dan dari pilihan anggota periode baru. Riwayat dan laporan tetap utuh. Bisa diaktifkan lagi kapan saja.` `` | `Batal` cancel; `Arsipkan` destructive. `archiveBlocker` tetap dicek SEBELUM dialog dibuka |
| 21 | `src/app/kas/new.tsx:227` | `` `Simpan ${kind === 'transfer' ? 'pindah saldo' : KIND_LABELS[kind].toLowerCase()} ${formatRupiah(e.amount)}?` `` | `lines.join('\n\n')` (baris 215-226) | `Batal` cancel; `Simpan` default |

Komentar kode yang menyebut "native dialog" atau `Alert.alert` perlu diperbarui saat penggantian: `close.tsx:91`, `members/index.tsx:90`, `CorrectionForm.tsx` (komentar prop dan baris 18).

`ToastAndroid`: hanya di `src/ui/toast.ts:1,8`. Pemanggil `toast(...)` (12 file, tanpa perubahan): `(tabs)/index.tsx`, `credits/index.tsx`, `backup/restore.tsx`, `backup/index.tsx`, `periods/[id]/index.tsx`, `periods/[id]/close.tsx`, `periods/[id]/pay.tsx`, `periods/new.tsx`, `periods/[id]/payout.tsx`, `periods/[id]/payments.tsx`, `periods/[id]/meetings/[number].tsx`, `kas/new.tsx`, ditambah galeri (`SectionE.tsx`, `parts.tsx`).

Galeri: belum ada `Alert.alert` di sana.

Keputusan untuk pemilik (efek kecil, perlu setuju):
1. Back di Alert native Android: sekarang tidak melakukan apa pun saat `cancelable` tidak diset. Di dialog baru Back sama dengan Batal. Lebih aman dan sesuai pola Android.
2. Empat dialog tanpa tombol (nomor 4, 7, 9, 10) sekarang bertombol bawaan "OK" milik sistem. Usulan label: `Tutup`, sama dengan dialog #6 yang sudah ada.
3. Tombol ditumpuk vertikal (aksi di atas, Batal di bawah), bukan sejajar dengan Batal di kiri seperti Alert native.

## 6. Galeri (Menu, tekan lama "Versi 1.0.0")

Tambah ke `src/ui/gallery/SectionD.tsx` (Kartu dan pesan), dengan `Section` baru "DialogHost" dan "ToastHost". Setiap `Demo` berisi satu tombol `Button` yang memanggil `showDialog` atau `toast`. Teks pakai fixture yang sudah ada (`T5_ERROR`, `T6_LONG`, `T1_LABEL`, `T8_MEMBER`) supaya galeri tidak mengimpor data.

DialogHost:
1. Konfirmasi biasa: dua tombol (Batal, Simpan) dengan pesan pendek.
2. Konfirmasi merah: destructive (judul, dua paragraf, tombol "Ya, akhiri periode" merah, Batal).
3. Info satu tombol (Tutup), dan ketuk di luar menutupnya.
4. Judul panjang (T1_LABEL) dan label tombol panjang.
5. Pesan sangat panjang (T5_ERROR + T6_LONG diulang) untuk menguji gulir, tombol tetap terlihat.
6. Tiga tombol (dua aksi + Batal).
7. `cancelable: false` (Back dan ketuk-luar tidak menutup; satu tombol menutup).
8. Dua dialog beruntun (Lanjut membuka dialog kedua), seperti `close.tsx`.
9. Antrean: tombol yang memanggil `showDialog` dua kali sekaligus; yang kedua tampil setelah yang pertama.
10. Dengan keyboard: ada `TextField` di atas tombol; buka keyboard lalu buka dialog.

ToastHost:
11. Toast pendek ("Pembayaran tersimpan").
12. Toast panjang (dua baris) dan tiga ketukan cepat (pesan terakhir menggantikan).

Dua komponen baru di `src/ui/components/` (`DialogHost.tsx`, `ToastHost.tsx`) membuat `gallery.test.ts` perlu diubah: `toHaveLength(27)` jadi `29`, dan SectionD harus mengimpor `../components/DialogHost` dan `../components/ToastHost` (test mencari path persis itu). Itu perubahan test yang disengaja, jangan dilewatkan.

## 7. Daftar test unit (Jest, di `src/ui/dialog.test.ts`, tanpa render)

Peran dan tombol:
1. `orderButtons`: cancel dipindah ke paling akhir, tombol lain tetap berurutan; tanpa cancel urutan tidak berubah; 3 tombol.
2. `buttonVariant`: destructive menjadi `danger`, default menjadi `primary`, cancel menjadi `secondary`; satu tombol cancel tetap `secondary`.
3. `showDialog` menolak (melempar) 0 atau lebih dari 3 tombol.

Back dan scrim:
4. `backTarget`: menunjuk tombol cancel; tanpa cancel dan satu tombol menunjuk tombol itu; tanpa cancel dan lebih dari satu tombol: `null`; `cancelable: false`: `null`.
5. `scrimTarget`: dialog satu tombol non-destructive menunjuk tombol itu; dialog dengan destructive: `null`; dialog dua tombol: `null`; `cancelable: false`: `null`.

Satu kali dan urutan:
6. Tekan tombol yang sama dua kali: `onPress` terpanggil sekali.
7. Tekan tombol lalu Back pada dialog yang sama: hanya yang pertama jalan.
8. Saat `onPress` berjalan dialog itu sudah tidak ada di kepala antrean (`current()` sudah berubah).
9. `onPress` melempar galat: galat dilempar ulang ke pemanggil dan antrean tetap berfungsi (dialog berikutnya tampil, pendengar dipanggil sekali).
10. `onPress` async yang ditolak tidak mengubah status host.

Antrean:
11. Dua `showDialog` berturut-turut: yang pertama `current`, yang kedua menunggu; setelah yang pertama selesai, yang kedua `current`.
12. `showDialog` dari dalam `onPress` (Lanjut): dialog baru jadi `current` dan pendengar dipanggil tepat sekali per penyelesaian (tidak ada keadaan tengah tanpa dialog).
13. Pemanggilan sebelum ada pendengar tersimpan; pendengar yang baru mendaftar langsung melihat `current`.
14. `showMessage`: satu tombol berlabel `Tutup`, role default.

Toast (di `src/ui/toast.test.ts`):
15. `toast('a')` lalu `toast('b')`: pesan aktif `'b'`, id baru.
16. Pesan tidak kosong memiliki id unik naik; pengatur waktu lama tidak menghapus pesan baru (uji dengan fake timers).

Static (seperti `gallery.test.ts`):
17. Setelah penggantian selesai, tidak ada file di `src` yang mengimpor `Alert` atau `ToastAndroid` dari `react-native`.
18. `DialogHost.tsx` memuat `statusBarTranslucent`, `onRequestClose`, dan `accessibilityViewIsModal`; tidak memuat `fontWeight`.

## 8. Yang perlu dicek pemilik di HP (font normal)

1. Dialog tampil dengan font Inter, kartu di tengah, scrim menutup header dan status bar.
2. Tombol Back = Batal; ketuk luar tidak menutup konfirmasi uang; ketuk luar menutup dialog info.
3. Tekan dua kali cepat pada "Simpan" (pay, kas/new): hanya satu catatan.
4. Buka dialog saat keyboard terbuka (pay, CorrectionForm): dialog tidak tertutup keyboard, dan keyboard tertutup.
5. Alur dua langkah "Akhiri periode" dan "Ganti semua data": dialog kedua tampil tanpa kedip, Batal di kedua langkah aman.
6. Setelah pemulihan: dialog "Salinan pengaman" tampil di atas Beranda yang baru dibangun, "Bagikan" membuka share sheet.
7. TalkBack: fokus pertama di judul, lalu pesan, lalu tombol; judul terbaca sebagai judul; toast terbaca.
8. Toast berada di atas tab bar di Beranda dan Riwayat, dan tidak menutupi tombol di layar form.
9. Pesan terpanjang (kas/new dengan catatan panjang) menggulir dan tombol tetap terlihat.
