# Audit desain Mas Catat, November 2026

Tanggal: 2026-11-13. Penulis: ui-ux-designer. Status: HANYA temuan. Tidak ada kode diubah, tidak ada yang dibangun atau di-commit.

Kriteria (urutan prioritas pemilik, 2026-11-13): konsistensi (K), kegunaan (U), aksesibilitas (A), estetika (E). Acuan ukuran font: normal saja. Catatan font besar hanya sebagai catatan prioritas rendah (G8).

## 0. Dasar dan batas

- Dibaca: kode `src/app`, `src/ui`, `docs/specs/design-system-spec.md` (ada; aturan jarak di bagian 4), `wallet-patterns-spec.md` (hanya dicek judulnya), `component-gallery.md` (ada), `src/ui/theme.ts`, dan 10 dari 23 tangkapan layar pemilik (4 terbaru dengan Inter, 6 lama untuk tata letak; 13 lainnya tidak dibuka). 4 yang terbaru (3c6556af, 4fcd1d73, a09e7f9c, 0926beb0) memakai Inter. Yang lama hanya dipakai untuk tata letak.
- Saya TIDAK melihat layar di perangkat. Semua yang tertulis "terlihat" berasal dari tangkapan layar pemilik. Yang lain dari membaca kode. Hal yang harus dicek di HP ditandai "Cek HP".
- Tombol roda gigi abu-abu di pojok kanan atas semua tangkapan layar adalah tombol menu pengembang Expo Go, bukan bagian aplikasi. Tidak dinilai.
- Spesifikasi `design-system-spec.md` sudah tertinggal: warna merek di sana biru tinta, kode memakai teal (keputusan pemilik, PROJECT.md baris 94-99), font di sana Roboto, kode memakai Inter. Lihat G9.
- Kolom "Uang/data": semua temuan tidak menyentuh aturan uang atau data. Satu menyentuh tampilan angka uang (G2) dan satu memindahkan tampilan jumlah yang diketik (C1). Keduanya hanya tampilan.

Ukuran: S = kurang dari 1 jam kerja, M = beberapa jam, L = sehari atau lebih.

---

## 1. Lintas layar (G)

**G1. Judul header semua layar rincian selalu "Mas Catat". [U] [S] [do-first]**
- Masalah: `src/app/_layout.tsx` baris 42 memasang `headerTitle: 'Mas Catat'` di `screenOptions`. `headerTitle` mengalahkan `title`, jadi 23 judul per layar yang ditulis di baris 51-77 ("Jadwal periode", "Cadangan dan ekspor", "Pulihkan data", dan seterusnya) tidak pernah tampil. Terlihat di tangkapan layar Jadwal, Cadangan, Pulihkan, dan galeri: semuanya "Mas Catat".
- Mengapa: pengguna tidak tahu sedang di layar mana (Pulihkan data tidak punya judul lain di isinya). Konsistensi dengan tab, yang memakai judul sendiri.
- Usul: hapus `headerTitle` dari `screenOptions` (tab Beranda sudah punya `headerTitle: 'Mas Catat'` sendiri dan `(tabs)` menyembunyikan header stack). Setelah itu, judul besar di isi layar yang sama dengan judul header jadi dobel: `pay.tsx` ("Catat pembayaran") dan `periods/[id]/index.tsx` (nama periode tetap boleh, itu data). Hapus judul dobel hanya di layar yang persis sama; `kas/new` tetap, karena judul isinya ("Pindah saldo") lebih spesifik dari header ("Catat kas"). Cek HP: judul panjang ("Laporan pertemuan") tidak terpotong dengan panah kembali.

**G2. Tanda minus tampak terlepas dari "Rp" (kasus a). [E] [S] [do-first]**
- Masalah: "-Rp50.000" punya celah antara "-" dan "R", sedangkan "+Rp50.000" rapat. Terlihat di Riwayat, Money (galeri), Beranda "Bulan ini". Juga pada saldo negatif ("Angka negatif" di galeri).
- Penyebab (hasil membaca kode, belum diuji pada font): `Money.tsx` memberi `fontVariant: ['tabular-nums']` ke seluruh teks, termasuk tanda. `formatSigned` memakai tanda hubung ASCII (U+002D). Di Inter, tanda hubung adalah glyph pendek dan rendah dengan ruang kiri kanan sendiri, jadi tidak setara lebar dan tinggi dengan "+". Kemungkinan lain: `tnum` ikut melebarkan glyph itu. Saya tidak menjalankan apa pun pada berkas font, jadi dua kemungkinan ini belum dipastikan. Dua-duanya selesai dengan usul di bawah.
- Mengapa: angka uang harus rapat dan mudah dibandingkan. Tanda yang melayang bisa terbaca sebagai pemisah, bukan bagian angka.
- Usul, urutan coba:
  1. Di `Money.tsx` saja (bukan `format.ts`): ganti "-" di depan teks dengan U+2212 ("−"). Inter punya glyph ini dan lebarnya dirancang sama dengan "+". `formatSigned`, `formatRupiah`, tes `format.test.ts`, CSV, dan teks dialog tidak berubah (tetap ASCII).
  2. Bila masih ada celah: pecah jadi dua Text bersarang. Tanda tanpa `tnum`, "Rp..." dengan `tnum`. Teks bersarang bergaya sendiri didukung RN.
  3. Tambahkan `accessibilityLabel` di `Money`: "minus Rp50.000" dan "plus Rp50.000". Pembacaan "−" dan "+" oleh TalkBack belum saya periksa; label eksplisit menghindari tebakan.
