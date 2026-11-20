# Istilah Mas Catat dibandingkan dengan aplikasi populer

Tanggal: 2026-11-17. Pemohon: pemilik ("pakai istilah yang dipakai aplikasi populer"). Penyusun: ui-ux-designer (lewat asisten-utama).
Status: USULAN. Tidak ada teks di kode, CLAUDE.md, PROJECT.md, atau tes yang diubah. Perubahan baru dikerjakan setelah pemilik menjawab per nomor di bagian 8.

## 1. Kesimpulan singkat

Istilah Mas Catat sudah sangat dekat dengan bahasa aplikasi populer. Hanya sedikit yang layak diganti:

1. Dua usulan yang paling kuat: ganti nama pos "Debit" (mudah tertukar dengan kartu debit dan istilah akuntansi debit) dan ganti "Kas seharusnya" (terdengar seperti temuan audit) menjadi "Perkiraan kas".
2. Sisanya dipertahankan. Alasan utama: istilah populer (Transfer, Top Up, Saldo, Transaksi) punya makna lain di aplikasinya. Memakainya apa adanya justru menyesatkan untuk aturan arisan (misalnya "Transfer" berarti kirim ke orang lain, bukan pindah antar Tunai dan Debit).
3. Istilah khas arisan (Tuan rumah, Iuran, Pertemuan, Periode, Tunggakan) tidak punya padanan di aplikasi dompet atau bank. Padanan paling dekat ada di aplikasi arisan dan iuran warga, dan sudah sama.

## 2. Batas riset (baca dulu)

Riset web hanya menemukan sebagian label resmi. Aplikasi itu sendiri tidak dibuka (tidak ada akses ke HP). Penanda kolom "Sumber":

- **[S]** = diperiksa lewat sumber web yang disebut di bagian 7.
- **[U]** = pengetahuan umum penyusun tentang aplikasi itu. Belum diverifikasi di aplikasi saat ini. Label bisa sudah berubah.
- **[T]** = tidak ditemukan sumber, hanya nalar umum bahasa Indonesia sehari-hari.

Yang berhasil diverifikasi: DANA memakai menu "Riwayat" (dengan "Berhasil" dan "Dalam Proses", serta "Filter"). Jenius menamai saldo utama "Saldo Aktif" dan punya "Split Bill". BCA memakai "Mutasi Rekening", "Info Saldo", "Transfer", dan "Aktivitas" untuk riwayat di myBCA. GoPay punya "Transfer" di beranda. BukuKas dan BukuWarung punya pencatatan "Utang Piutang", "Pengingat", dan laporan harian, mingguan, bulanan (nama tombol persisnya tidak terkonfirmasi, dan sumbernya artikel pihak ketiga). Aplikasi arisan (Arisan Ceria, Arisan NAYA, Kantong Arisan di Jago) memakai "iuran", "pemenang", "pengocokan". Peringatan dari hasil riset: sebagian sumber menyebut BukuKas ditutup. Jangan jadikan BukuKas patokan tunggal.

## 3. Prinsip yang dipakai

1. Ikuti kata populer bila artinya sama persis dengan makna di Mas Catat.
2. Jangan ikuti kata populer bila artinya berbeda (Transfer, Saldo, Transaksi, Pemenang). Makna arisan lebih penting daripada keseragaman.
3. Istilah pilihan pemilik sebelumnya dipertahankan kecuali ada alasan kuat.
4. Istilah yang sudah benar menurut KBBI dan konsisten di seluruh layar tidak diganti hanya karena aplikasi lain berbeda.

## 4. Navigasi dan nama layar

