# Spesifikasi: pencarian anggota (SearchField)

Status: spesifikasi, belum dibangun, belum dilihat di perangkat. Dibuat 2026-11-13 atas permintaan pemilik ("tambahkan fitur search pada pembayaran juga untuk mencari anggota, bila ada saran lain gunakan masa user harus mencari anggota"). Hanya UI. Tidak ada perubahan di `src/domain`, `src/db`, migrasi, CSV, atau aturan uang. Tidak ada dependensi baru.

Brief dicocokkan dengan `CLAUDE.md`, `AGENTS.md`, dan PROJECT.md (keputusan 26-30, log terbaru). Tidak ada pertentangan. Catatan: C1 (nominal di atas keypad) sudah ada di `kas/new.tsx` dan `pay.tsx`; konfliknya dibahas di bagian 5.

## 1. Masalah

Dengan sekitar 19 anggota, daftar anggota memanjang lebih dari satu layar di banyak tempat. Saat ini tidak ada satu pun kolom cari di aplikasi (dicek dengan pencarian kode). Pengguna menggulir dan membaca satu per satu. Yang paling sering: Pembayaran (mencatat iuran saat pertemuan, ketika anggota menyebut namanya sambil menyerahkan uang).

## 2. Keputusan umum

1. Satu aturan kapan kolom cari muncul: bila daftar yang sedang ditampilkan di layar itu berisi lebih dari 8 anggota (konstanta `MEMBER_SEARCH_MIN = 8`, fungsi `shouldShowMemberSearch(count)`). Alasan: 8 baris setinggi 56-70 dp sudah memenuhi satu layar; mulai baris ke-9 pengguna harus menggulir. Grup kecil (di bawah 9) tidak melihat kolom yang tidak perlu. Jumlah dihitung dari daftar sebelum disaring, setelah aturan layar itu sendiri (misalnya arsip sudah dibuang).
2. Satu komponen `SearchField`, satu fungsi pencocok murni. Semua layar memakai keduanya. Tidak ada variasi per layar kecuali tempat (bagian 3).
3. Urutan daftar tidak berubah. Pencarian hanya menyembunyikan baris, tidak mengurutkan ulang (tidak ada "yang cocok di awal nama dulu", tidak ada "belum lunas dulu": urutan itu tidak ada sekarang, A-Z tetap).
4. Baris yang sedang dipilih atau sedang diubah tidak pernah disembunyikan oleh pencarian. Ia tetap tampil di posisinya yang biasa, walau tidak cocok. Alasan: pemilihan tidak boleh hilang dari pandangan sebelum menekan Lanjut/Simpan. Status pilihan (state layar) tidak disentuh oleh pencarian sama sekali.
5. Kata pencarian hanya state lokal layar (`useState('')`). Tidak disimpan di store, tidak masuk cadangan. Hilang saat layar ditutup (keluar dari layar). Bila layar lain ditumpuk di atasnya lalu kembali (misalnya Pembayaran, buka detail anggota, Back), kata pencarian tetap: pemilik bisa memastikan baris yang baru dibayar sudah berubah. Pemilik menghapusnya dengan satu ketukan pada tombol hapus.
6. Anggota arsip: setiap layar tetap memakai sumber daftar yang sekarang. Pencarian tidak menambah atau mengembalikan anggota arsip ke mana pun. Tempat yang sekarang menampilkan arsip tetap menampilkannya (Filter Riwayat memakai `members.list()` termasuk arsip; Laporan periode lama memuat anggota periodenya; `kas/new` saldo awal Piutang memakai `allMembers`). Tempat yang menyembunyikan arsip (Anggota: daftar aktif; periode baru: `listActive()`) tetap menyembunyikan.
7. Tidak ada fokus otomatis (`autoFocus`) di layar mana pun: papan ketik yang langsung muncul menutupi daftar dan swipe.

## 3. Keputusan per layar

Penting untuk developer: state kata pencarian dideklarasikan sebelum `return` dini (Loading/ErrorState), supaya urutan hook tetap. Penyaringan boleh dihitung setelah `return` dini (daftar kecil, tanpa `useMemo`).

Bila hasil penyaringan kosong tetapi daftar aslinya tidak kosong, jangan tampilkan `EmptyState`/teks "Belum ada ..." milik layar itu: yang tampil hanya teks status dari SearchField ("Tidak ada anggota yang cocok."). Ini berlaku di Pembayaran, Anggota, dan semua `ListEmptyComponent`.

