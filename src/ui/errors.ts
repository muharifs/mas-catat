// The ONE place where English error messages from the data and domain layers become Indonesian UI text.
// Repositories and domain functions throw English messages (for logs and tests); screens call toIndonesian().
import { MigrationError, RepositoryError } from '@/db/errors';
import { BackupError, type BackupErrorCode } from '@/domain/backup';
import { DomainError } from '@/domain/money';
import { formatRupiah } from './format';

export const GENERIC_ERROR = 'Terjadi kesalahan. Coba lagi.';

// First match wins. Patterns match the English messages thrown in src/db and src/domain.
const RULES: readonly { pattern: RegExp; text: string | ((match: RegExpMatchArray) => string) }[] = [
  { pattern: /member name must not be empty/, text: 'Nama anggota tidak boleh kosong.' },
  { pattern: /member name already exists/, text: 'Nama anggota sudah ada. Pakai nama lain.' },
  { pattern: /period name must not be empty/, text: 'Nama periode tidak boleh kosong.' },
  { pattern: /memberIds must list each member exactly once/, text: 'Setiap anggota hanya boleh dipilih satu kali.' },
  { pattern: /another period is still active/, text: 'Masih ada periode yang aktif. Akhiri dulu sebelum membuat periode baru.' },
  { pattern: /period still has open weeks/, text: 'Periode belum bisa diakhiri karena masih ada pertemuan yang belum ditutup.' },
  { pattern: /is already closed/, text: 'Periode ini sudah berakhir.' },
  { pattern: /end date is before the start date/, text: 'Tanggal berakhir tidak boleh sebelum tanggal mulai periode.' },
  { pattern: /week \d+ is closed; its host cannot be changed/, text: 'Pertemuan yang sudah ditutup tidak bisa diubah tuan rumah atau tanggalnya.' },
  { pattern: /outside the selectable window/, text: 'Tuan rumah hanya bisa diatur untuk pertemuan saat ini dan pertemuan berikutnya.' },
  { pattern: /already hosted a closed week/, text: 'Anggota ini sudah pernah jadi tuan rumah pada pertemuan yang ditutup.' },
  { pattern: /week \d+ has no host/, text: 'Pertemuan ini belum punya tuan rumah. Tentukan dulu tuan rumahnya.' },
  { pattern: /meeting date is not a real calendar date/, text: 'Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.' },
  { pattern: /meeting date must be later than the previous/, text: 'Tanggal harus setelah tanggal pertemuan sebelumnya.' },
  { pattern: /meeting date must be earlier than the next/, text: 'Tanggal harus sebelum tanggal pertemuan berikutnya. Ubah dulu tanggal pertemuan berikutnya.' },
  { pattern: /meeting dates must stay in order/, text: 'Tanggal pertemuan harus berurutan, makin lama makin akhir.' },
  { pattern: /cannot swap a week with itself/, text: 'Pilih dua pertemuan yang berbeda.' },
  { pattern: /week \d+ not found/, text: 'Pertemuan tidak ditemukan.' },
  { pattern: /member .* not found/, text: 'Anggota tidak ditemukan.' },
  { pattern: /period .* not found/, text: 'Periode tidak ditemukan.' },
  { pattern: /(start|end)Date is not a real calendar date/, text: 'Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.' },
  { pattern: /must be an ISO date/, text: 'Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.' },
  { pattern: /memberCount must be a positive integer/, text: 'Pilih minimal satu anggota.' },
  { pattern: /has ended; payments are not accepted/, text: 'Periode sudah berakhir. Pembayaran tidak bisa dicatat.' },
  { pattern: /payment date is in the future/, text: 'Tanggal pembayaran tidak boleh di masa depan.' },
  { pattern: /payment date is not a real calendar date/, text: 'Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.' },
  { pattern: /receiving account must be/, text: 'Pilih tempat uang masuk: Tunai atau Debit.' },
  { pattern: /no open week left to close/, text: 'Semua pertemuan sudah ditutup.' },
  { pattern: /must be a positive multiple of/, text: 'Jumlah pembayaran harus kelipatan Rp15.000.' },
  { pattern: /correction reason is required/, text: 'Alasan koreksi wajib diisi.' },
  { pattern: /is already corrected/, text: 'Catatan ini sudah pernah dikoreksi.' },
  { pattern: /a reversal cannot be reversed/, text: 'Koreksi tidak bisa dikoreksi lagi. Catat ulang transaksi yang benar.' },
  { pattern: /cannot be corrected here/, text: 'Catatan ini tidak bisa dikoreksi dari sini. Pembayaran anggota dikoreksi di halaman anggota, pembayaran tuan rumah di halaman bayar tuan rumah.' },
  { pattern: /has ended; a correction is not allowed/, text: 'Koreksi hanya bisa dilakukan pada periode yang masih aktif.' },
  { pattern: /has ended; a host payout is not allowed/, text: 'Periode sudah berakhir. Tuan rumah tidak bisa dibayar lagi.' },
  { pattern: /payout account must be/, text: 'Pilih sumber uang: Tunai atau Debit.' },
  { pattern: /entry date is in the future/, text: 'Tanggal tidak boleh di masa depan.' },
  { pattern: /entry date is not a real calendar date/, text: 'Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.' },
  { pattern: /cannot be paid out yet/, text: 'Tuan rumah hanya bisa dibayar untuk pertemuan saat ini atau pertemuan yang sudah ditutup.' },
  { pattern: /already has a host payout/, text: 'Pertemuan ini sudah dibayarkan ke tuan rumah. Koreksi dulu jika salah.' },
  { pattern: /no host payout to correct/, text: 'Pertemuan ini belum punya pembayaran tuan rumah yang bisa dikoreksi.' },
  { pattern: /payment .* not found/, text: 'Pembayaran tidak ditemukan.' },
  { pattern: /ledger entry .* not found/, text: 'Catatan kas tidak ditemukan.' },
  { pattern: /has no ledger entry to reverse/, text: 'Pembayaran lama ini tidak punya catatan kas, jadi tidak bisa dikoreksi otomatis.' },
  { pattern: /no period exists yet/, text: 'Belum ada periode. Buat periode dulu.' },
  { pattern: /no active period/, text: 'Tidak ada periode aktif. Buat atau mulai periode dulu.' },
  { pattern: /end date is in the future/, text: 'Tanggal berakhir tidak boleh di masa depan.' },
  { pattern: /have no host payout in force/, text: 'Periode belum bisa diakhiri karena masih ada tuan rumah yang belum dibayar. Bayar dulu semua tuan rumah.' },
  { pattern: /nothing to refund/, text: 'Anggota ini tidak punya titipan yang bisa dikembalikan.' },
  { pattern: /has not ended; its credit cannot be refunded/, text: 'Titipan periode yang masih aktif belum bisa dikembalikan. Akhiri periodenya dulu.' },
  { pattern: /refund account must be/, text: 'Pilih sumber uang: Tunai atau Debit.' },
  { pattern: /transfer must go between|a move entry needs two different pos/, text: 'Pindah saldo hanya antara Tunai dan Debit, dan keduanya harus berbeda.' },
  { pattern: /a loan must be paid from|shared goal spending must come from/, text: 'Pilih sumber uang: Tunai atau Debit.' },
  { pattern: /an opening balance in piutang needs a member/, text: 'Pilih anggota yang punya pinjaman lama ini.' },
  { pattern: /needs a member/, text: 'Pilih anggota.' },
  { pattern: /shared goal needs a note/, text: 'Catatan wajib diisi untuk pengeluaran bersama.' },
  { pattern: /opening balance needs a pos/, text: 'Pilih pos.' },
  { pattern: /the member has no outstanding loan/, text: 'Anggota ini tidak punya sisa pinjaman, jadi tidak ada yang bisa dilunasi.' },
  { pattern: /repayment \d+ is above the remaining loan (\d+)/, text: (m) => `Jumlah melebihi sisa pinjaman (${formatRupiah(Number(m[1]))}). Kurangi jumlah.` },
  {
    pattern: /loan cannot be corrected: the member already repaid (\d+)/,
    text: (m) => `Pinjaman ini sudah dibayar ${formatRupiah(Number(m[1]))}. Koreksi pelunasannya dulu, baru koreksi pinjamannya.`,
  },
  { pattern: /amount must be a positive integer/, text: 'Jumlah harus lebih dari nol.' },
];