| Istilah sekarang | Dipakai di | Istilah aplikasi populer | Sumber | Rekomendasi | Alasan |
|---|---|---|---|---|---|
| Beranda | Tab 1 | "Beranda" (GoPay, DANA, OVO, myBCA, Jenius: halaman awal) | [U] | Tetap | Sudah sama. |
| Riwayat | Tab 2, filter, ringkasan bulan | "Riwayat" (DANA); "Aktivitas" (myBCA); "Mutasi" (BCA, rekening) | [S] DANA, myBCA, BCA | Tetap | "Riwayat" dipakai DANA dan paling umum. Isi tab ini campuran iuran, tuan rumah, dan kas, jadi "Mutasi" (khusus rekening bank) kurang tepat. |
| Laporan | Tab 3 | "Laporan" (BukuWarung, BukuKas: harian, mingguan, bulanan) | [S] pihak ketiga | Tetap | Sudah sama. |
| Menu | Tab 4 | "Akun", "Profil", "Lainnya" (umum) | [U] | Tetap | "Menu" memuat navigasi, bukan akun. Tidak ada login, jadi "Akun" menyesatkan. |
| Filter riwayat | Halaman filter | "Filter" (DANA) | [S] | Tetap | Sudah sama. |
| Rincian catatan | Detail satu catatan | "Detail transaksi", "Rincian transaksi" | [U] | Tetap | "Catatan" dipakai karena tidak semua baris adalah transaksi uang (potongan, penghapusan tunggakan). Lihat bagian 5, baris "catatan". |
| Cadangan dan ekspor | Menu, Data | "Cadangkan" / "Cadangan" (aplikasi chat dan Android) | [U] | Tetap | Sudah umum. |
| Pulihkan data | Halaman pulihkan | "Pulihkan" (aplikasi chat dan Android) | [U] | Tetap | Sudah umum. |
| Istilah | Menu, Bantuan | "Pusat Bantuan" (DANA) | [S] | Tetap | Isinya daftar arti kata, bukan tanya jawab. "Istilah" lebih tepat. Grup "Bantuan" sudah memberi konteks. |
| Pengingat | Beranda | "Pengingat" (BukuKas: pengingat utang) | [S] pihak ketiga | Tetap | Sudah sama. |

## 5. Uang, kas, dan tempat uang

| Istilah sekarang | Dipakai di | Istilah aplikasi populer | Sumber | Rekomendasi | Alasan |
|---|---|---|---|---|---|
| Total kas | Beranda, Laporan | "Saldo" (GoPay, DANA, OVO), "Saldo Aktif" (Jenius), "Info Saldo" (BCA) | [S] Jenius, BCA | Tetap (D4) | "Saldo" mewakili satu dompet pribadi. Ini uang bersama kelompok, dan kata "kas" sudah akrab di arisan dan iuran warga. Laporan sudah memakai judul "Saldo kas" sebagai bagian. Tidak perlu diubah. |
| Kas | Seluruh aplikasi | "Kas" (BukuKas, BukuWarung, iuran kas warga) | [S] pihak ketiga | Tetap | Sudah sama. |
| Tunai | Tempat uang | "Tunai" / "Cash" (umum) | [U] | Tetap | Sudah sama. |
| Debit | Tempat uang, CSV, Riwayat | "Rekening" / "Bank" untuk tabungan (BCA "Mutasi Rekening"); "Dompet digital" / "e-wallet" untuk DANA, OVO, GoPay | [S] BCA; [U] | **Pertimbangkan ganti ke "Rekening"** (butuh keputusan pemilik) | Di bahasa sehari-hari "debit" berarti kartu debit atau transaksi debit. Di pembukuan "debit" berarti sisi kiri buku (sering diartikan uang masuk). Pemilik non-teknis mudah mengira "Debit" adalah kartu atau uang keluar. "Rekening" paling dekat dengan istilah bank dan menutup makna bank dan dompet digital bila glosarium menulis "rekening bank atau dompet digital". Ini nama dari aturan domain, jadi bukan hanya teks: kode, CSV, Riwayat, glosarium, dan CLAUDE.md ikut berubah. Bila pemilik menolak, tetap aman: glosarium sudah menjelaskannya. |
| Piutang (dipinjam anggota) | Kas, Laporan | "Piutang" di pencatatan "Utang Piutang" (BukuWarung, BukuKas) | [S] pihak ketiga | Tetap | "Piutang" memang uang yang akan kembali ke kita. Sub-label "(dipinjam anggota)" sudah membantu. |
| Pindah saldo | Catat kas | "Transfer" (GoPay, DANA, OVO, BCA), "Pindahkan saldo" (umum) | [S] GoPay, BCA | Tetap | Di aplikasi populer "Transfer" berarti kirim uang ke orang atau bank lain. Di Mas Catat uangnya tetap di kelompok dan hanya pindah tempat. Memakai "Transfer" akan terbaca sebagai pengeluaran. |
| Saldo awal | Catat kas | "Saldo awal" (pembukuan, BukuKas) | [U] | Tetap | Sudah baku. |
| Catat kas | Menu, halaman | "Catat Transaksi", "Tambah Transaksi" (aplikasi pencatat) | [U] | Tetap | "Catat" sudah sama dengan tombol aplikasi pencatat. "Kas" lebih tepat daripada "transaksi" karena isinya saldo awal, pindah saldo, pinjaman, pengeluaran. |
| Pengeluaran bersama | Catat kas | "Pengeluaran" (BukuKas, BukuWarung), "Uang Keluar" | [S] pihak ketiga | Tetap | Sudah sama, dengan kata "bersama" untuk membedakan dari bayaran tuan rumah. |
| Masuk / Keluar (tanda + dan -, "Masuk ke Tunai", "Keluar dari Debit") | Riwayat | "Uang masuk" / "Uang keluar", "Pemasukan" / "Pengeluaran" | [S] pihak ketiga | Tetap | Sudah sama. |
| Pinjaman, Pelunasan pinjaman, Sisa pinjaman | Pinjaman anggota | "Utang" dan "Piutang"; "melunasi" (BukuKas) | [S] pihak ketiga | Tetap (pilihan pemilik sebelumnya) | "Lunas", "melunasi" sudah dipakai. "Pinjaman" dari sisi kelompok yang meminjamkan lebih jelas daripada "piutang". |
| Kas seharusnya | Laporan | "Perkiraan", "Estimasi", "Proyeksi" (laporan keuangan) | [U] | **Ganti ke "Perkiraan kas"** | "Seharusnya" terdengar seperti ada yang salah atau ada target. Maknanya perkiraan bila semua tunggakan lunas dan titipan dikembalikan. Rumus tetap. Glosarium sudah menulis "Perkiraan kas bila ...". |
| Cek kas, Selisih, Belum dicek | Menu, Beranda, Cek kas | "Kas opname" (akuntansi), "Cek saldo" | [U] | Tetap (pilihan pemilik sebelumnya: Cek kas) | "Selisih" (lebih/kurang) adalah istilah baku opname kas dan sudah dipakai. |
| Catatan (bukan "transaksi") | Riwayat, Rincian catatan | "Transaksi" (hampir semua aplikasi populer, termasuk DANA, Jenius) | [S] Jenius, BCA | Tetap | Potongan dari bayaran tuan rumah dan penghapusan tunggakan bukan transaksi uang. Memakai "transaksi" untuk semuanya tidak akurat. "Catatan" juga sudah dipakai konsisten (tinjauan bahasa 2026-11-12). |

