# Spesifikasi: galeri komponen (khusus developer)

Tujuan: satu layar untuk memeriksa tata letak 26 komponen di `src/ui/components` dengan teks Indonesia sangat panjang dan ukuran font sistem besar, tanpa mencari layar asli yang kebetulan memuat teks itu. Disetujui pemilik sebagai "cara A". Dasar teks: glosarium final di `docs/specs/ui-language-review.md` bagian 2.

Status: spek untuk dikerjakan developer. Belum ada kode. Tidak mengubah aturan bisnis, tidak menambah dependensi.

## 1. Aturan umum

- Semua isi adalah data tiruan statis (konstanta di satu berkas fixture). Tanpa data nyata, tanpa database, tanpa repository, tanpa store. Tidak ada tulis ke data apa pun.
- Semua `onPress` hanya mengubah keadaan lokal layar atau memanggil `toast('Ditekan: <nama>')`. Tidak ada navigasi.
- Pengecualian `HistoryRow`: komponen ini memanggil `router.push` ke `/kas/[entryId]` di dalamnya. Di galeri, bungkus dengan pembungkus yang menangkap sentuhan (mis. `Pressable` transparan di atasnya, `pointerEvents` diatur) atau tambahkan prop opsional `onPress` pada komponen; pilih yang paling kecil, putusan developer. Jangan sampai menekan baris membuka layar rincian dengan id palsu.
- Komponen dengan keadaan (TextField, OptionRow, Chip, IconChoice, AmountKeypad) dipasang dengan state lokal supaya bisa dicoba.
- Gaya galeri: `ScrollView` satu kolom, latar halaman biasa. Tiap bagian diberi `SectionHeader` (judul = nama komponen) dan satu baris teks kecil berisi daftar keadaan. Jangan menambah komponen baru; hanya pakai komponen yang diperiksa.
- Teks galeri sendiri (judul bagian, keterangan) boleh bahasa Indonesia atau Inggris; ini layar developer dan tidak masuk glosarium pengguna.
- Kontrol lebar layar di bagian atas (opsional, murah): tombol untuk membatasi lebar isi ke 320 dp, 360 dp, dan penuh, lewat `View` pembungkus dengan `maxWidth`. Ukuran font tidak diubah dari kode; pemilik mengubahnya di pengaturan HP (lihat bagian 5).
- Kode galeri dan komentarnya bahasa Inggris; teks contoh Indonesia.

## 2. Cara membuka (hanya pengembangan)

Usulan utama: tekan lama (sekitar 1 detik) tulisan versi aplikasi di bagian bawah halaman Menu (`src/app/(tabs)/menu.tsx`).

- Hanya dirender dan hanya terdaftar sebagai rute bila `__DEV__` bernilai true. Di build rilis, baris pemicu tidak ada dan rute tidak bisa dibuka.
- Rute: `src/app/dev/components.tsx`. Berkas ini dan pemicunya dibungkus kondisi `__DEV__`; di `_layout` tidak mendaftarkan layar tersebut saat bukan `__DEV__`. Catatan: expo-router membuat rute dari berkas, jadi di berkas itu juga ada penjaga: `if (!__DEV__) return <Redirect href="/" />` agar tautan langsung tidak membukanya.
- Tidak ada ikon, tidak ada menu terlihat, tidak masuk teks bantuan. Pengguna biasa tidak akan melihatnya.
- Alternatif bila tekan lama sulit ditemukan: baris tersembunyi di akhir daftar Menu dengan teks "Galeri komponen (pengembang)", juga hanya saat `__DEV__`. Pilih salah satu; yang pertama diutamakan karena tidak menambah baris di Menu.
- Keputusan untuk pemilik: tidak ada. Pemicunya tidak terlihat oleh pengguna dan tidak mengubah aturan.
- Perlu dicek di HP: bahwa pemicu tidak muncul di build rilis (cek `__DEV__` di Expo Go memang true, jadi pemeriksaan build rilis baru bisa dilakukan saat ada APK; sementara cukup tinjau kodenya).