- Uji: tambah satu baris galeri (lihat Gl1) berisi +, −, tanpa tanda pada ukuran hero, large, heading, body. Cek HP.
- Uang/data: YA untuk tampilan angka uang (hanya `Money.tsx`). Nilai, tanda yang disimpan, dan format di tempat lain tidak berubah.

**G3. Judul bagian berjarak sama dari kartu di atas dan kartu miliknya. [K] [M] [worth-it]**
- Masalah: `SectionHeader` ditaruh langsung di kontainer ber-`gap` seragam: Beranda (`gap lg`), Laporan dan Jadwal (`gap md`), Anggota. Judul "Pengingat (2)" di Beranda terlihat sama jauh dari kartu atas dan bawahnya. Cadangan dan Pulihkan sudah benar: bagian dibungkus `View` ber-gap `sm`, antar bagian `lg`.
- Mengapa: kedekatan menunjukkan hubungan. Aturan bagian 4 spesifikasi: `xl` antar bagian, `sm` judul ke isi.
- Usul: satu pola. Bungkus judul + isinya dalam satu `View` (`gap: spacing.sm`), kontainer layar `gap: spacing.xl` antar bagian (bagian tanpa judul tetap `lg`). Atau beri `SectionHeader` `marginTop: spacing.sm` dan kecilkan gap bawah; pilih satu dan terapkan di Beranda, Laporan, Jadwal, Anggota. Satu komponen `Section` kecil bila developer melihat pengulangan.

**G4. Empat gaya baris berbeda; tidak semua baris yang membuka layar punya tanda panah. [K] [M] [worth-it]**
- Masalah: Menu: baris abu (`bgMute`), tinggi 56, ikon + panah. ListRow default: putih + garis. ListRow `alt`: abu, tanpa panah (daftar periode Laporan, aksi kartu pertemuan Beranda). Baris Jadwal: putih tanpa garis. Baris "Pulihkan dari cadangan" (Cadangan) tanpa panah, sedangkan baris salinan pengaman di Pulihkan punya "Pulihkan" + panah.
- Mengapa: pengguna harus menebak mana yang bisa diketuk. Konsistensi.
- Usul: dua gaya saja. (1) Baris navigasi = ListRow dengan ikon kiri opsional dan panah kanan (`chevron-forward` 20dp, `textTertiary`) otomatis bila ada `onPress`; Menu, Laporan, Anggota, Cadangan memakainya. (2) Baris informasi = tanpa panah, putih. Tambahkan prop `leadingIcon` dan `chevron` (default true bila `onPress`) ke ListRow; Menu memakai komponen yang sama.

**G5. Keadaan ditekan memakai opacity 0.75 di tiga tempat. [K] [S] [optional]**
- `menu.tsx` baris 123, `kas/index.tsx` baris 96, `periods/[id]/payments.tsx` baris 143. Komponen lain memakai isi `bgMute`/token tekan (spesifikasi bagian 4: jangan opacity). Ganti ke `colors.bgMute` agar seragam.

**G6. Ikon "Pinjaman" berbeda antar tempat dan salah arti. [K] [S] [optional]**
- Menu memakai `swap-horizontal-outline`; Beranda dan HistoryRow memakai `arrow-redo-outline`. Di HistoryRow `swap-horizontal-outline` justru ikon Pindah saldo. Samakan Menu ke `arrow-redo-outline`.

**G7. Satu tujuan, tiga nama: "Iuran", "Catat pembayaran", "Pembayaran". [K] [S] [worth-it, perlu keputusan kata]**
- Masalah: Beranda: tombol utama "Catat pembayaran" dan ubin "Iuran" membuka layar yang sama. Jadwal: tombol "Pembayaran". Header layar tujuan: "Pembayaran". Layar form: "Catat pembayaran". Hal serupa untuk "Bayar tuan rumah" (tombol, baris, ubin, pengingat; ini sama kata, bagus).
- Usul: samakan dengan glosarium `docs/specs/ui-language-review.md` bagian 2. Saya tidak memeriksa isi glosarium itu dalam audit ini. Developer/PM cek kata final, lalu ubin "Iuran" dan tombol Jadwal mengikutinya. Perubahan kata = keputusan pemilik bila glosarium belum memutuskan.

**G8. Catatan font besar (prioritas rendah). [A] [S] [optional]**
- Acuan hanya font normal, jadi ini catatan saja. Tempat yang jelas rapuh bila font sistem dibesarkan: `Menu` baris `height: 56` (pakai `minHeight`), `AmountKeypad` tombol `height: 56` dengan angka 22sp, tab bar `height: 64` dengan label 14sp tanpa `tabBarAllowFontScaling`/batas, `Button`, `ListRow`, `HistoryRow`, `SectionHeader` tanpa `maxFontSizeMultiplier`. Sudah baik: `Money`, `Chip`, `Badge`, `PillLink`, `QuickAction`, `AmountDisplay`, dan Beranda menumpuk "Bulan ini" pada `fontScale >= 1.4`.

**G9. Spesifikasi desain tertinggal dari kode. [K] [S] [optional, dokumen]**
- `design-system-spec.md`: biru tinta, Roboto, Chip terpilih = tint + garis, `caption` 13. Kode: teal dua token (`brand` aksen, `brandStrong` teks/tombol), Inter, Chip terpilih = isi teal + teks gelap, tanpa `caption`. Beri catatan "digantikan oleh PROJECT.md keputusan 25 dan `theme.ts`" di kepala berkas, agar developer berikutnya tidak mengikuti yang lama.