| # | Layar (file) | Cari? | Tempat | Catatan |
|---|---|---|---|---|
| 1 | Pembayaran `src/app/periods/[id]/payments.tsx` | Ya, bila `balances.length > 8` | Tetap di atas, di luar FlatList | Layar utama; lihat 3.1 |
| 2 | Catat kas `src/app/kas/new.tsx` (pilihan Anggota) | Ya, bila `candidates.length > 8` | Di bawah label "Anggota", dalam ScrollView | Pinjaman baru dan Saldo awal Piutang bisa 19; Pelunasan biasanya sedikit (tidak tampil); lihat 3.2 |
| 3 | Anggota `src/app/members/index.tsx` | Ya, bila anggota aktif > 8 | Di bawah tombol Tambah dan judul "n anggota", di atas daftar | Dua kolom teks di satu layar; lihat 3.3 |
| 4 | Periode baru `src/app/periods/new.tsx` (Pilih anggota) | Ya, bila `members.length > 8` | Di antara tombol Pilih semua/Kosongkan dan daftar | Pilih semua/Kosongkan bekerja pada SEMUA anggota; lihat 3.4 |
| 5 | Pilih tuan rumah `src/app/periods/[id]/meetings/[number].tsx` | Ya, bila `eligible.length > 8` | Di bawah teks "Hanya anggota yang belum pernah jadi tuan rumah...", di atas daftar | Awal periode tampil (sampai 19), makin ke akhir hilang sendiri |
| 6 | Filter Riwayat `src/app/filter-riwayat.tsx` (Anggota) | Ya, bila `members.length > 8` | Di bawah judul "Anggota", di atas chip | Pilihan di `draft`; chip terpilih tetap tampil |
| 7 | Pinjaman `src/app/loans/index.tsx` | Ya, bila `open.length > 8` | Di header, di bawah kartu Piutang | Hanya daftar pinjaman terbuka. Baris "Kelebihan bayar" dan "Saldo awal tanpa nama" tidak disaring. Di data nyata mungkin tidak pernah tampil |
| 8 | Titipan `src/app/credits/index.tsx` | Ya, bila `items.length > 8` | Di bawah teks pengantar, di atas kartu | Kartu yang sedang dibuka formulirnya (`selected`) tidak disembunyikan. Di data nyata mungkin tidak pernah tampil |
| 9 | Laporan periode, "Per anggota" `src/app/reports/period/[id]/index.tsx` | Ya, bila `sortedMembers.length > 8` | Di bawah `SectionHeader` "Per anggota" | Tambah `keyboardShouldPersistTaps="handled"` pada ScrollView |
| 10 | Laporan pertemuan, "Status anggota" `src/app/reports/period/[id]/meetings/[number].tsx` | Ya, bila `meeting.members.length > 8` | Di bawah `SectionHeader` "Status anggota" | Sama seperti 9 |

Layar yang sengaja TANPA pencarian:

- Akhiri periode `periods/[id]/close.tsx` ("Per anggota"): layar tinjauan sebelum tindakan yang tidak bisa dibatalkan. Pemilik harus bisa melihat semua baris, tidak mencari satu. Hanya anggota menunggak atau bertitipan yang tampil, dan ringkasan di atas sudah memuat totalnya. Menyembunyikan baris di sini berisiko.
- Bayar `pay.tsx`, detail anggota `periods/[id]/members/[memberId].tsx`, Pinjaman anggota `loans/[memberId].tsx`, Bayar tuan rumah `payout.tsx`, laporan anggota: anggota sudah ditentukan, tidak ada pilihan.
- Beranda (deretan inisial "sudah bayar hari ini"): bukan daftar pilihan, hanya informasi.
- Riwayat (tab): isinya catatan, bukan anggota. Mencari anggota di Riwayat sudah ada lewat Filter (nomor 6). Pencarian catatan (nama, catatan teks) adalah fitur lain; tidak termasuk di sini.
- Periode (daftar periode), Laporan (tab), Menu, Cadangan: tidak ada daftar anggota.

### 3.1 Pembayaran (`payments.tsx`)

Susunan baru (sketsa teks):