## 6. Iuran, arisan, periode, dan status

| Istilah sekarang | Dipakai di | Istilah aplikasi populer | Sumber | Rekomendasi | Alasan |
|---|---|---|---|---|---|
| Iuran | Pembayaran | "Iuran" (aplikasi arisan dan iuran warga: Arisan NAYA, aplikasi iuran kas warga) | [S] | Tetap | Sudah sama. |
| Pembayaran / Catat pembayaran | Beranda, Periode | "Bayar" (GoPay, DANA, OVO) | [U] | Tetap (pilihan pemilik sebelumnya) | Sudah jelas. |
| Tunggakan | Pembayaran, Laporan | "Tunggakan" (BukuKas: sisa tunggakan); "Utang" | [S] pihak ketiga | Tetap | Sudah sama dan baku. "Utang" sengaja tidak dipakai karena kesan membebani anggota. |
| Tuan rumah, Bayaran tuan rumah, Pembayaran tuan rumah | Pertemuan, Periode | "Pemenang" / "penerima arisan" (Arisan Ceria, Arisan NAYA, Jago) | [S] | Tetap | Di Mas Catat tidak ada undian. Giliran bergantian rumah ke rumah dan tuan rumah juga menjamu. "Pemenang" menyalahi aturan domain. |
| Pertemuan | Seluruh aplikasi | "Putaran", "Sesi" (arisan), "Minggu" | [S] ringkasan arisan | Tetap (pilihan pemilik sebelumnya) | "Putaran" biasanya berarti satu siklus penuh (sama dengan Periode di sini), jadi bisa membingungkan. |
| Periode | Periode | "Putaran" (arisan) | [S] ringkasan arisan | Tetap | Sudah dipakai konsisten. Glosarium menjelaskan: satu putaran penuh. |
| Titipan | Titipan anggota | "Deposit", "Uang muka", "Saldo" | [U] | Tetap (pilihan pemilik sebelumnya) | Sesuai bahasa sehari-hari anggota arisan. Tidak ada alasan kuat mengganti. |
| Dibayar di muka | Jadwal | "Bayar di muka" (umum) | [U] | Tetap | Sudah sama. |
| Lunas, Belum lunas | Pembayaran | "Lunas" (BukuKas: melunasi) | [S] pihak ketiga | Tetap | Sudah sama. |
| Dilewati, Lewati pertemuan, Batalkan pelewatan | Pertemuan | "Lewati" (umum untuk aksi lewati) | [T] | Tetap (pilihan pemilik sebelumnya) | Tidak ada padanan di aplikasi keuangan. Kata sudah jelas. |
| Tutup pertemuan, Akhiri periode | Pertemuan, Periode | "Tutup buku" (pembukuan); "Selesai" | [U] | Tetap | "Akhiri" dan "Tutup" cukup jelas dan konsisten (keputusan D5). |
| Aktif, Berakhir | Status periode | "Aktif", "Selesai" (aplikasi umum); DANA: "Berhasil", "Dalam Proses" untuk transaksi | [S] DANA | Tetap | "Berakhir" sudah diputuskan pemilik (D5). Untuk periode, "Selesai" dan "Berakhir" setara. |
| Berlaku, Dikoreksi, Koreksi | Riwayat, Rincian, CSV | "Dibatalkan" (aplikasi dompet untuk transaksi yang dibatalkan) | [U] | Tetap | Di Mas Catat catatan lama tidak dibatalkan lalu hilang, tapi dikoreksi dengan catatan baru. "Dibatalkan" akan mengesankan tidak ada pengganti. |
| Tanpa perubahan kas | Kolom CSV, glosarium | "Netral" | [T] | Tetap (pilihan pemilik sebelumnya, D10) | Sudah jelas bagi pembaca spreadsheet. |
| Arsipkan anggota | Anggota | "Arsipkan" (aplikasi surel dan chat) | [U] | Tetap | Sudah sama. |