**G10. Mata "sembunyikan saldo" hanya berlaku di Beranda. [U] [S] [optional, keputusan pemilik]**
- Beranda menyembunyikan Total kas, Tunai, Debit, pil, dan "Bulan ini". Catat kas (`kas/index.tsx`), Laporan, dan Riwayat menampilkan saldo dan jumlah apa adanya. Bila tujuannya privasi di depan orang lain, tombol mata memberi rasa aman palsu. Keputusan pemilik: cukup di Beranda (komentar kode menyebut itu memang disengaja) atau diperluas.

**G11. Pemisah " - " (tanda hubung) di teks kedua. [E] [S] [optional, kata]**
- "Dedi - Masuk ke Tunai", "Pertemuan 1 - 17 Nov 2026", "Aktif - 5 anggota - mulai ...". Dengan Inter tampak cukup, tetapi pada baris pertama Jadwal pemisah jatuh di akhir baris ("Pertemuan 1 -" lalu tanggal di baris berikut, lihat tangkapan lama). Alternatif: titik tengah "·". Ini perubahan format kata; hanya bila pemilik setuju.

---

## 2. Beranda

**B1. Keadaan ditekan blok "Bulan ini" rapat ke teks (kasus b). [E] [S] [do-first]**
- Masalah: `(tabs)/index.tsx` `monthBlock` hanya `paddingVertical: xs`, tanpa padding horizontal; saat ditekan (`monthPressed`, `bgMute`, baris 492) isi abu menempel ke "Bulan ini", "Pemasukan", "+Rp295.000" (terlihat di a09e7f9c). Masalah yang sama ada di `HistoryRow flat` (`paddingHorizontal: 0`) pada baris Riwayat dan baris "Terakhir" Beranda: saat ditekan, isi abu menempel ke tepi jumlah (terlihat di 09f55f27).
- Mengapa: area tekan tanpa napas terlihat patah dan murah.
- Usul: beri blok padding sendiri tanpa menggeser teks: `marginHorizontal: -spacing.md`, `paddingHorizontal: spacing.md`, `paddingVertical: spacing.sm`, `borderRadius: radius.md` (padding Card 16 menampung selisih 12; sisa 4dp dari tepi kartu). Terapkan sama di `HistoryRow` mode `flat` (baris ada di dalam kartu ber-padding `lg`, jadi aman). Alternatif lebih ringan: `android_ripple` pada Pressable. Cek HP pada kartu Beranda dan satu kartu hari di Riwayat. Tambah kasus tekan-tahan di galeri (Gl1).

**B2. Aksi utama minggu ini baru muncul setelah satu layar penuh. [U] [M] [worth-it, keputusan urutan]**
- Masalah: urutan: kartu kas, Pengingat, kartu pertemuan (satu-satunya tombol primer, "Catat pembayaran"), grid. Pada layar pertama (a09e7f9c) tidak ada tombol primer. Kartu kas membawa dua tombol outline ("Pindah saldo", "Catat kas") yang bersaing dengan angka utama, dan "Catat kas" juga ada sebagai ubin grid.
- Usul (butuh keputusan pemilik): (a) urutan kartu pertemuan sebelum Pengingat, atau Pengingat hanya yang mendesak (`urgent`) di atas, sisanya di bawah; (b) buang tombol "Catat kas" dari kartu kas (ubin grid sudah ada), sisakan "Pindah saldo" atau ganti dengan satu tombol ikon. Tidak ada aturan bisnis berubah.

**B3. Dua pil "Piutang" dan "Titipan" turun berbaris tidak rata. [E] [S] [worth-it]**
- Masalah: pil `flexWrap` dengan lebar isi masing-masing; hasilnya dua baris rata kiri dengan lebar berbeda (a09e7f9c). Warnanya sama dengan tombol tertiary pada Pengingat, jadi "tautan" dan "tombol" tampak sama.
- Usul: dua baris selebar penuh (`alignSelf: 'stretch'`), label kiri, jumlah + panah kanan (`justifyContent: 'space-between'`); lebar sama, jumlah rata kanan sehingga bisa dibandingkan.

**B4. Garis pemisah Pengingat menempel tanpa jarak. [E] [S] [do-first]**
- Masalah: di `(tabs)/index.tsx` garis `divider` berada di dalam `View` tanpa padding; terlihat garis menempel di bawah tombol "Akhiri periode" dan ikon "Cadangan terakhir" langsung di bawahnya (a09e7f9c).
- Usul: bungkus tiap pengingat dengan `paddingVertical: spacing.md`, atau `divider` diberi `marginVertical: spacing.md`. Spasi `md` di atas dan bawah garis.

**B5. "Akhiri periode" tampil dua kali dan gayanya beda antar layar. [K] [S] [worth-it, keputusan pemilik]**
- Masalah: saat semua pertemuan tertutup, Beranda menampilkan pengingat "Semua pertemuan sudah ditutup" dengan tombol tertiary "Akhiri periode", lalu kartu periode dengan tombol primer solid "Akhiri periode" ke layar yang sama. Di Jadwal tombol yang sama `dangerOutline`; "Tutup pertemuan" di Beranda berupa baris teks merah, di Jadwal tombol `dangerOutline`.
- Usul: satu tombol per tujuan di satu layar (hapus salah satu: pengingat `close_period` saat kartu periode memperlihatkan tombolnya). Gaya: keputusan pemilik. Mengakhiri periode adalah langkah wajar berikutnya (primer wajar) dan layar tujuan sudah menjelaskan akibatnya; di sisi lain tidak bisa dibatalkan (merah di Jadwal). Pilih satu dan samakan.