// Backup and restore problems (M7), by code. No file path or file name is ever put in these texts.
export const BACKUP_ERROR_TEXT: Record<BackupErrorCode, string> = {
  file_empty: 'Berkas kosong. Pilih berkas cadangan yang benar.',
  file_too_small: 'Berkas terlalu kecil untuk menjadi cadangan Mas Catat.',
  file_too_large: 'Berkas terlalu besar (lebih dari 50 MB), jadi bukan cadangan Mas Catat.',
  not_sqlite: 'Berkas ini bukan cadangan Mas Catat.',
  size_mismatch: 'Berkas cadangan rusak atau terpotong. Ambil lagi salinan cadangan yang utuh.',
  version_missing: 'Berkas ini bukan cadangan Mas Catat (versinya tidak dikenal).',
  version_newer: 'Cadangan ini dibuat oleh aplikasi yang lebih baru. Perbarui aplikasi dulu.',
  tables_missing: 'Isi berkas tidak lengkap, jadi tidak bisa dipakai.',
  schema_mismatch: 'Susunan data berkas ini tidak cocok dengan Mas Catat, jadi ditolak demi keamanan.',
  integrity: 'Berkas cadangan rusak: pemeriksaan keutuhan gagal.',
  foreign_keys: 'Data dalam berkas tidak konsisten: ada catatan yang merujuk ke data yang tidak ada.',
  invariant: 'Angka dalam berkas tidak cocok dengan aturan iuran, jadi ditolak.',
  unreadable: 'Berkas tidak bisa dibaca. Pastikan itu berkas cadangan Mas Catat yang utuh.',
  busy: 'Proses lain masih berjalan. Tunggu sebentar.',
  safety_failed: 'Salinan pengaman gagal dibuat, jadi data Anda tidak diubah sama sekali. Periksa ruang penyimpanan lalu coba lagi.',
  restore_failed: 'Pemulihan gagal dan data lama tidak berhasil dikembalikan otomatis. Jangan buat catatan baru. Salinan pengaman masih tersimpan dan bisa dipulihkan dari layar Pulihkan Data.',
  share_unavailable: 'Menu bagikan tidak tersedia di HP ini.',
};

/** Maps any thrown value to a short Indonesian message. Unknown errors get a generic message (never raw English). */
export function toIndonesian(error: unknown): string {
  if (error instanceof BackupError) return BACKUP_ERROR_TEXT[error.code];
  if (error instanceof MigrationError) return 'Database gagal disiapkan. Tutup lalu buka lagi aplikasinya.';
  if (error instanceof RepositoryError || error instanceof DomainError) {
    for (const rule of RULES) {
      const match = error.message.match(rule.pattern);
      if (match) return typeof rule.text === 'function' ? rule.text(match) : rule.text;
    }
    return GENERIC_ERROR;
  }
  return GENERIC_ERROR;
}

/**
 * After a failed restore: must every screen be rebuilt? Only when the live data is certainly untouched
 * (no safety copy could be made, or another job is running) can the screens stay. Any other error may have
 * happened after the data changed, so the screens must reload.
 */
export function restoreErrorNeedsReload(error: unknown): boolean {
  return !(error instanceof BackupError && (error.code === 'safety_failed' || error.code === 'busy'));
}
