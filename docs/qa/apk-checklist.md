# Daftar periksa APK (M7b): membangun, memasang, dan mengecek di HP

Status: kode M7b sudah selesai, tetapi APK BELUM dibangun. Semua isi "Yang harus tampak" di bawah adalah yang DIHARAPKAN, belum terbukti di HP. Tidak ada yang boleh ditandai lulus tanpa laporan pemilik.

PENTING:
- Pakai DATA CONTOH saja. Jangan pernah memulihkan (restore) berkas cadangan data contoh ke aplikasi yang nanti dipakai untuk uang nyata.
- Cutover (pindah ke data nyata) BUKAN bagian dari daftar ini. Itu langkah terpisah yang butuh persetujuan pemilik sendiri.
- APK adalah instalasi aplikasi yang BERBEDA dari Expo Go, dengan database sendiri. APK mulai kosong. Expo Go tetap dipakai untuk uji data contoh.

Untuk Anda sebagai web developer: EAS Build itu seperti CI/CD di cloud. `eas build` mengunggah kode proyek ke server Expo, server membangun APK, lalu Anda mengunduh hasilnya lewat tautan (mirip artefak build). Keystore adalah kunci tanda tangan aplikasi: tanpa kunci yang sama, versi baru tidak bisa dipasang menimpa versi lama.

## Bagian A. Membangun APK (perintah untuk pemilik)

Jalankan di PowerShell, di folder `c:\Users\mmarif\MyProjects\kang-admin`.

| No | Lakukan | Catatan |
|---|---|---|
| A1 | `git status` | Cek dulu. EAS mengunggah semua berkas yang tidak di-ignore git. Pastikan tidak ada berkas rahasia, keystore (`*.jks`, `*.keystore`), atau `credentials.json` yang tampak |
| A2 | `npx eas-cli login` (atau pasang sekali: `npm i -g eas-cli`, lalu `eas login`) | Masuk dengan akun Expo (gratis). Kata sandi akun diketik sendiri, jangan dikirim ke asisten |
| A3 | `eas init` (hanya bila diminta untuk menautkan proyek) | Ini menulis `projectId` dan `owner` ke `app.json`. Jalankan `git diff app.json`, lihat perubahannya, lalu serahkan ke sesi utama. Jangan commit sendiri |
| A4 | Naikkan `android.versionCode` di `app.json` bila ini bukan APK pertama | Dikelola manual (`cli.appVersionSource` = `local`). Wajib naik setiap APK baru, kalau tidak Android menolak menimpa. APK pertama memakai 1 |
| A5 | `eas build -p android --profile preview` | Profil `preview` menghasilkan APK (bukan AAB) yang bisa dipasang langsung. Tunggu sampai selesai (bisa antre; lamanya belum teruji) |
| A6 | Saat ditanya soal keystore: biarkan EAS membuatkan | Kunci disimpan EAS. Anda tetap mengunduh SATU salinan (bagian C) |

## Bagian B. Memasang APK di HP

| No | Lakukan | Yang harus tampak |
|---|---|---|
| B1 | Buka tautan build (dari terminal atau halaman expo.dev > proyek > Builds) di HP, unduh APK | Berkas `.apk` terunduh |
| B2 | Buka berkas itu. Bila diminta, izinkan "Pasang aplikasi tidak dikenal" untuk peramban atau pengelola berkas yang dipakai | Layar pemasangan Android muncul |
| B3 | Pasang, lalu buka | Aplikasi "Mas Catat" terpasang berdampingan dengan Expo Go (jangan hapus Expo Go) |

Setelah selesai, cabut izin "sumber tak dikenal" bila tidak dipakai lagi.

## Bagian C. Keystore: salin dan simpan (sekali, setelah build pertama)

1. Jalankan `eas credentials`, pilih Android, pilih profil atau build `preview`, lalu unduh keystore. Ambil SATU salinan saja.
2. Simpan berkas keystore di DUA tempat berbeda, di luar HP ini dan di luar repo (misalnya folder cloud pribadi dan flashdisk).
3. Catat alias dan kedua sandi (sandi keystore dan sandi kunci) di password manager, terpisah dari berkasnya.
4. Lapor ke sesi utama hanya kalimat: "keystore sudah disalin ke 2 tempat". Itu bukti untuk menutup M7b.

**PERINGATAN: JANGAN PERNAH mengirim keystore, alias, atau sandinya ke asisten (di obrolan, berkas, atau tangkapan layar). JANGAN taruh di repo, di folder `kang-admin`, atau di folder backup data (Cadangan/Drive). Kehilangan keystore berarti aplikasi tidak bisa diperbarui lagi; satu-satunya jalan adalah mencopot pemasangan, yang menghapus data bila tidak ada cadangan.**

## Bagian D. 10 langkah "Recheck on the phone with the APK"

Expo Go lulus tidak membuktikan APK lulus. Pakai data contoh lagi.