**B6. Baris aksi kartu pertemuan tanpa panah, "Tutup pertemuan" menempel di "Ubah". [U] [S] [worth-it]**
- Masalah: tiga `ListRow alt` bertumpuk berjarak 8dp ("Bayar tuan rumah", "Ubah tuan rumah / tanggal", "Tutup pertemuan 4", yang terakhir merah). Tidak ada tanda dapat diketuk. Aksi yang tidak bisa dibatalkan terlalu dekat ke aksi biasa.
- Usul: panah (G4); beri jarak `lg` atau garis pemisah sebelum "Tutup pertemuan". Dialog konfirmasi sudah ada.

**B7. Daftar "Langkah awal" memakai karakter ✓ dan ○. [A] [S] [optional]**
- Pembaca layar bisa membaca "check mark" atau "white circle". Beri `accessibilityLabel` per baris: "Selesai: ...", "Belum: ...". Kata baru "Selesai/Belum" kecil; sebutkan ke PM.

**B8. Satu aksi lewat 3-4 jalan. [U] [M] [optional]**
- "Catat pembayaran" (tombol), "Iuran" (ubin); "Bayar tuan rumah" (baris, ubin, pengingat); "Catat kas" (tombol kartu, ubin, Menu). Grid delapan ubin berbagi layar dengan Menu ("Lihat semua"). Bila ingin menyederhanakan: ubin hanya yang tidak ada di tempat lain. Opsional; bukan salah, tetapi menambah bacaan.

---

## 3. Riwayat (dan layar Filter)

**R1. Lingkaran ikon hilang dan lencana "Dikoreksi" tidak berbentuk pada baris dikoreksi (kasus c). [E] [S] [do-first]**
- Masalah: `HistoryRow` memberi lingkaran ikon arah keluar `errorTint` (`DIRECTION_ICON.out.circle`), sama dengan latar baris dikoreksi (`errorTint`). Ikon rumah tampak melayang tanpa lingkaran (terlihat 3c6556af, baris "Pembayaran tuan rumah" dikoreksi). Lingkaran arah masuk (`moneyInTint`) masih terlihat samar. Akar yang sama: `Badge tone="error"` memakai latar `errorTint`, jadi "Dikoreksi" tampil sebagai teks merah bergeser 8dp dari judul tanpa pil.
- Usul: pada baris dikoreksi, lingkaran ikon `bgCard` (putih) dan lencana latar `bgCard` dengan teks `error`. Warna ikon tetap menurut arah. Terapkan di varian flat dan non-flat (`rowCorrected` = `errorTint` + garis `error`). Tambah kasus dikoreksi arah keluar dan masuk di galeri (Gl1). Judul tercoret + kata "Dikoreksi" tetap penanda utama (tidak hanya warna).

**R2. Tombol "Filter" sendirian di bawah chip (kasus d). [U] [S] [do-first]**
- Masalah: `riwayat.tsx` `filterRow` menaruh "Filter" (dan "Hapus filter") di baris sendiri di bawah chip yang bisa digulir. Tombol memakai gaya outline besar dan terpisah dari kelompok yang ia ubah; chip dan Filter terlihat dua kontrol tak berhubungan (terlihat 09f55f27).
- Usul: satu baris kontrol. "Filter (n)" di kiri, tetap (tidak ikut gulir), dengan ikon `options-outline`, tinggi 48, lalu chip jenis bergulir di sebelah kanan. Hanya saat filter aktif, satu baris tipis di bawahnya: "Filter aktif (n)" di kiri dan tautan "Hapus filter" di kanan (tinggi sentuh 48, gaya `SectionHeader` action). Teks "Hapus filter" sudah ada; tidak ada kata baru kecuali "Filter aktif" (atau pakai teks catatan yang sudah ada di kartu ringkasan: "Ringkasan memuat semua catatan bulan ini. Daftar di bawah sedang difilter.").

**R3. Chip terpotong di tepi layar dan labelnya bisa pecah dua baris. [E] [S] [worth-it]**
- Masalah: `ScrollView` horizontal berada di kontainer ber-padding `lg`, jadi chip terpotong di garis padding, bukan di tepi layar ("Semua" setengah terlihat di 09f55f27). Label "Tuan rumah" dan "Pindah saldo" pecah dua baris dalam chip (tangkapan lama, sebelum Inter; belum dikonfirmasi dengan Inter).
- Usul: `marginHorizontal: -spacing.lg` pada ScrollView dan `paddingHorizontal: spacing.lg` pada `contentContainerStyle`, sehingga chip meluncur sampai tepi layar. `numberOfLines={1}` pada label `Chip`. Cek HP: label dengan Inter.

**R4. Catatan panjang ringkasan mendorong daftar ke bawah. [U] [S] [worth-it]**
- Masalah: kontrol (bulan, kartu ringkasan, empat baris catatan, chip, Filter) memakai lebih dari separuh layar sebelum baris pertama (daftar mulai sekitar 54% tinggi layar di 09f55f27). Catatan "Ringkasan ini menghitung..." muncul tetap setiap kali.
- Usul: tampilkan satu baris ringkas ("Tidak termasuk pindah saldo, pinjaman, dan catatan dikoreksi.") dengan tautan "Selengkapnya" yang membuka teks penuh, atau pindahkan teks penuh ke "Istilah" dan beri ikon info 48dp. Teks disetujui pemilik; hanya penempatannya yang diusulkan berubah. Catatan filter tetap.

**R5. Baris riwayat tanpa label pembaca layar yang disusun. [A] [M] [worth-it]**
- Masalah: `HistoryRow` adalah `Pressable role=button` tanpa `accessibilityLabel`; TalkBack menggabung anak: judul, "Dedi - Masuk ke Tunai", "+Rp50.000", "Dikoreksi". Ikon Ionicons adalah teks glyph dan bisa terbaca aneh atau diam (belum diuji). Tanda +/- terbaca tergantung mesin.
- Usul: label tersusun: "{judul}, {anggota}, {Masuk ke / Keluar dari pos}, {jumlah dalam kata: masuk Rp50.000 atau keluar Rp50.000}, dikoreksi bila ada". Ikon `importantForAccessibility="no"`. Pakai juga untuk "Terakhir" di Beranda. Cek HP dengan TalkBack.