## 3. Bagian dan keadaan per komponen

Teks panjang yang dipakai (dari glosarium dan pesan final; salin persis ke fixture):

- T1 (label): `Piutang (dipinjam anggota)`
- T2 (tombol): `Lihat pembayaran tuan rumah`
- T3 (judul Notice): `Semua data akan diganti`
- T4 (judul Notice): `Semua data akan dihapus`
- T5 (pesan galat panjang): `Jumlah harus kelipatan Rp15.000, misalnya Rp15.000, Rp30.000, atau Rp45.000. Pembayaran sebagian tidak bisa dicatat.`
- T6 (pesan panjang): `Tunggakan yang tersisa dihapus dan ditanggung kas. Tidak mengubah saldo kas. Langkah ini tidak bisa dibatalkan.`
- T7 (sangat panjang, satu kata tanpa spasi tidak perlu): `Berkas cadangan ini berasal dari HP lain. Semua data di HP ini akan diganti dengan isinya, dan salinan pengaman dibuat lebih dulu supaya bisa dikembalikan bila ada masalah.`
- T8 (nama anggota panjang): `Siti Nurhaliza Rahmawati binti Abdurrahman`
- Jumlah: `Rp1.250.000`, `Rp12.345.000`, dan satu `Rp123.456.789` sebagai batas ekstrem.

Urutan bagian mengikuti pengelompokan di bawah. Untuk setiap komponen, tampilkan keadaan yang tercantum, masing-masing dengan keterangan kecil di atasnya.

### Bagian A. Tombol dan aksi

**Button** (`Button.tsx`)
- Kelima varian (primary, secondary, tertiary, danger, dangerOutline), teks pendek `Simpan`.
- Teks panjang T2 pada primary dan pada danger, lebar penuh.
- Disabled tanpa alasan; disabled dengan `disabledReason` panjang (T5).
- Loading (spinner, ukuran tetap).
- Pressed: tahan tekan untuk melihat (tidak ada keadaan paksa; keterangan "tahan untuk melihat warna tekan").
- `compact` dengan T2.
- Baris tombol horizontal (`flexDirection: row`, `flex: 1` tiap tombol): dua tombol (`Batal` + `Simpan`); tiga tombol (`Batal`, `Ubah tanggal`, `Lihat pembayaran tuan rumah`); tombol `compact` bersebelahan dengan teks panjang. Ini tempat paling mungkin teks terpotong atau tinggi tombol tidak sama.

**QuickAction** (`QuickAction.tsx`)
- Grid satu baris berisi 4 ubin (`flex: 1`) dengan label pendek: `Bayar`, `Catat kas`, `Pinjaman`, `Riwayat`.
- Label panjang di ubin: `Pembayaran tuan rumah`, `Pengeluaran bersama`, `Piutang (dipinjam anggota)`.
- Satu ubin disabled dengan `disabledReason` (ketuk memunculkan toast).
- Pressed.

**PillLink** (`PillLink.tsx`)
- `Piutang Rp1.250.000`, `Titipan Rp12.345.000`, `Piutang (dipinjam anggota)` dengan `Rp123.456.789`.
- Dua pill berdampingan dalam satu baris (`flexWrap: wrap`) untuk melihat apakah turun baris.
- `hidden` true (topeng saldo).

**Chip** (`Chip.tsx`) dan label mirip tab
- Baris chip pendek: `Hari ini`, `Kemarin`, `Selasa lalu`; satu terpilih (ada centang).
- Chip berlabel panjang: `Piutang (dipinjam anggota)`, `Lihat pembayaran tuan rumah`.
- Baris chip dengan `flexWrap: wrap` dan baris chip dalam `ScrollView` horizontal; keduanya tampil, periksa mana yang tidak terpotong.
- Label mirip tab (satu baris 3-4 `Chip` yang berperan sebagai tab: `Beranda`, `Anggota`, `Riwayat`, `Menu`): terpilih dan tidak terpilih. Tab sungguhan (bilah bawah) bukan komponen di folder ini dan tidak dibuat ulang; yang diperiksa hanya label panjang dan jumlah banyak dalam satu baris.
- Pressed.