```
[ ikon cari | Cari anggota                    (x) ]   <- tetap, tidak ikut menggulir
  3 dari 19 anggota                                      <- hanya saat kata tidak kosong
-----------------------------------------------------
  Periode 1                                              <- ListHeaderComponent (menggulir)
  Tunggakan dihitung sampai pertemuan 4.
  Sudah bayar hari ini: 5 dari 19
  Geser baris ke kanan ...
  [ Siti            Menunggak        Rp30.000 ]
  ...
```

- Bungkus: `<View style={{flex:1}}>` berisi `<View style={searchWrap}>` (SearchField) lalu FlatList. `searchWrap`: `paddingHorizontal: spacing.lg`, `paddingTop: spacing.md`, `paddingBottom: spacing.sm`, `backgroundColor: colors.bgPage`.
- Alasan tetap (tidak ikut menggulir): header daftar berisi judul dan tiga paragraf (kira-kira 200 dp); bila kolom cari ikut di dalamnya, pengguna yang sudah menggulir 19 baris harus kembali ke atas untuk mencari lagi.
- FlatList: tambah `keyboardShouldPersistTaps="handled"` (ketukan baris langsung bekerja walau papan ketik terbuka, tanpa ketukan pertama yang hanya menutup papan ketik) dan `keyboardDismissMode="on-drag"` (menggulir daftar menutup papan ketik, hasil di bawahnya terlihat).
- `data` = hasil penyaringan atas `sortedBalances` (urutan A-Z tetap). Nama dari `nameOf`.
- `ListEmptyComponent`: `EmptyState` "Belum ada anggota di periode ini" HANYA bila `balances.length === 0`; selain itu `null`.
- Angka di header ("Sudah bayar hari ini: 5 dari 19", `paidTodayCount`) tetap dihitung dari SEMUA anggota, tidak dari hasil. Teks status SearchField memakai pembilang "anggota" yang berbeda ("3 dari 19 anggota"), jadi tidak tertukar.
- Swipe bayar, kunci `paidTodayRef`, `reload()` tidak berubah. `reload()` tidak mengosongkan `data` (lihat `useLoad`), jadi SearchField tidak dibongkar-pasang dan fokus/kata tidak hilang setelah swipe.
- Setelah swipe: kata pencarian dan papan ketik dibiarkan seperti adanya.

### 3.2 Catat kas (`kas/new.tsx`)

- Kolom cari ada di dalam ScrollView, tepat di bawah label "Anggota" (atau "Anggota yang meminjam"), di atas daftar `OptionRow`.
- `candidates` tetap utuh (dipakai untuk `memberId`, `picked`, pratinjau). Yang disaring hanya baris yang digambar (`memberPicker`). Baris `memberId` terpilih ikut tampil walau tidak cocok.
- Memilih anggota (ketuk `OptionRow`): selain `setPickedId`, panggil `Keyboard.dismiss()`. Kata pencarian tidak dihapus, jadi pemilih melihat hasil yang sama. Ini penting karena blok bawah (nominal + keypad) disembunyikan selama papan ketik terlihat (state `keyboardVisible` yang sudah ada). Tanpa dismiss, keypad tetap hilang sesudah memilih anggota dan pengguna bingung.
- Konflik dengan C1 dan penyelesaiannya:
  - Fokus di kolom cari memicu `keyboardDidShow`, blok nominal dan keypad menghilang. Yang tersisa di blok bawah: Notice galat dan tombol Lanjut. Ini sengaja diterima: saat mencari anggota pengguna tidak mengetik nominal, dan daftar mendapat ruang lebih. Nominal yang sudah diketik tersimpan di state `amountText` dan muncul lagi saat papan ketik tertutup.
  - Penutupan papan ketik: Back Android (sekali) atau memilih anggota (`Keyboard.dismiss()`) atau menekan tombol cari di papan ketik.
  - Tidak ada perubahan pada `AmountKeypad`, `AmountDisplay`, `block`, `buildInput`, atau pratinjau.
- Layar Pelunasan tanpa pinjaman dan layar tanpa periode mengembalikan awal sebelum daftar; tidak ada perubahan.

### 3.3 Anggota (`members/index.tsx`)