**R6. Layar Filter beda kulit dan tanpa jarak aman bawah. [K] [S] [optional]**
- `filter-riwayat.tsx` memakai latar `bgCard` (putih) sedangkan semua layar lain `bgPage`; footer tanpa `useSafeAreaInsets` (kas/new dan pay memakainya). Ringkasan pilihan aktif tidak terlihat di atas. Usul: `bgPage`, padding bawah `max(insets.bottom, lg)`. Cek HP dengan navigasi gestur.

---

## 4. Periode > Jadwal

**J1. Status pertemuan berupa kata berwarna, padahal ada komponen `Badge`. [K] [S] [worth-it]**
- Masalah: "Terbuka" (teal `brandStrong`, tampak seperti tautan) dan "Ditutup" (abu) berupa teks biasa; "Pembayaran tuan rumah: sudah dibayar" teks abu panjang. Di tempat lain status memakai `Badge` (Dikoreksi, Berlaku).
- Usul: baris judul "Pertemuan N - tanggal" (teks tebal) dengan `Badge` di bawahnya atau di kanan: Terbuka (`brand`), Ditutup (`neutral`), "Tuan rumah dibayar" (`ok`). Kata mengikuti yang sudah ada.

**J2. Pertemuan yang berjalan tidak dibedakan. [U] [S] [worth-it]**
- Masalah: semua kartu putih identik; aturan "yang ditutup selalu yang paling awal terbuka" tidak terlihat di daftar. Dengan 10-12 pertemuan, pengguna harus mencari.
- Usul: pertemuan berjalan (`oldestOpen`) dapat garis kiri 4dp `brand` atau `Badge brand` "Pertemuan berjalan" (kata sudah dipakai di hint Laporan). Daftar bisa langsung digulir ke sana saat dibuka.

**J3. Dua kartu aksi dengan hint panjang mendahului jadwal; "Akhiri periode" di dasar. [U] [M] [worth-it]**
- Masalah: urutan: judul, tombol primer "Pembayaran", kartu "Tutup pertemuan" (hint empat baris + tombol), baru "Jadwal". Isi utama layar (jadwal) turun. Kartu "Akhiri periode" ada setelah daftar panjang.
- Usul: judul, meta, "Pembayaran" (tetap primer), "Jadwal" langsung, lalu kartu aksi. Hint panjang dibuat lipat ("Aturan penutupan" + panah) atau diringkas satu baris dengan teks penuh di dialog konfirmasi yang sudah ada. Jangan hapus kata; ubah penempatan.

**J4. Tombol selebar penuh diulang per pertemuan. [U] [M] [worth-it]**
- Masalah: tiap pertemuan yang sudah dibayar memiliki tombol outline selebar penuh "Lihat pembayaran tuan rumah" (tangkapan 8:56, tiga kartu berturut-turut ± 590px tinggi masing-masing); pertemuan aktif bisa memiliki dua tombol bertumpuk, "Bayar tuan rumah" sebagai primer solid di tiap baris yang memenuhi syarat. Aturan "satu primer per area" dilanggar dan gulir menjadi panjang.
- Usul: pertemuan ditutup dan dibayar: seluruh kartu dapat diketuk (panah) menuju layar pembayaran tuan rumah, tanpa tombol. Tombol hanya di pertemuan yang butuh aksi: "Tentukan"/"Ubah" sekunder dan "Bayar tuan rumah" primer di satu pertemuan berjalan. Pertemuan lain: sekunder bila perlu.

**J5. Baris teks dalam kartu pertemuan tanpa jarak. [E] [S] [worth-it]**
- Masalah: `View` pembungkus teks tidak punya `gap` (judul, tuan rumah, status, catatan menempel hanya dengan tinggi baris); spesifikasi: judul ke baris kedua `xs` (4). Padding kartu `md` sementara kartu lain `lg`.
- Usul: `gap: spacing.xs` pada View teks; kartu `padding: spacing.lg`.

**J6. Ringkasan periode satu baris panjang. [E] [S] [optional]**
- "Aktif - 5 anggota - mulai 17 Nov 2026" sebagai teks isi biasa. Usul: `Badge ok` "Aktif" lalu teks `secondary`; tinggi satu baris tetap.

---

## 5. Pembayaran (`periods/[id]/pay.tsx`)

Layar ini paling matang: tombol dinonaktifkan dengan alasan, keypad 56dp, label TalkBack ("Angka 5", "Tiga nol", aksi "Hapus semua"), jarak aman bawah, chip terpilih sesuai jumlah. Dua catatan.

**P1. Tanggal di atas jumlah; layar kecil. [U] [S] [optional]**
- Tanggal (hampir selalu hari ini) mendahului jumlah, yang merupakan tugas utama. Pada HP 360x640 isi (judul, nama, tanggal, jumlah, chip, hint) + keypad + tombol bisa memaksa menggulir. Usul: jumlah dan chip di atas, tanggal di bawah chip sebagai baris ringkas "Tanggal bayar: hari ini [Ubah]". Cek HP kecil sebelum memutuskan.

