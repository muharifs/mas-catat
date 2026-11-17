# Cek HP ke-11: Cek kas (hitung uang per pertemuan), migrasi 0007

Pakai Expo Go dan DATA CONTOH saja. Jangan pakai data uang sungguhan.
Cek kas hanya mencatat hasil hitungan. Saldo kas tidak boleh berubah di langkah mana pun.

## Persiapan
1. Menu > Cadangan dan ekspor > "Mulai dari nol" (data contoh saja). Tambah anggota Ani, Budi, Citra.
2. Buat periode "Cek Kas Satu" dengan ketiganya. Pertemuan 1: tuan rumah Ani, tanggal Selasa yang sudah lewat. Pertemuan 2: tuan rumah Budi.
3. Ani, Budi, Citra masing-masing bayar 15.000 (Tunai). Tutup pertemuan 1 SETELAH langkah 12-13 di bawah bila ingin menguji peringatan; kalau tidak, bayar tuan rumah Ani untuk pertemuan 1 (dari Tunai).
4. Angka "menurut catatan" di Cek kas HARUS sama dengan Tunai dan Debit di layar Catat kas. Pakai angka di layar itu sebagai acuan (angka bisa berbeda karena potongan tunggakan tuan rumah).

## Langkah
| No | Lakukan | Yang harus tampak |
|---|---|---|
| 1 | Menu > Kas > "Cek kas" | Layar "Cek kas". "Menurut catatan" Tunai dan Debit sama dengan layar Catat kas. Pertemuan yang sedang berjalan terpilih; bila pertemuan 1 sudah ditutup, ada tombol Pertemuan 1 juga |
| 2 | Lihat tombol "Simpan hitungan" sebelum mengisi apa pun | Nonaktif, ada alasan "Isi jumlah Tunai dulu. Isi 0 bila tidak ada uang tunai." |
| 3 | Tekan angka 0 di keypad (Tunai) | Tombol Simpan aktif (0 yang ditekan dianggap sudah diisi). Tahan tombol hapus: Simpan nonaktif lagi |
| 4 | Isi Tunai SAMA persis dengan catatan, Debit dibiarkan "tidak dicek", Simpan | Hasil: Tunai "Cocok"; "Debit tidak dicek". Toast "Hitungan tersimpan. Kas cocok." Saldo di Catat kas TIDAK berubah |
| 5 | "Hitung ulang". Isi Tunai KURANG 15.000 dari catatan, Simpan | Badge "Kurang Rp15.000" (kata, bukan tanda minus). Notice "Ada selisih". Ada daftar "Kemungkinan penyebab". Saldo kas tidak berubah |
| 6 | Hitung ulang: isi Tunai 12.345 lebih besar dari catatan (bukan kelipatan 15.000) | Diterima. "Lebih Rp12.345". Tidak ada saran pembayaran anggota (bukan kelipatan 15.000) |
| 7 | Hitung ulang: Tunai LEBIH 15.000 dari catatan | "Lebih Rp15.000". Saran "Pembayaran anggota mungkin belum dicatat." dengan tombol "Catat pembayaran" |
| 8 | Hitung ulang: Tunai KURANG 30.000 dari catatan (10.000 x 3 anggota; catatan Tunai harus minimal 30.000) | Saran "Pembayaran tuan rumah mungkin belum dicatat." Semua saran berbunyi "mungkin", bukan vonis |
| 9 | Hitung ulang: tekan "Hitung Debit juga", isi Debit 30.000 (catatan Debit 0) dan Tunai KURANG 30.000 dari catatan | Tunai "Kurang Rp30.000", Debit "Lebih Rp30.000"; saran pertama "Pindah saldo antara Tunai dan Debit mungkin belum dicatat." |
| 10 | Tekan salah satu tombol saran (misalnya "Catat pembayaran") | Membuka layar yang sesuai, tidak mengubah apa pun sendiri. Kembali |
| 11 | Menu > Jadwal periode > "Lihat riwayat cek kas" | Satu kartu per pertemuan. Pertemuan yang dihitung berselisih: "Selisih mulai di sini" dan teks "Dihitung N kali. Yang terbaru dipakai." Pertemuan yang belum pernah dihitung: "Belum dicek" |
| 12 | Hitung ulang pertemuan yang sama sampai COCOK, buka riwayat lagi | Hitungan terbaru dipakai: "Cocok", tanda selisih hilang; jumlah "Dihitung N kali" bertambah |
| 13 | Beranda: lihat baris "Cek kas" di kartu periode | Badge "Cocok" atau "Selisih" (kata, bukan hanya warna). Catat pendapat: kartu terasa terlalu penuh atau tidak |
| 14 | Pada pertemuan yang BELUM pernah dihitung, tekan "Tutup pertemuan" (Beranda atau Jadwal periode) | Dialog memuat peringatan "Pertemuan ini belum dicek kasnya..." dan 3 tombol: "Cek kas dulu", "Tutup pertemuan", "Batal". Muat di layar HP, juga dengan huruf besar |
| 15 | Tekan "Tutup pertemuan" di dialog itu | Pertemuan TETAP tertutup (peringatan, bukan blokir) |
| 16 | Pertemuan yang sudah dihitung: tekan "Tutup pertemuan" | Dialog TANPA peringatan dan tanpa tombol "Cek kas dulu" |
| 17 | Menu > Cadangan dan ekspor: buat cadangan; "Mulai dari nol"; pulihkan cadangan tadi | Pemulihan berhasil. Riwayat cek kas ada lagi, hitungan sama |
| 18 | (Bila masih punya cadangan LAMA dari sebelum Cek kas) Pulihkan cadangan lama itu | Berhasil; riwayat cek kas kosong; data lain utuh |
| 19 | Menu > Istilah | Ada "Cek kas", "Selisih", "Belum dicek" |
| 20 | Tutup semua pertemuan, bayar semua tuan rumah, akhiri periode; buka Menu | Baris "Cek kas" di Menu tidak ada tanpa periode aktif. Riwayat cek kas periode lama masih bisa dibuka lewat Periode > Jadwal (hanya baca, tanpa tombol "Cek kas sekarang") |

## Yang dilaporkan pemilik
Satu baris per kelompok (langkah 1-10, 11-16, 17-20): lolos atau tidak. Tambahkan pendapat tentang baris "Cek kas" di Beranda dan dialog 3 tombol.