| No | Lakukan | Yang harus tampak (harapan) |
|---|---|---|
| 1 | Pasang APK | Terpasang, nama "Mas Catat" dan ikon tampil, terbuka ke Beranda dengan database kosong (migrasi 0001 sampai versi terbaru berjalan di build rilis) |
| 2 | Tambah anggota dan periode, catat satu pembayaran | Data tetap ada setelah aplikasi ditutup lalu dibuka lagi |
| 3 | Bagikan cadangan ke Drive, cek ukurannya | Lembar bagikan (share sheet) berfungsi tanpa plugin expo-sharing; ukuran berkas sama di Drive |
| 4 | Pulihkan lewat pemilih berkas (berkas data contoh), lalu "Mulai dari nol" dengan HAPUS SEMUA | Beranda menampilkan data baru |
| 5 | Bagikan keempat CSV (plus Cek kas) dan buka di spreadsheet | Terbuka dengan benar |
| 6 | Pengingat 7 hari | Muncul lalu hilang sesuai aturan |
| 7 | L1: baca nilai PRAGMA journal_mode | Catat nilainya di log. Bila WAL, pastikan cadangan masih lolos cek byte (header byte 18/19) |
| 8 | L6: matikan paksa (force-stop) saat pemulihan berjalan | Awal berikutnya menampilkan pesan pemulihan (lihat bagian E) |
| 9 | allowBackup: cek di info aplikasi atau keluaran build | Sesuai keputusan (mati). Ini bukan fitur yang terlihat pengguna |
| 10 | Salinan keystore | Pemilik mengonfirmasi dua tempat |
| 11 | Setelah pemasangan, buka Info aplikasi > Izin. Lalu bagikan sebuah cadangan dan bagikan satu CSV, dan pilih berkas lewat Pulihkan (data contoh) | Daftar izin TIDAK memuat izin yang diblokir (READ/WRITE_EXTERNAL_STORAGE, SYSTEM_ALERT_WINDOW, VIBRATE). Berbagi cadangan dan memilih berkas pemulihan tetap berfungsi (keputusan 41) |
| L6 (baru) | Jalur marker pemulihan, lihat E1 sampai E4 | Layar "Pemulihan sebelumnya tidak selesai" dan tombol Pulihkan bekerja |
| F3 (baru) | Cadangan lama dengan perubahan sesudahnya: tutup pertemuan, pilih tuan rumah atau tanggal, akhiri periode, arsipkan anggota, tambah atau ganti nama anggota | Setiap perubahan itu membuat cadangan lama terbaca "berbeda/lebih lama" dan butuh mengetik PULIHKAN, bukan "sama" |

Setelah semua lulus, M7b ditandai selesai. Data contoh di APK baru dihapus saat cutover (langkah terpisah).

## Bagian E. Skenario yang hanya terbukti di perangkat

Tes otomatis memakai database tiruan di laptop. Hal berikut hanya bisa dipastikan di HP dengan APK. Semua data contoh.

| No | Lakukan | Yang harus tampak (harapan, belum terbukti) |
|---|---|---|
| E1 | Mulai Pulihkan dari berkas contoh, lalu force-stop aplikasi di tengah (Info aplikasi > Paksa berhenti) saat proses berjalan. Jendelanya sempit; ulangi beberapa kali bila perlu | Buka lagi: layar "Pemulihan sebelumnya tidak selesai". Ketuk Pulihkan: data LAMA kembali dan tombol itu selesai tanpa galat |
| E2 | Ulangi E1 dua kali berturut-turut | Marker lama ditimpa (File.move overwrite), tidak ada galat "berkas sudah ada" |
| E3 | Jalur berkas database rusak: bila bisa menyiapkan berkas rusak di data contoh, buka aplikasi | Salinan `rusak-<waktu>.db` muncul, folder SQLite terbaca. Bila keadaannya 'absent' (tidak ada berkas), tidak ada yang terhapus |
| E4 | Di layar "Pemulihan sebelumnya tidak selesai", tekan tombol back Android | Tombol back mati (tidak keluar dari layar itu) |
| E5 | Set ukuran huruf sistem ke terbesar, buka layar itu dan layar Pulihkan | Teks tidak terpotong, tombol tetap terjangkau |
| E6 | Nyalakan TalkBack di layar pemulihan | Judul, penjelasan, dan tombol terbaca berurutan dengan benar |
| E7 | M2: cadangan saat database sehat, lalu (bila bisa disiapkan) database dengan masalah | Peringatan M2 tampil bila database tidak sehat; cadangan sehat tidak diberi peringatan |
| E8 | Info aplikasi Mas Catat | allowBackup mati. Catatan: pada Android 12 ke atas, transfer HP-ke-HP lewat kabel atau pengaturan awal HP baru kadang tetap bisa menyalin data. Saat pindah HP, pakai Cadangan lalu Pulihkan di HP baru, jangan mengandalkan transfer otomatis |
| E9 | Izin aplikasi (Info aplikasi > Izin, atau `aapt dump permissions` bila punya) | Catat daftar izin yang diminta. Temuan review: READ/WRITE_EXTERNAL_STORAGE (dari expo-file-system), SYSTEM_ALERT_WINDOW dan VIBRATE (dari template). Pemilik memutuskan memblokirnya atau tidak (lihat PROJECT.md, keputusan 40) |
| E10 | Catat PRAGMA journal_mode | Nilai dicatat (juga langkah D7) |

Catatan: tombol "Lanjutkan dengan data sekarang" TIDAK ada di v1. Pada layar pemulihan hanya ada Pulihkan.

## Laporan hasil

Tulis ke sesi utama: nomor langkah yang lulus atau gagal, nilai journal_mode, daftar izin, dan "keystore sudah disalin ke 2 tempat". Jangan sertakan keystore, alias, atau sandi.