**P2. Dua pesan untuk satu masalah, dan "Terbaca" mengulang angka besar. [U] [S] [optional]**
- Saat jumlah bukan kelipatan, muncul pesan merah di bawah jumlah dan alasan di bawah tombol ("Ubah jumlah jadi kelipatan Rp15.000.") berdekatan. Baris "Terbaca: Rp45.000" mengulang angka hero. Usul: sisakan satu pesan (alasan di bawah tombol), hapus "Terbaca" saat valid. Kata sudah disetujui; hanya satu yang ditampilkan.

---

## 6. Catat kas (`kas/index.tsx`, `kas/new.tsx`)

**C1. Jumlah yang diketik tergulir keluar layar saat memilih anggota (pinjaman, pelunasan, saldo awal Piutang). [U] [M] [do-first]**
- Masalah: urutan `kas/new`: bantuan, tanggal, daftar anggota (satu `OptionRow` 56dp per anggota), jumlah. Keypad tetap menempel di bawah, tetapi `AmountDisplay` ada di `ScrollView`. Dengan 8-10 anggota, jumlah berada jauh di bawah; pengguna mengetuk angka tanpa melihat hasilnya. Pada `pay.tsx` tidak terjadi.
- Usul: pindahkan `AmountDisplay` + baris bantuan jumlah ke blok bawah (`bottom`), tepat di atas keypad, sehingga jumlah selalu terlihat saat mengetik; atau tempatkan jumlah sebelum daftar anggota. Pilih yang pertama (satu layar, satu jawaban). Saat keyboard sistem terbuka (catatan), blok ini tetap bisa disembunyikan seperti keypad. Uang/data: hanya tampilan jumlah yang diketik; logika `parseRupiahInput` dan `checkRepaymentAmount` tidak berubah.

**C2. Dua pilihan arah memakai ikon yang sama. [A] [S] [worth-it]**
- `IconChoice` "Tunai ke Debit" dan "Debit ke Tunai" sama-sama `arrow-forward-outline`. Pengguna melihat dua ikon identik; hanya teks yang membedakan. Usul: kedua ikon bergeser: `arrow-forward-outline` dan `arrow-back-outline`, atau kartu bergambar pasangan ikon `cash-outline` -> `card-outline`. Label TalkBack sudah ada.

**C3. Layar pilih jenis: lima tombol outline setara, kartu saldo di atas. [U] [S] [optional]**
- Tidak ada aksi utama; wajar karena tugasnya memilih. Namun lima tombol kosong dengan hint di bawahnya terlihat seperti form. Usul: baris navigasi (ListRow ikon + panah, G4) dengan hint sebagai baris kedua. Kartu saldo mengulang Beranda; ringkas hint panjangnya ("Saldo dihitung dari ...").

**C4. Paragraf bantuan panjang mendahului form. [U] [S] [optional]**
- `HELP.opening_balance` sekitar empat baris di atas semua kolom. Usul: dua baris pertama saja dan sisanya lipat, atau pindah ke bawah kolom yang relevan (pos). Teks tetap.

---

## 7. Laporan

**L1. Total kas tidak menonjol. [U] [S] [optional]**
- "Saldo kas" adalah empat `ReportLine` setara; "Total kas" (hasil) hanya `heading` 18 di dasar daftar. Usul: tampilkan Total kas sebagai `display` 28 di atas kartu (seperti `kas/index`), baris pos di bawahnya. Angka sama; hanya tampilan.

**L2. Periode yang sama muncul dua kali. [U] [S] [worth-it]**
- Tombol primer "Buka {periode}" dan baris di bawahnya berisi periode yang sama. Dan baris `alt` tanpa panah (G4). Usul: hapus tombol primer dan jadikan daftar saja, periode pilihan pertama diberi `Badge brand` atau urutan teratas; atau hapus periode itu dari daftar. Jangan keduanya.

**L3. Laporan per periode di dasar tab Laporan. [U] [S] [optional, keputusan]**
- Tujuan tab "Laporan" (membuka laporan periode) ada setelah tiga kartu saldo yang juga ada di Beranda. Usul: "Laporan per periode" di atas, saldo di bawah, atau tetap. Keputusan pemilik; jarak bagian lihat G3.

---

## 8. Menu

**M1. Tinggi baris tetap dan keadaan tekan opacity. [A] [S] [optional]**
- `menu.tsx` `height: ROW_HEIGHT (56)` ganti `minHeight`; tekan `bgDisabled` bukan opacity (G5).

**M2. Lima kelompok untuk delapan baris. [E] [S] [optional]**
- "Kas", "Data", "Bantuan" masing-masing satu baris dengan judul kelompok; judul menambah bacaan. Usul: Kelompok (5 baris), "Kas dan data" (Catat kas, Cadangan dan ekspor), "Bantuan" (Istilah). Kata judul "Kas dan data" baru; kecuali pemilik keberatan.

**M3. Peringatan cadangan hanya titik merah. [A] [S] [worth-it]**
- Spesifikasi bagian 5 meminta kata "Terlambat" di baris juga; kode hanya `Dot` dengan label TalkBack. Pengguna melihat titik tanpa tahu artinya. Usul: teks `secondary` `error` "Terlambat" di kanan label sebelum panah. Kata sudah ada di glosarium spesifikasi. Warna + kata.

---

## 9. Cadangan dan ekspor

**Bk1. Peringatan yang sama muncul dua sampai tiga kali. [U] [S] [worth-it]**
- Masalah: kartu Cadangan: kalimat terakhir bagikan, Notice kuning "Berisi nama dan uang anggota. Kirim ke diri sendiri...", paragraf "Simpan satu salinan di luar HP ini...", tombol, keterangan "Cadangan tidak dikunci...". Lalu dialog konfirmasi mengulang `BACKUP_WARNING`, `OFFSITE_HINT`, `NO_ENCRYPTION_HINT`. Terbaca dua kali sebelum tombol bisa dipakai.
- Usul: di layar, satu Notice peringatan + tombol; `OFFSITE_HINT` dan `NO_ENCRYPTION_HINT` hanya di dialog (pengguna yang menekan tombol memang membacanya). Teks disetujui pemilik; usulan hanya kurangi pengulangan. Keputusan pemilik.