- Dua kolom teks di layar yang sama (Tambah anggota dan Cari anggota) rawan tertukar. Pembeda: Tambah punya label "Tambah anggota" dan tombol "Tambah" langsung di bawahnya; Cari punya ikon kaca pembesar, placeholder "Cari anggota", dan baru muncul di bawah judul bagian "n anggota". Jangan tempatkan Cari di atas Tambah.
- Urutan header: TextField "Tambah anggota", tombol Tambah, `Section` "n anggota" (judul tetap jumlah total) berisi petunjuk, lalu SearchField (hanya bila anggota aktif > 8).
- `data` = anggota aktif yang disaring. Baris yang sedang diubah (`editingId`) tidak disembunyikan.
- Daftar arsip (bila dibuka dengan "Tampilkan yang diarsipkan") ikut disaring oleh kata yang sama. Tombol "Tampilkan/Sembunyikan yang diarsipkan (n)" tetap memakai jumlah total arsip dan tidak ikut disaring.
- Setelah "Tambah" berhasil: kosongkan kata pencarian (agar anggota baru langsung terlihat). Setelah menyimpan nama baru: kata dibiarkan (baris yang tidak lagi cocok boleh menghilang; ini kasus langka).
- `ListEmptyComponent` "Belum ada anggota" hanya bila `members.length === 0` (tanpa kata pencarian).
- FlatList sudah punya `keyboardShouldPersistTaps="handled"`.

### 3.4 Periode baru (`periods/new.tsx`)

- Kolom cari antara baris tombol "Pilih semua / Kosongkan" dan daftar. ScrollView sudah punya `keyboardShouldPersistTaps="handled"`.
- Pilihan (`selectedInput`, `selected`) tidak tersentuh oleh pencarian. Judul "Pilih anggota (n dipilih)" tetap menghitung semua yang dipilih, termasuk yang sedang tersembunyi.
- Pilih semua dan Kosongkan tetap bekerja pada SEMUA anggota (perilaku sekarang) dan juga mengosongkan kata pencarian, supaya hasilnya terlihat. Alasan: bila dibatasi hanya yang terlihat, "Pilih semua" bisa memilih 3 dari 19 tanpa disadari; kalau tidak dikosongkan, pengguna melihat 3 baris tapi 19 terpilih.
- Mengetuk baris (pilihan jamak) tidak menutup papan ketik, supaya beberapa anggota bisa dipilih berurutan. Hapus kata dengan tombol (x), ketik nama berikutnya.
- Bagian di bawah (perkiraan tanggal, titipan) tidak berubah.

### 3.5 Pilih tuan rumah, Filter Riwayat, Titipan (pilihan tunggal)

Aturan sama dengan 3.2: ketuk pilihan memanggil `Keyboard.dismiss()`, kata pencarian tidak dihapus, pilihan yang tersembunyi tetap tampil di tempatnya. Tambahkan `keyboardShouldPersistTaps="handled"` pada ScrollView yang belum punya (`filter-riwayat.tsx`; `meetings/[number].tsx` dan `credits/index.tsx` sudah punya).

- `filter-riwayat.tsx`: chip anggota disaring. `draft.memberId` terpilih tetap tampil. Kata pencarian bukan bagian dari `HistoryFilter` dan tidak dikirim ke Riwayat; hanya `memberId` yang diterapkan lewat "Terapkan". "Hapus filter" di footer tidak menghapus kata pencarian (kata bukan filter) dan tidak perlu.
- `credits/index.tsx`: hanya kartu yang disaring; kartu `selected` (formulir pengembalian terbuka) tetap tampil.
- Pilih tuan rumah: hanya `eligible` yang disaring; tidak muncul saat `payoutStands` (daftar memang tidak ada).

### 3.6 Laporan (daftar baca-saja)

Nomor 9 dan 10: ketuk baris membuka halaman lain, tidak ada pilihan yang perlu dipertahankan. Tambah `keyboardShouldPersistTaps="handled"` pada ScrollView. Teks status SearchField menunjukkan "n dari N anggota".

## 4. Komponen bersama `SearchField`

File baru: `src/ui/components/SearchField.tsx`. Bukan turunan `TextField` (TextField tidak punya slot ikon; jangan ubah TextField), tetapi memakai token yang sama.

Prop:

| Prop | Tipe | Keterangan |
|---|---|---|
| `value` | `string` | kata pencarian (terkendali) |
| `onChangeText` | `(text: string) => void` | |
| `matchCount` | `number` | jumlah anggota yang cocok (tidak termasuk baris yang hanya dipertahankan karena terpilih) |
| `totalCount` | `number` | jumlah anggota sebelum disaring |

Tidak ada prop lain. Label, placeholder, dan teks status tetap di dalam komponen (satu kata di semua layar).

Tampilan (token dari `src/ui/theme.ts`, tanpa angka baru):