## 7. Pesan, tombol, dan teks bantu

| Istilah sekarang | Dipakai di | Istilah aplikasi populer | Sumber | Rekomendasi | Alasan |
|---|---|---|---|---|---|
| tersimpan (toast: "Pembayaran Rp15.000 dari X tersimpan") | Toast | "Berhasil" ("Transaksi berhasil", DANA kategori "Berhasil") | [S] DANA | Tetap | "Tersimpan" lebih tepat: aplikasi ini hanya mencatat, tidak mengirim uang. "Berhasil" cocok untuk aplikasi yang memproses pembayaran. |
| Terjadi masalah / Terjadi kesalahan. Coba lagi. | Galat umum | "Terjadi kesalahan", "Coba lagi" | [U] | Tetap (sudah tercakup tinjauan bahasa T4) | Sudah sama. Perbaikan lain sudah ada di `ui-language-review.md`. |
| Batal | Dialog | "Batal" (umum) | [U] | Tetap | Sudah sama. |
| Hapus, Hapus anggota, Mulai dari nol | Dialog | "Hapus", "Reset" | [U] | Tetap | "Mulai dari nol" lebih jelas daripada "Reset" untuk pemilik non-teknis. |
| Berkas CSV, berkas | Ekspor | "File" (hampir semua aplikasi dan sistem Android Indonesia) | [U], belum diverifikasi | Tetap (D3). Tinjau lagi bila pemilik merasa "berkas" kaku | "Berkas" baku KBBI. "File" juga lazim di aplikasi populer. Belum ada sumber yang memastikan mana lebih dipahami pengguna awam. Keputusan D3 sudah memilih "berkas", jangan diubah tanpa alasan kuat. |
| Bagikan | Ekspor dan cadangan | "Bagikan" (Android) | [U] | Tetap | Sudah sama. |

## 8. Daftar usulan perubahan (jawab per nomor)

Hanya dua usulan perubahan. Pemilik cukup menjawab "setuju", "tolak", atau "tunda" per nomor.