**SectionHeader** (`SectionHeader.tsx`)
- Judul pendek tanpa aksi; judul dengan `actionLabel` `Lihat semua`; judul panjang (`Pulihkan atau mulai dari nol` dan T7 dipotong jadi judul) dengan aksi, untuk memeriksa `flexShrink`.

### Bagian B. Baris dan daftar

**ListRow + RowText** (`ListRow.tsx`)
- Baris biasa: judul pendek + RowText muted; dengan `right` berisi `Money`.
- Judul panjang T8 dengan `right` `Rp12.345.000`: periksa jumlah tidak terdorong keluar.
- Judul T2, tiga RowText bertingkat (`muted`, `danger`, `ok`, `warn`) masing-masing teks T5 atau T6.
- `tone` `default`, `alt`, `danger`. `strikeTitle`. `destructive`.
- Bisa ditekan (pressed) dan tidak bisa ditekan.
- `right` berisi `Badge` di atas `Money`.

**OptionRow** (`OptionRow.tsx`)
- checkbox dan radio, terpilih dan tidak.
- Label T8, `hint` `(tuan rumah pertemuan 2)`, `trailing` `Sisa Rp12.345.000` (jumlah juga `Sisa Rp1.250.000`).
- Label T1 dengan hint dan trailing sekaligus; periksa ketiganya tidak bertabrakan.
- Pressed.

**ReminderRow** (`ReminderRow.tsx`)
- Lima `kind` (pay_host, choose_host, close_week, close_period, backup), tiap satu dengan `title` dan `detail` pendek, `urgent` bergantian.
- Satu dengan `title`, `detail` dan `actionLabel` panjang (T2). Komponen berpindah ke susunan menumpuk bila lebar kurang dari 360 dp atau skala font di atas 1,15; periksa kedua susunan (gunakan kontrol lebar bagian 1).

**HistoryRow** (`HistoryRow.tsx`)
- Fixture `LedgerListItem` untuk: pembayaran anggota (uang masuk), bayaran tuan rumah (keluar), potongan, pindah saldo (netral), pinjaman, penghapusan tunggakan, pengembalian titipan, pembalikan.
- Catatan panjang (T6) pada satu baris; nama anggota T8.
- Sudah dikoreksi (`reversedById` terisi: coret judul, Badge `Dikoreksi`, latar merah muda).
- Peringatan "belum ada Tunai atau Debit" (satu fixture yang memicu `showsNoPosWarning`).
- Jumlah `Rp1.250.000`, `Rp12.345.000`, `Rp123.456.789`.
- `flat` true di dalam `Card`, dua baris berurutan.
- Catatan developer: bila membuat `LedgerListItem` palsu sulit karena banyak kolom, pakai satu fungsi pembantu di fixture; jangan memanggil database.

**InitialsRow** (`InitialsRow.tsx`)
- Kosong (`initials: []`): teks `Belum ada yang bayar hari ini.`
- Tiga inisial; delapan inisial dengan `extra: 4` (lingkaran `+4`); cukup banyak sehingga bisa digulir mendatar.
- Skala font besar: lingkaran 40 dp tidak membesar, periksa teks inisial tidak terpotong.

**ReportLine** (`ReportLine.tsx`)
- Label pendek `Total kas` dengan `Rp12.345.000`; `strong` true.
- Label panjang T1 dengan `hint` T5 dan jumlah `Rp123.456.789`.
- `amount: null` dengan `emptyText` `Belum dibayar`; dan tanpa `emptyText` (tampil `-`).
- Tone positive, negative, neutral.
- Tiga baris berurutan di dalam `Card`, seperti kartu Laporan.

### Bagian C. Angka uang