**Bk2. Lima tombol CSV identik dengan hint panjang. [K] [M] [optional]**
- Lima tombol outline selebar penuh masing-masing dengan satu-dua keterangan (Buku kas: lima baris, terlihat di c4265fde). Usul: baris navigasi (G4) dengan ikon `share-outline`, judul + hint satu baris; detail "Masuk/Keluar/Tanpa perubahan kas" di bawah Buku kas, ringkas atau lipat.

**Bk3. Umpan balik "sedang bekerja" bisa di luar layar. [U] [S] [worth-it]**
- Notice "Membuat cadangan..."/"Menyiapkan berkas..." ditaruh paling atas `ScrollView`; saat pengguna menekan tombol CSV di bawah, Notice itu di luar layar dan tombol hanya menjadi abu. Usul: Notice melekat (di luar `ScrollView`, di atas), atau `Loading` modal ringan, atau `loading` pada tombol yang ditekan (komponen `Button` sudah punya `loading`).

---

## 10. Pulihkan data

**Rs1. Tombol bahaya nonaktif tanpa alasan. [U] [S] [worth-it]**
- `restore.tsx` review: `Button variant="danger" disabled={!ready}` tanpa `disabledReason`, bertentangan dengan aturan "tombol nonaktif punya alasan". Alasan ada di teks petunjuk di atas kolom, tetapi bukan di bawah tombol. Usul: `disabledReason` = teks yang meminta mengetik frasa (mis. "Ketik {frasa} dulu." gunakan `phraseInstruction` yang ada, atau kalimat pendek baru). Kata baru kecil.

**Rs2. Dua kartu ringkasan bertumpuk sulit dibandingkan. [U] [M] [worth-it]**
- Masalah: "Di HP ini sekarang" dan "Isi cadangan" ditumpuk; pengguna harus membandingkan angka jumlah anggota, periode, catatan antara dua kartu yang terpisah jarak (keputusan yang menghapus semua data). Angka bukan `tabular`.
- Usul: satu kartu, satu baris per butir: label di atas, dua nilai berdampingan ("Di HP ini" / "Di cadangan") dengan tajuk kolom di atas dan `TABULAR`. Angka tidak berubah. Cek HP pada 360dp.

**Rs3. Tombol bahaya dan "Batal" berdekatan. [U] [S] [optional]**
- Tombol bahaya (merah penuh) dan "Batal" (sekunder) bertumpuk dengan jarak 16. Usul: jarak `xl` di antaranya agar salah ketuk lebih kecil; dua dialog konfirmasi masih ada.

---

## 11. Anggota

**Ag1. Kolom ubah nama tanpa label. [A] [S] [do-first]**
- `members/index.tsx`: `TextField` mode ubah tanpa `label` dan tanpa `placeholder`; `TextField` memberi `accessibilityLabel={label}`, jadi TalkBack mengumumkan "kolom edit" tanpa nama. Usul: `label="Nama anggota"` (teks sudah dipakai sebagai placeholder di form tambah) atau minimal `accessibilityLabel`.

**Ag2. Cara mengubah/menghapus tersembunyi dan aksi hapus menempel. [U] [S] [worth-it]**
- Masalah: ketuk nama membuka form ubah, tanpa panah atau ikon pensil; petunjuknya di atas daftar. Pada mode ubah, "Hapus anggota"/"Arsipkan anggota" (outline merah) langsung di bawah Simpan/Batal berjarak 8dp.
- Usul: ikon `create-outline` atau panah di kanan baris (G4); pada mode ubah, beri garis pemisah dan jarak `xl` sebelum aksi merah. Dialog konfirmasi sudah ada.

**Ag3. Bentuk baris berubah saat mode ubah. [E] [S] [optional]**
- `editRow` memakai `radius.sm` (8) sedangkan `ListRow` `radius.md` (12); baris melompat bentuk. Samakan ke `md`.

---

## 12. Galeri komponen (`src/app/dev`, `src/ui/gallery`)

**Gl1. Galeri belum menutup tiga kasus yang baru ditemukan. [K] [S] [worth-it]**
- Sudah baik: HistoryRow dikoreksi dan flat ada (`SectionB`), Money punya angka negatif dan nol, teks panjang T1-T8. Kurang: (1) tanda +, −, tanpa tanda berdampingan pada empat ukuran (G2); (2) baris dikoreksi arah keluar dan arah masuk, varian flat dan non-flat, dengan lencana (R1); (3) keadaan tekan untuk baris flat dan blok "Bulan ini" (B1), misalnya prop `forcePressed` khusus galeri atau pembungkus; (4) kontrol filter satu baris (R2). Judul grup A-F sama gaya dengan judul komponen (`titleM` keduanya); beri grup `titleL`. Hanya dev.

---

## 13. Peringkat semua temuan

53 temuan. Pembagian: **do-first 8**, **worth-it 24**, **optional 21**.

### Do-first (kecil, dampak langsung, terlihat di tangkapan layar atau menyangkut akses)
1. G1 judul header hilang (U, S)
2. G2 tanda minus terlepas (E, S)
3. R2 tombol Filter sendirian (U, S)
4. R1 lingkaran ikon dan lencana hilang pada baris dikoreksi (E, S)
5. C1 jumlah tergulir keluar layar di Catat kas dengan daftar anggota (U, M)
6. B1 tekan blok "Bulan ini" dan baris flat rapat (E, S)
7. B4 garis Pengingat tanpa jarak (E, S)
8. Ag1 kolom ubah nama tanpa label (A, S)