- Kotak: `minHeight: MIN_TOUCH` (48), `borderWidth 1`, `borderColor colors.borderStrong`, `borderRadius radius.sm`, `backgroundColor colors.bgCard`, `paddingHorizontal spacing.md`, baris horizontal, `alignItems center`, `gap spacing.sm`. Fokus: garis 2 dp `colors.brandStrong`, padding dikurangi 1 dp seperti `TextField` (teks tidak bergeser).
- Ikon kiri: Ionicons `search-outline`, `ICON.sm`, `colors.textTertiary`. Dekorasi: `accessibilityElementsHidden` dan `importantForAccessibility="no"` (pola yang sama dengan ListRow).
- TextInput: `flex: 1`, `...type.body`, `color colors.text`, `placeholderTextColor colors.textTertiary`, tanpa border sendiri.
- Tombol hapus (x): hanya saat `value.trim() !== ''`. Pressable 48 x 48 dp, ikon `close-circle` `ICON.md`, `colors.textTertiary`, `accessibilityRole="button"`, `accessibilityLabel="Hapus pencarian"`. Tindakan: `onChangeText('')`. Tidak mengubah fokus (papan ketik yang terbuka tetap terbuka, yang tertutup tetap tertutup).
- Teks status di bawah kotak: `...type.secondary`, `colors.textSecondary`, `marginTop spacing.xs`; hanya dirender saat `value.trim() !== ''`.
  - `matchCount > 0`: "{matchCount} dari {totalCount} anggota"
  - `matchCount === 0`: "Tidak ada anggota yang cocok." (warna biasa, bukan galat: bukan kesalahan pengguna)
- Pembungkus teks status: `View` selalu terpasang dengan `accessibilityLiveRegion="polite"` (pola sama dengan `helpRow` di `kas/new.tsx`), sehingga perubahan jumlah hasil dibacakan TalkBack tanpa memotong ucapan lain. Tanpa teks, tinggi View nol.

Papan ketik dan input:

- `returnKeyType="search"`, `submitBehavior="blurAndSubmit"` (default satu baris): tombol cari di papan ketik menutup papan ketik; hasil sudah tersaring sejak mengetik, tidak ada tombol "cari" terpisah di layar.
- `autoCorrect={false}`, `spellCheck={false}`, `autoCapitalize="none"`, `autoComplete="off"`, `importantForAutofill="no"`, `maxLength={40}`, tanpa `autoFocus`.
- `accessibilityLabel="Cari anggota"` dan `placeholder="Cari anggota"`.
- Back Android: perilaku bawaan (Back pertama menutup papan ketik, Back kedua kembali ke layar sebelumnya). Jangan menimpa tombol Back. Perlu dicek di HP (bagian 8).
- Font: ikuti pola yang ada (Inter, skala font sistem). Pemilik hanya memeriksa font normal.

## 5. Fungsi pencocok murni

File baru: `src/ui/memberSearch.ts` (bukan `src/domain`: ini urusan tampilan, bukan aturan uang). Tanpa dependensi, tanpa `Intl`, tanpa `normalize()`.

```ts
export const MEMBER_SEARCH_MIN = 8;
export function shouldShowMemberSearch(count: number): boolean;   // count > MEMBER_SEARCH_MIN
export function normalizeQuery(text: string): string;             // trim, huruf kecil, spasi berulang jadi satu
export function matchesName(name: string, query: string): boolean;
export function filterByQuery<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  query: string,
  keep?: (item: T) => boolean,   // baris yang tidak boleh disembunyikan (terpilih / sedang diubah)
): { items: T[]; matchCount: number };
```

Aturan:

- Kata dinormalkan: `trim()`, `toLowerCase()`, spasi/tab/baris-baru berturut-turut jadi satu spasi. Nama dinormalkan dengan cara yang sama.
- Kata dipecah di spasi; SETIAP potongan harus ada di mana saja di dalam nama (cocok di tengah nama, urutan potongan bebas). "arif muh" cocok dengan "Muhammad Arif".
- Kata kosong (setelah normalisasi) cocok dengan semua.
- Huruf berdiakritik tidak dilipat (nama anggota di sini umumnya ASCII). Bila nanti perlu, tambahkan di fungsi ini saja.
- `filterByQuery` mempertahankan urutan masukan, tidak mengubah masukan. `items` = baris yang cocok ditambah baris yang `keep` benar (di posisi aslinya). `matchCount` = jumlah yang benar-benar cocok (tanpa baris yang hanya dipertahankan oleh `keep`). Kata kosong: `items` = semua, `matchCount` = jumlah semua.
- Pemanggil: `const q = shouldShowMemberSearch(list.length) ? query : ''` (bila daftar menyusut sampai 8 atau kurang saat kata masih terisi, penyaringan berhenti dan kolom hilang).

