// Plain-language meaning of the words used in the app (screen: src/app/istilah.tsx). Text only: no rule or
// calculation lives here. Owner decision 2026-11-12 (docs/specs/text-batch-e.md, N5).
export interface GlossaryEntry {
  group: string;
  term: string;
  meaning: string;
}

export const GLOSSARY_INTRO = 'Arti kata yang dipakai di Mas Catat.';

export const GLOSSARY: readonly GlossaryEntry[] = [
  { group: 'Kas dan uang', term: 'Kas', meaning: 'Uang bersama kelompok. Bertambah Rp5.000 per anggota di setiap pertemuan.' },
  { group: 'Kas dan uang', term: 'Total kas', meaning: 'Uang kas yang ada sekarang, yaitu Tunai ditambah Debit. Piutang tidak dihitung.' },
  { group: 'Kas dan uang', term: 'Tunai', meaning: 'Uang kertas atau koin yang dipegang pengurus.' },
  { group: 'Kas dan uang', term: 'Debit', meaning: 'Uang kas di rekening bank atau dompet digital.' },
  { group: 'Kas dan uang', term: 'Tempat uang', meaning: 'Tempat uang kas disimpan, yaitu Tunai atau Debit.' },
  { group: 'Kas dan uang', term: 'Piutang (dipinjam anggota)', meaning: 'Uang kas yang sedang dipinjam anggota dan belum kembali. Belum ada di tangan, jadi tidak masuk Total kas.' },
  { group: 'Kas dan uang', term: 'Pindah saldo', meaning: 'Memindahkan uang antara Tunai dan Debit, ke dua arah. Total kas tidak berubah.' },
  { group: 'Kas dan uang', term: 'Saldo awal', meaning: 'Uang yang sudah ada sebelum aplikasi dipakai. Dicatat satu kali di awal.' },
  { group: 'Kas dan uang', term: 'Pengeluaran bersama', meaning: 'Uang kas yang dipakai untuk keperluan bersama, misalnya wisata. Catatan wajib diisi.' },
  { group: 'Kas dan uang', term: 'Pinjaman', meaning: 'Uang kas yang dipinjamkan ke anggota. Tanpa bunga dan tanpa batas waktu.' },
  { group: 'Kas dan uang', term: 'Pelunasan pinjaman', meaning: 'Anggota mengembalikan sebagian atau seluruh pinjaman. Uangnya masuk ke Tunai.' },
  { group: 'Kas dan uang', term: 'Sisa pinjaman', meaning: 'Pinjaman dikurangi yang sudah dikembalikan, dihitung dari semua periode.' },
  { group: 'Kas dan uang', term: 'Kas seharusnya', meaning: 'Perkiraan kas bila semua tunggakan dilunasi dan semua titipan dikembalikan. Rumus: Total kas + tunggakan iuran - titipan anggota.' },
  { group: 'Iuran dan tuan rumah', term: 'Iuran', meaning: 'Rp15.000 yang dibayar setiap anggota di setiap pertemuan, termasuk tuan rumah.' },
  { group: 'Iuran dan tuan rumah', term: 'Kelipatan Rp15.000', meaning: 'Pembayaran harus Rp15.000, Rp30.000, Rp45.000, dan seterusnya. Pembayaran sebagian tidak diterima.' },
  { group: 'Iuran dan tuan rumah', term: 'Tunggakan', meaning: 'Iuran pertemuan yang belum dibayar anggota.' },
  { group: 'Iuran dan tuan rumah', term: 'Dibayar di muka', meaning: 'Iuran pertemuan yang belum berjalan tetapi sudah dibayar.' },
  { group: 'Iuran dan tuan rumah', term: 'Titipan', meaning: 'Kelebihan pembayaran anggota di atas iuran periode. Dipakai otomatis untuk iuran periode berikutnya, atau dikembalikan bila anggota tidak ikut.' },
  { group: 'Iuran dan tuan rumah', term: 'Pengembalian titipan', meaning: 'Titipan dikembalikan ke anggota yang tidak ikut periode berikutnya. Tidak bisa dikoreksi.' },
  { group: 'Iuran dan tuan rumah', term: 'Pertemuan', meaning: 'Satu kali berkumpul di rumah tuan rumah.' },
  { group: 'Iuran dan tuan rumah', term: 'Tuan rumah', meaning: 'Anggota yang rumahnya dipakai untuk pertemuan itu. Menerima bayaran tuan rumah.' },
  { group: 'Iuran dan tuan rumah', term: 'Bayaran tuan rumah', meaning: 'Uang untuk tuan rumah: Rp10.000 dikali jumlah anggota.' },
  { group: 'Iuran dan tuan rumah', term: 'Pembayaran tuan rumah', meaning: 'Pencatatan bahwa bayaran sudah diberikan ke tuan rumah.' },
  { group: 'Iuran dan tuan rumah', term: 'Dipotong dari bayaran tuan rumah', meaning: 'Tunggakan iuran tuan rumah yang diambil dari bayarannya, jadi uang yang diterima lebih kecil.' },
  { group: 'Iuran dan tuan rumah', term: 'Lunas lewat potongan', meaning: 'Iuran yang lunas karena dipotong dari bayaran tuan rumah.' },
  { group: 'Iuran dan tuan rumah', term: 'Lunas lewat titipan', meaning: 'Iuran yang lunas karena memakai titipan anggota.' },
  { group: 'Iuran dan tuan rumah', term: 'Baru sebagian', meaning: 'Iuran pertemuan itu baru terbayar sebagian, lewat titipan atau potongan.' },
  { group: 'Iuran dan tuan rumah', term: 'Tutup pertemuan', meaning: 'Menandai pertemuan selesai. Setelah itu tuan rumah dan tanggalnya tidak bisa diubah, dan catatan yang salah hanya bisa dikoreksi.' },
  { group: 'Periode dan anggota', term: 'Periode', meaning: 'Satu putaran penuh: berlangsung sampai setiap anggota menjadi tuan rumah satu kali.' },
  { group: 'Periode dan anggota', term: 'Aktif', meaning: 'Periode yang masih berjalan. Hanya boleh ada satu.' },
  { group: 'Periode dan anggota', term: 'Berakhir', meaning: 'Periode yang sudah ditutup. Catatannya tersimpan. Pembayaran dan koreksi baru tidak diterima di periode ini.' },
  { group: 'Periode dan anggota', term: 'Akhiri periode', meaning: 'Menutup periode. Tunggakan yang tersisa ditanggung kas. Tidak bisa dibatalkan.' },
  { group: 'Periode dan anggota', term: 'Tunggakan ditanggung kas', meaning: 'Iuran yang tidak dibayar sampai periode berakhir. Dihapus dari catatan anggota dan ditanggung kas, tanpa mengubah saldo kas.' },
  { group: 'Periode dan anggota', term: 'Arsipkan anggota', meaning: 'Menyembunyikan anggota dari daftar dan pilihan baru. Riwayatnya tetap ada dan bisa diaktifkan lagi.' },
  { group: 'Periode dan anggota', term: 'Hapus anggota', meaning: 'Menghapus anggota yang belum punya catatan apa pun. Tidak bisa dibatalkan.' },
  { group: 'Catatan dan cadangan', term: 'Catat kas', meaning: 'Halaman untuk mencatat saldo awal, pindah saldo, pinjaman, pelunasan, dan pengeluaran bersama.' },
  { group: 'Catatan dan cadangan', term: 'Riwayat', meaning: 'Daftar semua uang masuk dan keluar, dari yang terbaru.' },
  { group: 'Catatan dan cadangan', term: 'Koreksi', meaning: 'Cara memperbaiki catatan yang salah. Catatan lama ditandai Dikoreksi dan tidak dihitung, lalu dicatat yang benar. Catatan lama tidak dihapus.' },
  { group: 'Catatan dan cadangan', term: 'Dikoreksi', meaning: 'Catatan lama yang sudah dibatalkan oleh koreksi.' },
  { group: 'Catatan dan cadangan', term: 'Berlaku', meaning: 'Catatan yang masih berlaku dan dihitung.' },
  { group: 'Catatan dan cadangan', term: 'Tanpa perubahan kas', meaning: 'Catatan yang tidak mengubah Tunai + Debit, seperti pindah saldo dan tunggakan ditanggung kas. Kolom ini ada di berkas CSV Buku kas.' },
  { group: 'Catatan dan cadangan', term: 'Cadangan', meaning: 'Salinan semua data Mas Catat yang disimpan terpisah, agar aman bila HP hilang.' },
  { group: 'Catatan dan cadangan', term: 'Salinan pengaman', meaning: 'Salinan otomatis sebelum data diganti, supaya bisa dikembalikan bila ada masalah.' },
  { group: 'Catatan dan cadangan', term: 'Pulihkan', meaning: 'Mengganti semua data di HP ini dengan isi berkas cadangan. Data tidak digabung.' },
  { group: 'Catatan dan cadangan', term: 'Mulai dari nol', meaning: 'Menghapus semua data dan memulai kosong. Salinan pengaman dibuat lebih dulu.' },
  { group: 'Catatan dan cadangan', term: 'Berkas CSV', meaning: 'Tabel untuk dibuka di Excel atau Google Sheets. Bukan cadangan dan tidak bisa dipulihkan.' },
];

/** Entries grouped in display order (the order of first appearance in GLOSSARY). */
export function glossaryGroups(): { group: string; entries: GlossaryEntry[] }[] {
  const groups: { group: string; entries: GlossaryEntry[] }[] = [];
  for (const entry of GLOSSARY) {
    let found = groups.find((g) => g.group === entry.group);
    if (!found) {
      found = { group: entry.group, entries: [] };
      groups.push(found);
    }
    found.entries.push(entry);
  }
  return groups;
}