**Money** (`Money.tsx`)
- Semua ukuran: hero, display, large, heading, body, dengan `Rp1.250.000` dan `Rp12.345.000`.
- Tanda `+`, `-`, tanpa tanda; angka negatif; nol.
- Tone dipaksa positive, negative, neutral.
- `fit` true di wadah sempit (lebar tetap 120 dp) dengan `Rp123.456.789` pada ukuran hero: harus mengecil, tidak membungkus.
- `fit` false di wadah yang sama: periksa apakah membungkus atau terpotong (ini untuk perbandingan).

**AmountDisplay** (`AmountDisplay.tsx`)
- Kosong (`''` menampilkan `0` samar), `15000`, `1250000`, `12345000`, `123456789`.
- Wadah sempit (200 dp) dengan `123456789` untuk memeriksa pengecilan.

**AmountKeypad** (`AmountKeypad.tsx`)
- Terpasang bersama `AmountDisplay` dengan state lokal (gunakan fungsi dari `@/domain/amount-input` yang sudah dipakai layar asli; tidak ada logika uang baru di galeri).
- Periksa: 12 tombol sama tinggi, tidak terpotong di bawah pada lebar 320 dp, tekan lama hapus mengosongkan.

### Bagian D. Kartu dan pesan

**Card** (`Card.tsx`)
- Kelima `tone`: default, alt, info, warn, danger, masing-masing berisi satu judul dan satu kalimat T5.
- Kartu berisi `ReportLine` dan `Button` (komposisi nyata).

**Notice** (`Notice.tsx`)
- Info, warn, danger, masing-masing tanpa judul (teks pendek) dan dengan judul.
- Judul T3 (warn) dengan isi T7; judul T4 (danger) dengan isi T6.
- Isi sangat panjang (T7 ditambah T5 digandeng) untuk melihat tinggi dan ikon tetap sejajar baris pertama.
- Tiga Notice bertumpuk.

**Badge dan Dot** (`Badge.tsx`)
- Lima `tone` dengan kata `Berlaku`, `Dikoreksi`, `Lunas`, `Belum lunas`, `Baru sebagian`.
- Label panjang `Lunas lewat potongan` dan `Lunas lewat titipan`; periksa tidak membungkus aneh (komponen `alignSelf: flex-start`, tanpa batas lebar).
- Dot `error` dan `brand` di samping teks.
- Beberapa Badge dalam satu baris (`flexWrap`).

### Bagian E. Formulir

**TextField** (`TextField.tsx`)
- Normal dengan placeholder; berisi teks; fokus (ketuk untuk melihat).
- Dengan `helper` panjang (T5); dengan `error` panjang (T5 atau T6); error menggantikan helper.
- `editable={false}` (hanya-baca).
- `multiline` dengan isi panjang.
- Label panjang: `Piutang (dipinjam anggota) yang ingin dicatat`.
- Dua TextField bertumpuk dengan keyboard terbuka: periksa kolom tidak tertutup (layar galeri harus memakai `keyboardShouldPersistTaps` dan inset keyboard seperti layar formulir lain).

**DateField** (`DateField.tsx`)
- Nilai tetap `2026-01-04`; hari ini; tanpa error; dengan error panjang (T5).
- Label panjang. Menekan membuka kalender Android sungguhan (dibiarkan; ini aman karena hanya mengubah state lokal).
- Teks tanggal ditampilkan sesuai `dateFieldText`; periksa tidak terpotong dengan font besar.

**IconChoice** (`IconChoice.tsx`)
- Tiga ubin berdampingan: `Tunai`, `Debit`, `Piutang`; satu terpilih.
- Label panjang di ubin: `Piutang (dipinjam anggota)`. Komponen memakai `numberOfLines={1}`: label akan terpotong; keadaan ini justru dipamerkan agar pemilik memutuskan (lihat bagian 4, catatan).
- Dua ubin dan empat ubin dalam satu baris.