1. **Ganti nama pos "Debit" menjadi "Rekening"** (alternatif: "Bank atau dompet digital"). Alasan: "debit" ambigu (kartu debit, debit pembukuan). Dampak besar karena nama ini ada di aturan domain: label layar, Riwayat, CSV (kolom dan nilai), glosarium, CLAUDE.md, tes yang mengunci teks. Kode (nama variabel `debit`) bisa tetap. Saran penyusun: setuju bila pemilik juga pernah bingung dengan kata ini. Bila ragu, tunda saja: glosarium sudah menjelaskannya.
2. **Ganti "Kas seharusnya" menjadi "Perkiraan kas".** Alasan: lebih netral dan sama dengan penjelasan di glosarium. Dampak kecil: label di Laporan, glosarium, tes teks. Rumus tidak berubah.

Tidak perlu jawaban (semuanya dipertahankan, alasannya di tabel di atas): Total kas, Tunai, Piutang, Pindah saldo, Catat kas, Riwayat, Laporan, Beranda, Menu, Koreksi, Catatan, Iuran, Tunggakan, Tuan rumah, Pertemuan, Periode, Titipan, Pinjaman, Dilewati, Cek kas, Tanpa perubahan kas, Berkas.

## 9. Sumber

- BCA, edukasi top up e-wallet lewat menu Transfer: https://www.bca.co.id/id/informasi/edukatips/2020/12/29/02/49/Top-Up-E-Wallet-Melalui-Transfer-VA-di-Menu-Transfer
- BCA, myBCA tampilan baru (riwayat di menu "Aktivitas"): https://www.bca.co.id/id/informasi/news-and-features/2025/02/20/03/57/mybca-hadir-dengan-tampilan-baru-yang-lebih-modern-dan-intuitif
- BCA, myBCA Bisnis (Informasi Rekening, Mutasi Rekening, e-Statement): https://www.bca.co.id/id/bisnis/layanan/e-banking-bisnis/mybca-bisnis
- BCA, myBCA keyboard (Cek Saldo dan Mutasi): https://www.bca.co.id/id/informasi/edukatips/2025/07/17/03/28/transaksi-banking-semudah-chatting-dengan-mybca-keyboard
- Kumparan, riwayat transaksi DANA (menu "Riwayat", "Berhasil", "Dalam Proses", "Filter"): https://kumparan.com/berita-bisnis/cara-melihat-riwayat-transaksi-dana-hingga-setahun-terakhir-1z9hfAjcdhr
- Popbela, riwayat transaksi DANA: https://popbela.com/career/inspiration/nafi-khoiriyah/cara-menghapus-riwayat-transaksi-dana
- Metro TV, transfer GoPay ke OVO (tombol "Transfer" di beranda): https://www.metrotvnews.com/read/kpLCaPEo-cara-transfer-gopay-ke-ovo-mudah-dan-cepat-tanpa-ribet
- Bisnis.com, transfer ke DANA dari GoPay atau OVO: https://finansial.bisnis.com/read/20250122/55/1833848/cara-transfer-ke-dana-dari-gopay-atau-ovo-mudah
- Jenius, Transaksi Saldo Aktif: https://www.jenius.com/en/faq/mengenal-jenius/transaksi-saldo-aktif
- Jenius, Split Bill: https://www.jenius.com/en/faq/transaksi-online-offline/split-bill
- Jurnal.id, aplikasi buku kas (catat utang, pengingat, laporan): https://www.jurnal.id/id/aplikasi-buku-kas
- Gizmologi, aplikasi keuangan gratis Android (BukuKas, catat hutang): https://gizmologi.id/rekomendasi/aplikasi-keuangan-gratis-android/
- Popbela, aplikasi arisan online (Arisan Ceria, Arisan NAYA, Kantong Arisan Jago): https://www.popbela.com/career/inspiration/aplikasi-arisan-online-terbaik-00-22f6k-4gmklf
- Mamikos, aplikasi arisan online: https://mamikos.com/info/aplikasi-arisan-online-gnr/?halaman=all

Catatan: GoPay, OVO, dan BukuWarung tidak punya sumber resmi tentang label menu yang ditemukan di riset ini. Baris yang bertanda [U] adalah pengetahuan umum dan belum dibandingkan langsung di aplikasi. Bila pemilik ingin kepastian, buka aplikasinya di HP lalu cocokkan.

## Keputusan pemilik 2026-11-17

Pertanyaan 1 (ganti "Debit" menjadi "Rekening"): ditunda, tidak ada perubahan. Pertanyaan 2 (ganti "Kas seharusnya" menjadi "Perkiraan kas"): diganti. Dicatat sebagai keputusan 37 di PROJECT.md.