### Worth-it
G3, G4, G7, B2, B3, B5, B6, R3, R4, R5, J1, J2, J3, J4, J5, C2, L2, M3, Bk1, Bk3, Rs1, Rs2, Ag2, Gl1.

### Optional
G5, G6, G8, G9, G10, G11, B7, B8, R6, J6, P1, P2, C3, C4, L1, L3, M1, M2, Bk2, Rs3, Ag3.

### Jumlah temuan per kriteria (kriteria utama tiap temuan)
| Kriteria | Jumlah | ID |
|---|---|---|
| Konsistensi (K) | 11 | G3, G4, G5, G6, G7, G9, B5, R6, J1, Bk2, Gl1 |
| Kegunaan (U) | 24 | G1, G10, B2, B6, B8, R2, R4, J2, J3, J4, P1, P2, C1, C3, C4, L1, L2, L3, Bk1, Bk3, Rs1, Rs2, Rs3, Ag2 |
| Aksesibilitas (A) | 7 | G8, B7, R5, C2, M1, M3, Ag1 |
| Estetika (E) | 11 | G2, G11, B1, B3, B4, R1, R3, J5, J6, M2, Ag3 |
| Total | 53 | |

### Lima do-first teratas
1. G1: hapus `headerTitle: 'Mas Catat'` dari `_layout.tsx` agar 23 judul layar yang sudah ditulis akhirnya tampil.
2. G2: ganti "-" di depan angka dengan "−" (U+2212) di `Money.tsx` supaya rapat dengan "Rp"; tambahkan label pembaca layar.
3. R2: pindahkan "Filter (n)" ke kiri baris yang sama dengan chip, "Hapus filter" jadi tautan hanya saat filter aktif.
4. R1: pada baris dikoreksi beri lingkaran ikon dan lencana latar putih agar tidak lebur dengan latar `errorTint`.
5. C1: pindahkan tampilan jumlah ke blok bawah tepat di atas keypad di Catat kas supaya terlihat saat memilih anggota.

---

## 14. Keputusan untuk pemilik

STATUS: DIJAWAB (2026-11-13). Jawaban pemilik tercatat di `PROJECT.md` keputusan 27; spesifikasi bangun di `docs/specs/design-decisions-2026-11-13.md`. Ringkasan per butir:
1. B2: urutan Beranda tetap. Tombol "Catat kas" dibuang dari kartu kas (ubin grid tetap). Kartu kas juga berubah: mata di samping angka Total kas, hanya "Rp" yang lebih kecil, satu pil "Pengeluaran" menggantikan "Bulan ini", pil Piutang dan Titipan dihapus.
2. B5: "Akhiri periode" merah outline, sekali per layar. Beranda mempertahankan tombol di kartu periode; baris Pengingat `close_period` disaring. Tombol akhir di layar close tetap merah penuh sampai pemilik konfirmasi (terbuka, A4).
3. G7: satu nama "Pembayaran" (ubin dan tombol Beranda). Form anggota tetap "Catat pembayaran".
4. G10: mata hanya di Beranda, tidak berubah.
5. Bk1 dan R4: aturan satu peringatan per layar; rincian di dialog atau "Selengkapnya". Teks yang sudah disetujui hanya berpindah tempat.
6. L3: urutan tab Laporan tetap.
7. Kata kecil disetujui: "Terlambat", alasan tombol Pulihkan, "Selesai/Belum" untuk pembaca layar, pemisah "·", "Filter aktif (n)", "Selengkapnya", baris pendek R4, label pil "Pengeluaran". ("Nama anggota" sudah disetujui sebelumnya.)
Masih terbuka untuk pemilik: A1 sampai A8 di `PROJECT.md` keputusan 27 dan bagian 8 spesifikasi designer.

Teks pertanyaan asli:

1. B2: urutan Beranda. Kartu pertemuan (aksi utama) sebelum Pengingat, atau Pengingat mendesak saja di atas? Tombol "Catat kas" di kartu kas dibuang karena ada ubin grid?
2. B5: "Akhiri periode" primer teal (Beranda) atau merah outline (Jadwal)? Pilih satu dan hapus duplikatnya di Beranda.
3. G7: nama tujuan tunggal untuk layar pembayaran ("Iuran", "Catat pembayaran", atau "Pembayaran"); ikuti glosarium bila sudah memutuskan.
4. G10: tombol mata menyembunyikan saldo hanya di Beranda, atau juga Catat kas, Laporan, Riwayat?
5. Bk1 dan R4: mengurangi pengulangan peringatan dan catatan (teks tidak berubah, hanya penempatan).
6. L3: urutan tab Laporan (laporan per periode di atas atau saldo di atas).
7. Teks baru kecil yang butuh persetujuan kata: "Terlambat" di Menu (M3), "Nama anggota" (Ag1), alasan tombol Pulihkan (Rs1), "Selesai/Belum" untuk pembaca layar (B7), pemisah "·" (G11).

## 15. Yang harus dicek pemilik di HP

- G2: tanda minus setelah perubahan, pada empat ukuran.
- B1: area tekan baru pada kartu Beranda dan satu kartu hari di Riwayat.
- R3: label chip dengan Inter tidak pecah dua baris.
- R5, G2: pembacaan TalkBack untuk baris riwayat dan "minus/plus".
- G1: judul header panjang tidak terpotong.
- P1, Rs2: HP layar kecil (360dp) bila pemilik punya.
- R6: jarak bawah layar Filter dengan navigasi gestur.