**CorrectionForm** (`CorrectionForm.tsx`)
- Keadaan awal; setelah ketuk `Koreksi` dengan alasan kosong (muncul `Alasan koreksi wajib diisi.`).
- `title` panjang: `Koreksi pembayaran Rp12.345.000 oleh Siti Nurhaliza Rahmawati`; `message` T6. `onSubmit` berupa janji yang tertunda 1 detik; `onCancel` memunculkan toast. Dialog `Alert` akan tampil sungguhan; `Alert` bukan bagian layar, jadi cukup dicek sekilas.
- Keadaan sibuk (tombol nonaktif) tampil sebentar setelah mengonfirmasi.

**MonthSwitcher** (`MonthSwitcher.tsx`)
- `2026-01` (sebelumnya & berikutnya aktif); bulan terbaru dengan `nextDisabled`.
- Bulan dengan nama paling panjang yang mungkin (`2026-09` untuk "September", cek teks `formatMonth`) pada skala font besar; periksa tombol panah tidak terdorong.
- Dua kali: lebar penuh dan lebar 320 dp.

**SwipeRow** (`SwipeRow.tsx`)
- Terbuka (`enabled`) dengan `label` `Bayar Rp15.000` dan satu `ListRow` sebagai isi; geser kanan melewati ambang memunculkan toast, kembali ke posisi.
- `enabled` false (baris biasa).
- Label panjang `Bayar Rp45.000 untuk 3 pertemuan` (periksa terpotong di belakang baris).
- Catatan: di galeri `onSwipe` hanya toast. Menggulir vertikal harus tetap bekerja.

### Bagian F. Keadaan layar penuh

**EmptyState** (`EmptyState.tsx`)
- Judul pendek tanpa pesan; judul + pesan; judul + pesan + tombol.
- Judul panjang + pesan T7 + tombol T2 (tombol melebar penuh).
- Karena komponen tidak `flex: 1`, tampilkan di dalam `Card` atau tinggi biasa.

**Loading** (`Loading.tsx`)
- Label bawaan `Memuat...`; label panjang `Memuat data cadangan, mohon tunggu sebentar...`.
- `Loading` memakai `flex: 1`: bungkus dengan `View` tinggi tetap 200 dp agar tidak menelan seluruh galeri.

**ErrorState** (`ErrorState.tsx`)
- Pesan pendek tanpa `onRetry`; dengan `onRetry` (toast); pesan panjang T5 + T6 digandeng, dengan `onRetry`.
- Sama dengan Loading: bungkus dengan `View` tinggi tetap (mis. 320 dp). Komponen memakai `flex: 1` dan `justifyContent: center`.

## 4. Pengambilan keputusan dari hasil galeri

Galeri hanya memeriksa. Perbaikan komponen dikerjakan terpisah dan lewat persetujuan pemilik. Hal yang sudah terlihat dari membaca kode (bukan dari layar; perlu dikonfirmasi di HP):

- IconChoice: label dibatasi `numberOfLines={1}`, jadi `Piutang (dipinjam anggota)` pasti terpotong pada tiga ubin. Kandidat perbaikan: izinkan dua baris atau pakai label pendek "Piutang" dengan keterangan di bawah.
- Badge tidak punya batas lebar; label panjang di baris sempit mungkin membungkus ke bawah.
- QuickAction, Button, ListRow: tidak ada `numberOfLines`, jadi teks panjang membungkus (aman), tetapi tinggi ubin dalam satu baris bisa tidak sama.
- Money dengan `fit` mengecil sampai 60%; tanpa `fit` bisa membungkus. Periksa tempat pemakaian yang tidak memakai `fit`.
- Chip: `maxFontSizeMultiplier` 1,3 membatasi pembesaran; teks panjang sebaiknya tidak membuat chip melebihi lebar layar.

## 5. Apa yang dicari pemilik saat melihat tangkapan layar