Daftar kasus uji unit (`src/ui/memberSearch.test.ts`):

1. Kata kosong dan kata hanya spasi cocok dengan semua nama; `matchCount` = jumlah semua.
2. Huruf besar/kecil diabaikan: "SITI" cocok "Siti Aminah"; "siti" cocok "SITI".
3. Spasi di awal dan akhir kata diabaikan: "  siti  " cocok "Siti Aminah".
4. Spasi berlebih di tengah kata dan di nama: "siti   aminah" cocok "Siti  Aminah".
5. Cocok di tengah nama: "min" cocok "Siti Aminah"; "ahma" cocok "Muhammad Ahmad".
6. Beberapa potongan, urutan bebas: "arif muh" cocok "Muhammad Arif"; "arif budi" tidak cocok "Muhammad Arif".
7. Tidak cocok: "xyz" tidak cocok "Siti"; hasil kosong, `matchCount` 0.
8. Nama dengan tanda baca: "o'brien" dan "ani-ani" cocok apa adanya (tanpa regex; karakter khusus seperti "(" "[" "." "*" tidak melempar galat dan dipakai sebagai teks biasa).
9. Urutan hasil sama dengan urutan masukan; masukan tidak diubah (bandingkan dengan salinan).
10. `keep`: baris yang tidak cocok tetapi `keep` benar tetap ada di posisi aslinya; `matchCount` tidak menghitungnya.
11. `keep` pada baris yang cocok: tidak dobel.
12. Daftar kosong: `{ items: [], matchCount: 0 }`.
13. Nama sangat panjang (T8) dan kata sangat panjang tidak melempar galat.
14. `shouldShowMemberSearch`: 0, 1, 8 menghasilkan false; 9, 19 true.
15. Nama sama persis ganda ("Siti" dua kali): keduanya tampil, urutan masukan terjaga.

Tes komponen (opsional, bila pola `Money.test.tsx` mudah ditiru): tombol hapus hanya ada saat kata tidak kosong; teks status "3 dari 19 anggota" dan "Tidak ada anggota yang cocok."; `accessibilityLabel` "Cari anggota".

## 6. Galeri komponen

`src/ui/gallery/SectionE.tsx` (bagian "forms", tempat TextField) menambahkan satu `Section` "SearchField" dengan `Demo`:

- kosong (placeholder);
- terisi, hasil banyak ("3 dari 19 anggota") dengan tombol hapus;
- tanpa hasil ("Tidak ada anggota yang cocok.");
- difokuskan (garis tebal);
- satu demo interaktif: SearchField + daftar dari `fixtures.ts` (12 nama, termasuk `T8_MEMBER` yang panjang) yang disaring langsung memakai `filterByQuery`;
- lebar 320 dp mengikuti kontrol lebar yang sudah ada di galeri.

Perubahan tes yang wajib: `src/ui/gallery/gallery.test.ts`, `expect(components).toHaveLength(29)` menjadi 30. Tes yang sama menjamin `../components/SearchField'` muncul di salah satu SectionA-F. Perbarui komentar baris 1 SectionE ("... TextField, SearchField, DateField ...") dan daftar komponen di `docs/specs/component-gallery.md`.

## 7. Teks baru (seluruhnya; tidak ada perubahan teks lain)

| Teks | Dipakai di |
|---|---|
| Cari anggota | placeholder dan label aksesibilitas kolom cari |
| Hapus pencarian | label aksesibilitas tombol (x) (tidak ada teks tampak) |
| {n} dari {total} anggota | status saat ada kata dan ada hasil |
| Tidak ada anggota yang cocok. | status saat kata tidak punya hasil |

Pola "n dari N" sudah dipakai di layar Pembayaran ("Sudah bayar hari ini: 5 dari 19"). Kata "Hapus" konsisten dengan "Hapus filter". Tambahkan keempatnya ke daftar kata di `docs/specs/ui-language-review.md` bila developer/PM merawat daftar itu.