Cara memeriksa: buka galeri di HP lewat Expo Go. Ulangi dengan tiga pengaturan font sistem: bawaan, besar, dan terbesar (Pengaturan > Tampilan > Ukuran font; sekaligus Ukuran tampilan ke terbesar bila ada). Ambil satu tangkapan layar per bagian per pengaturan. Untuk lebar sempit, pakai kontrol 320 dp di galeri.

Daftar tanda masalah, berlaku untuk semua bagian: teks terpotong (kata hilang atau berakhir "..."), teks bertumpuk atau menimpa elemen lain, angka uang terpotong atau bergeser ke luar layar, tombol lebih kecil dari ukuran sentuh nyaman (sekitar 48 dp), tombol yang rusak bentuknya (teks keluar dari kotak, tinggi berbeda dalam satu baris), kotak yang keluar dari tepi layar, tidak bisa digulir mencapai bagian bawah, kontras teks kurang terbaca.

Per bagian:

- A (tombol dan aksi): teks tombol terpotong atau keluar kotak pada T2; tombol dalam satu baris yang tingginya tidak sama; ubin QuickAction label panjang membuat baris tidak sejajar; PillLink jumlah menyundul chevron atau pill melebar melewati layar; tab-chip yang tidak muat (apakah ada cara menggulir); judul SectionHeader menimpa `Lihat semua`; kotak `Chip` terpilih tidak jelas.
- B (baris dan daftar): jumlah uang di kanan terdorong keluar atau terpotong pada judul T8; teks RowText terpotong; checkbox/radio OptionRow mengecil atau label bertabrakan dengan `trailing`; tombol ReminderRow terpisah dari teksnya dengan jelek (apakah menumpuk saat lebar 320 dp dan font besar); HistoryRow: ikon, judul, jumlah saling menimpa, jumlah `Rp123.456.789` memotong judul, label `Dikoreksi` terlihat; InitialsRow inisial terpotong di lingkaran; ReportLine jumlah dan label saling mendesak.
- C (angka uang): digit terpotong, `Rp` terpisah dari angka, angka hero tidak mengecil di wadah sempit, tanda minus hilang, angka rata kiri-kanan (tabular) goyah; AmountKeypad tombol menyempit atau tertutup bilah navigasi; AmountDisplay melewati layar.
- D (kartu dan pesan): ikon Notice tidak sejajar dengan baris pertama; judul Notice dan isi bertumpuk; kartu `warn` dan `danger` hanya dibedakan warna (harus terbaca lewat kata dan ikon); Badge membungkus ke dua baris atau kata terpotong.
- E (formulir): label atau pesan galat terpotong; kolom tertutup keyboard; border galat tidak terlihat; DateField teks tanggal terpotong atau ikon terdorong; IconChoice label terpotong (sudah diduga); CorrectionForm dua tombol bertumpuk dengan baik; MonthSwitcher panah terdorong atau nama bulan terpotong; SwipeRow label di belakang baris terpotong atau baris tidak kembali ke tempat.
- F (keadaan layar): teks EmptyState/ErrorState terpotong atau tidak bisa digulir bila panjang; tombol EmptyState sulit dijangkau; Loading menutupi bagian lain.

Sebelum melapor: catat nama bagian, pengaturan font, dan tangkapan layar. Satu temuan = satu komponen + satu keadaan, agar bisa dikerjakan satu per satu.

## 6. Penerimaan

- Semua 26 komponen muncul di galeri, masing-masing dengan keadaan di bagian 3 (tidak boleh ada komponen yang dilewatkan; developer mencocokkan dengan daftar di `src/ui/components` saat selesai).
- Galeri tidak membaca database, store, atau berkas nyata.
- Galeri tidak ada dan tidak bisa dibuka di build rilis (periksa `__DEV__`).
- `npx tsc --noEmit` dan `npx expo lint` bersih. Tidak ada dependensi baru.
- Dicek pemilik di HP: pemicu (tekan lama versi di Menu) terbuka, layar bisa digulir sampai akhir, dan tangkapan layar tiap bagian dapat diambil pada tiga ukuran font.