## 8. Urutan kerja dan pengujian

Urutan yang disarankan (perbaikan kecil berdampak besar lebih dulu): (1) `memberSearch.ts` + tes, (2) `SearchField` + galeri + perbaikan `gallery.test.ts`, (3) Pembayaran, (4) `kas/new`, (5) Anggota, Periode baru, (6) Pilih tuan rumah, Filter Riwayat, Titipan, Pinjaman, (7) dua layar Laporan. Satu komit per langkah wajar.

Yang bisa diuji tanpa perangkat: tes unit pencocok; tes galeri; `tsc`, lint. Yang TIDAK terbukti dari kode dan harus dicek pemilik di HP (font normal, data dummy 19 anggota):

1. Pembayaran: ketuk kolom cari, ketik "sit": jumlah baris turun, urutan tetap A-Z, teks "n dari 19 anggota" muncul. Tidak ada tulisan "Belum ada anggota di periode ini" saat hasil nol.
2. Pembayaran: dengan papan ketik terbuka, ketuk satu baris langsung membuka detail (satu ketukan, bukan dua). Geser baris ke kanan (swipe bayar) tetap jalan dengan papan ketik terbuka; kata pencarian tetap sesudah swipe. Menggulir daftar menutup papan ketik.
3. Pembayaran: buka detail, bayar, Back: kata pencarian masih ada dan baris menunjukkan "Sudah bayar hari ini". Ketuk (x) mengembalikan 19 baris.
4. Back Android saat papan ketik terbuka: Back pertama hanya menutup papan ketik, layar tidak ikut tertutup; Back kedua kembali ke layar sebelumnya.
5. `kas/new` (Pinjaman baru): ketik nominal, lalu cari anggota: nominal dan keypad menyingkir saat papan ketik terbuka, kembali dengan nominal yang sama setelah memilih anggota. Anggota terpilih tetap terlihat walau kata diubah sampai tidak cocok.
6. `kas/new`: kolom cari terlihat di atas papan ketik saat difokuskan (tidak tertutup); daftar tidak melompat.
7. Anggota: kolom Tambah dan kolom Cari tidak tertukar; setelah Tambah berhasil, kata pencarian kosong dan anggota baru terlihat.
8. Periode baru: ketuk beberapa anggota berurutan lewat pencarian; "Pilih anggota (n dipilih)" bertambah; Pilih semua mengosongkan kata dan memilih 19.
9. Filter Riwayat dan Pilih tuan rumah: ketuk pilihan menutup papan ketik; pilihan terlihat; tombol Terapkan/Simpan tidak tertutup papan ketik.
10. TalkBack (bila tersedia): kolom dibaca "Cari anggota"; saat mengetik, jumlah hasil dibacakan sopan (tidak memotong, tidak berulang berlebihan); tombol (x) dibaca "Hapus pencarian".
11. Ketuk (x) tidak menutup atau membuka papan ketik sendiri.
12. Daftar dengan 8 anggota atau kurang: kolom cari tidak muncul.

## 9. Saran lain yang diambil dan yang sengaja tidak

Diambil (semuanya sudah di atas): tombol hapus, abaikan huruf besar/kecil dan spasi, cocok di tengah nama dan beberapa potongan, urutan daftar tetap, teks hasil dan jumlah hasil, satu aturan ambang, pilihan tidak hilang, papan ketik menutup saat memilih (pilihan tunggal), Pilih semua mengosongkan kata, kolom tetap di atas pada layar yang paling sering dipakai (Pembayaran).

Tidak diambil: fokus otomatis (menutupi daftar dan swipe); mengurutkan hasil (urutan A-Z dipertahankan sesuai permintaan); pelipatan diakritik; sorotan huruf yang cocok (kompleksitas lebih besar dari manfaatnya pada nama pendek); menyimpan kata pencarian lintas layar; "anggota terakhir dipilih" (butuh state baru dan aturan baru); pencarian catatan di Riwayat (fitur terpisah).

## 10. Keputusan untuk pemilik (usulan bawaan sudah dipilih)

1. Ambang 8 (kolom muncul mulai 9 anggota). Alternatif: selalu tampil di Pembayaran dan Anggota. Usulan: tetap satu aturan.
2. Kata pencarian bertahan saat kembali dari detail anggota di Pembayaran (usulan), bukan dihapus setiap kembali.
3. Layar Akhiri periode sengaja tanpa pencarian (usulan).
