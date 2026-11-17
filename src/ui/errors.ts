// The ONE place where English error messages from the data and domain layers become Indonesian UI text.
// Repositories and domain functions throw English messages (for logs and tests); screens call toIndonesian().
import { MigrationError, RepositoryError } from '@/db/errors';
import { BackupError, type BackupErrorCode } from '@/domain/backup';
import { CashCountError, type CashCountErrorCode } from '@/domain/cash-count';
import { MemberArchiveError, type ArchiveBlockCode } from '@/domain/members';
import { DomainError } from '@/domain/money';
import { PaymentHostPayoutStandsError } from '@/domain/payment-correction';
import { HostPayoutStandsError } from '@/domain/schedule';
import { formatRupiah } from './format';

/** Shown when a host change is refused because the host payout of that meeting stands. */
export const HOST_PAYOUT_STANDS_TEXT = 'Tuan rumah sudah dibayar. Koreksi pembayarannya dulu untuk mengganti tuan rumah.';

/** Shown when a payment correction is refused because that member's own host payout stands (also the reason on the disabled button). */
export const PAYMENT_HOST_PAYOUT_STANDS_TEXT = 'Pembayaran tuan rumah untuk anggota ini sudah dicatat. Koreksi pembayaran tuan rumah dulu.';

/** Shown when a skip is refused because the host payout of that meeting stands (decision 33). */
export const SKIP_PAYOUT_STANDS_TEXT =
  'Pembayaran tuan rumah pertemuan ini sudah dicatat. Koreksi pembayarannya dulu, lalu lewati pertemuan.';

/** Unknown error while reading data (a screen could not load). Reading never changes data, so it says so. */
export const GENERIC_LOAD_ERROR =
  'Terjadi kesalahan yang tidak dikenal. Coba lagi. Jika tetap gagal, tutup aplikasi sepenuhnya lalu buka lagi. Data tidak berubah.';

/** Where an error happened. Unknown errors get one message per context, so the text says what did NOT happen. */
export type ErrorContext =
  | 'load'
  | 'save'
  | 'preview'
  | 'archive'
  | 'unarchive'
  | 'delete_member'
  | 'close_week'
  | 'close_period'
  | 'skip_week'
  | 'unskip_week'
  | 'cash_count'
  | 'correct'
  | 'refund'
  | 'share'
  | 'share_safety'
  | 'restore_check'
  | 'restore';

/**
 * Unknown-error text per context. All writes run in a database transaction, so a failure means nothing was written.
 * 'restore' deliberately does NOT claim the data is unchanged: an unknown error cannot be proven to precede the swap.
 */
export const CONTEXT_ERROR_TEXT: Record<ErrorContext, string> = {
  load: GENERIC_LOAD_ERROR,
  save: 'Catatan belum tersimpan. Tidak ada data yang berubah. Coba lagi. Jika tetap gagal, tutup aplikasi sepenuhnya lalu buka lagi.',
  preview: 'Rincian belum bisa dihitung. Belum ada yang tersimpan. Ubah isian atau buka ulang halaman ini, lalu coba lagi.',
  archive: 'Anggota belum diarsipkan. Tidak ada data yang berubah. Coba lagi.',
  unarchive: 'Anggota belum diaktifkan lagi. Tidak ada data yang berubah. Coba lagi.',
  delete_member: 'Anggota belum dihapus. Tidak ada data yang berubah. Coba lagi.',
  close_week: 'Pertemuan belum ditutup. Tidak ada data yang berubah. Coba lagi.',
  close_period: 'Periode belum diakhiri. Tidak ada data yang berubah. Coba lagi. Jika tetap gagal, tutup aplikasi sepenuhnya lalu buka lagi.',
  skip_week: 'Pertemuan belum dilewati. Tidak ada data yang berubah. Coba lagi.',
  unskip_week: 'Pelewatan belum dibatalkan. Tidak ada data yang berubah. Coba lagi.',
  cash_count: 'Hitungan belum tersimpan. Tidak ada data yang berubah. Coba lagi.',
  correct: 'Koreksi belum tersimpan. Catatan asli tidak berubah. Coba lagi.',
  refund: 'Pengembalian belum tersimpan. Tidak ada uang yang dicatat keluar. Coba lagi.',
  share: 'Berkas belum bisa dibagikan. Data di HP ini tidak berubah. Coba lagi. Jika tetap gagal, tutup aplikasi sepenuhnya lalu buka lagi.',
  share_safety: 'Salinan pengaman belum bisa dibagikan, tetapi tetap tersimpan di HP ini.',
  restore_check: 'Berkas belum bisa diperiksa. Data di HP ini tidak berubah. Coba lagi, atau pilih berkas cadangan yang lain.',
  restore:
    'Pemulihan tidak selesai karena kesalahan yang tidak dikenal. Data di HP ini kemungkinan belum berubah, tetapi belum bisa dipastikan. Periksa Beranda dan Laporan. Jika ada angka yang janggal, buka Cadangan, lalu Pulihkan dari cadangan, dan pilih salinan pengaman terbaru.',
};

// First match wins. Patterns match the English messages thrown in src/db and src/domain.
const RULES: readonly { pattern: RegExp; text: string | ((match: RegExpMatchArray) => string) }[] = [
  // Skip the last meeting (decision 33). Before the general rules below: "have no host payout in force", "week N not
  // found", "is already closed" and "has ended; ..." would otherwise take these messages first.
  { pattern: /only the last meeting can be skipped/, text: 'Hanya pertemuan terakhir yang bisa dilewati.' },
  { pattern: /week (\d+) is not the oldest open meeting; it cannot be skipped/, text: (m) => `Pertemuan ${m[1]} belum bisa dilewati. Tutup dulu pertemuan sebelumnya.` },
  { pattern: /cannot skip: closed meetings have no host payout in force/, text: 'Belum bisa dilewati: masih ada tuan rumah yang belum dibayar. Bayar dulu semuanya.' },
  { pattern: /week \d+ has a standing host payout; it cannot be skipped/, text: SKIP_PAYOUT_STANDS_TEXT },
  { pattern: /week \d+ is already skipped/, text: 'Pertemuan ini sudah dilewati.' },
  { pattern: /week \d+ is not skipped/, text: 'Pertemuan ini tidak sedang dilewati.' },
  { pattern: /period .* has ended; a skip cannot be changed/, text: 'Periode sudah berakhir. Pelewatan tidak bisa diubah lagi.' },
  { pattern: /skip cancel reason is required/, text: 'Alasan pembatalan wajib diisi.' },
  { pattern: /skip reason is required/, text: 'Alasan melewati pertemuan wajib diisi.' },
  { pattern: /week \d+ is skipped; its host and date cannot be changed/, text: 'Pertemuan yang dilewati tidak bisa diubah tuan rumah atau tanggalnya. Batalkan dulu pelewatannya.' },
  { pattern: /week \d+ is skipped; it has no host payout/, text: 'Pertemuan yang dilewati tidak ada pembayaran tuan rumah.' },
  { pattern: /week \d+ is skipped; it cannot be closed/, text: 'Pertemuan yang dilewati tidak perlu ditutup.' },
  { pattern: /week \d+ is closed; it cannot be skipped|week \d+ is closed; its skip cannot be undone/, text: 'Pertemuan yang sudah ditutup tidak bisa dilewati atau dibuka lagi.' },
  { pattern: /needs at least \d+ members to skip/, text: 'Periode dengan satu anggota tidak bisa melewati pertemuan.' },
  { pattern: /skip cannot be undone: member .* negative credit/, text: 'Pelewatan belum bisa dibatalkan: titipan yang dilepas dari pertemuan ini sudah dikembalikan kepada anggota.' },
  { pattern: /member name must not be empty/, text: 'Nama anggota tidak boleh kosong.' },
  { pattern: /member name already exists/, text: 'Nama ini sudah dipakai (mungkin oleh anggota yang diarsipkan). Gunakan nama lain.' },
  { pattern: /period name must not be empty/, text: 'Nama periode tidak boleh kosong.' },
  { pattern: /memberIds must list each member exactly once/, text: 'Setiap anggota hanya boleh dipilih satu kali.' },
  { pattern: /another period is still active/, text: 'Masih ada periode yang aktif. Akhiri dulu sebelum membuat periode baru.' },
  { pattern: /period still has open weeks/, text: 'Periode belum bisa diakhiri karena masih ada pertemuan yang belum ditutup. Tutup dulu semua pertemuan.' },
  { pattern: /is already closed/, text: 'Periode ini sudah berakhir.' },
  { pattern: /end date is before the start date/, text: 'Tanggal berakhir tidak boleh sebelum tanggal mulai periode.' },
  { pattern: /week \d+ is closed; its host cannot be changed/, text: 'Pertemuan yang sudah ditutup tidak bisa diubah tuan rumah atau tanggalnya.' },
  { pattern: /outside the selectable window/, text: 'Tuan rumah hanya bisa diatur untuk pertemuan saat ini dan pertemuan berikutnya.' },
  { pattern: /already hosted a closed week/, text: 'Anggota ini sudah pernah jadi tuan rumah pada pertemuan yang ditutup.' },
  { pattern: /week \d+ has no host/, text: 'Pertemuan ini belum punya tuan rumah. Tentukan dulu tuan rumahnya.' },
  { pattern: /meeting date is not a real calendar date/, text: 'Tanggal tidak valid. Pilih tanggal dari kalender.' },
  { pattern: /meeting date must be later than the previous/, text: 'Tanggal harus setelah tanggal pertemuan sebelumnya.' },
  { pattern: /meeting date must be earlier than the next/, text: 'Tanggal harus sebelum tanggal pertemuan berikutnya. Ubah dulu tanggal pertemuan berikutnya.' },
  { pattern: /meeting dates must stay in order/, text: 'Tanggal pertemuan harus berurutan, makin lama makin akhir.' },
  { pattern: /cannot swap a week with itself/, text: 'Pilih dua pertemuan yang berbeda.' },
  { pattern: /week \d+ not found/, text: 'Pertemuan tidak ditemukan.' },
  { pattern: /member .* not found/, text: 'Anggota tidak ditemukan.' },
  { pattern: /period .* not found/, text: 'Periode tidak ditemukan.' },
  { pattern: /(start|end)Date is not a real calendar date/, text: 'Tanggal tidak valid. Pilih tanggal dari kalender.' },
  { pattern: /must be an ISO date/, text: 'Tanggal tidak valid. Pilih tanggal dari kalender.' },
  { pattern: /memberCount must be a positive integer/, text: 'Pilih minimal satu anggota.' },
  { pattern: /has ended; payments are not accepted/, text: 'Periode sudah berakhir. Pembayaran tidak bisa dicatat.' },
  { pattern: /payment date is in the future/, text: 'Tanggal pembayaran tidak boleh di masa depan. Pilih hari ini atau sebelumnya.' },
  { pattern: /payment date is not a real calendar date/, text: 'Tanggal tidak valid. Pilih tanggal dari kalender.' },
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
  { pattern: /entry date is in the future/, text: 'Tanggal tidak boleh di masa depan. Pilih hari ini atau sebelumnya.' },
  { pattern: /entry date is not a real calendar date/, text: 'Tanggal tidak valid. Pilih tanggal dari kalender.' },
  { pattern: /cannot be paid out yet/, text: 'Tuan rumah hanya bisa dibayar untuk pertemuan saat ini atau pertemuan yang sudah ditutup.' },
  { pattern: /already has a host payout/, text: 'Pertemuan ini sudah dibayarkan ke tuan rumah. Koreksi dulu jika salah.' },
  { pattern: /no host payout to correct/, text: 'Pertemuan ini belum punya pembayaran tuan rumah yang bisa dikoreksi.' },
  { pattern: /payment .* not found/, text: 'Pembayaran tidak ditemukan.' },
  { pattern: /ledger entry .* not found/, text: 'Catatan kas tidak ditemukan.' },
  { pattern: /has no ledger entry to reverse/, text: 'Pembayaran lama ini tidak punya catatan kas, jadi tidak bisa dikoreksi otomatis. Catat ulang pembayarannya bila perlu.' },
  { pattern: /no period exists yet/, text: 'Belum ada periode. Buat periode dulu.' },
  { pattern: /no active period/, text: 'Tidak ada periode aktif. Buat periode dulu.' },
  { pattern: /end date is in the future/, text: 'Tanggal berakhir tidak boleh di masa depan. Pilih hari ini atau sebelumnya.' },
  { pattern: /have no host payout in force/, text: 'Periode belum bisa diakhiri karena masih ada tuan rumah yang belum dibayar. Bayar dulu semua tuan rumah.' },
  { pattern: /nothing to refund/, text: 'Anggota ini tidak punya titipan yang bisa dikembalikan.' },
  { pattern: /has not ended; its credit cannot be refunded/, text: 'Titipan periode yang masih aktif belum bisa dikembalikan. Akhiri periodenya dulu.' },
  { pattern: /refund account must be/, text: 'Pilih sumber uang: Tunai atau Debit.' },
  { pattern: /transfer must go between|a move entry needs two different pos/, text: 'Pindah saldo hanya antara Tunai dan Debit, dan keduanya harus berbeda.' },
  { pattern: /a loan must be paid from|shared goal spending must come from/, text: 'Pilih sumber uang: Tunai atau Debit.' },
  { pattern: /an opening balance in piutang needs a member/, text: 'Pilih anggota yang punya pinjaman lama ini.' },
  { pattern: /needs a member/, text: 'Pilih anggota.' },
  { pattern: /shared goal needs a note/, text: 'Catatan wajib diisi untuk pengeluaran bersama.' },
  { pattern: /opening balance needs a pos/, text: 'Pilih Tunai, Debit, atau Piutang.' },
  { pattern: /the member has no outstanding loan/, text: 'Anggota ini tidak punya sisa pinjaman, jadi tidak ada yang bisa dilunasi.' },
  { pattern: /repayment \d+ is above the remaining loan (\d+)/, text: (m) => `Jumlah melebihi sisa pinjaman (${formatRupiah(Number(m[1]))}). Kurangi jumlah.` },
  {
    pattern: /loan cannot be corrected: the member already repaid (\d+)/,
    text: (m) => `Pinjaman ini sudah dikembalikan ${formatRupiah(Number(m[1]))}. Koreksi pelunasannya dulu, baru koreksi pinjamannya.`,
  },
  { pattern: /has history and cannot be deleted/, text: 'Anggota ini punya riwayat, jadi tidak bisa dihapus. Arsipkan saja.' },
  { pattern: /archived and cannot join a period|archived member cannot join/, text: 'Anggota yang diarsipkan tidak bisa ikut periode. Aktifkan lagi dulu di halaman Anggota.' },
  { pattern: /cannot be archived/, text: 'Belum bisa diarsipkan: masih ikut periode aktif. Arsipkan setelah periodenya berakhir.' },
  { pattern: /amount must be a positive integer/, text: 'Jumlah harus lebih dari nol.' },
];

// Backup and restore problems (M7), by code. No file path or file name is ever put in these texts.
export const BACKUP_ERROR_TEXT: Record<BackupErrorCode, string> = {
  file_empty: 'Berkas kosong. Pilih berkas cadangan yang benar.',
  file_too_small: 'Berkas terlalu kecil untuk menjadi cadangan Mas Catat. Pilih berkas cadangan yang lain.',
  file_too_large: 'Berkas terlalu besar (lebih dari 50 MB), jadi bukan cadangan Mas Catat. Pilih berkas cadangan yang lain.',
  not_sqlite: 'Berkas ini bukan cadangan Mas Catat. Pilih berkas cadangan yang lain.',
  size_mismatch: 'Berkas cadangan rusak atau terpotong. Ambil lagi salinan cadangan yang utuh.',
  version_missing: 'Berkas ini bukan cadangan Mas Catat (versinya tidak dikenal). Pilih berkas cadangan yang lain.',
  version_newer: 'Cadangan ini dibuat oleh aplikasi yang lebih baru. Perbarui aplikasi dulu.',
  tables_missing: 'Isi berkas tidak lengkap, jadi tidak bisa dipakai. Pilih berkas cadangan yang lain.',
  schema_mismatch: 'Susunan data berkas ini tidak cocok dengan Mas Catat, jadi ditolak demi keamanan. Pilih berkas cadangan yang lain.',
  integrity: 'Berkas cadangan rusak: pemeriksaan keutuhan gagal. Pilih berkas cadangan yang lain.',
  foreign_keys: 'Data di dalam berkas saling tidak cocok (ada catatan yang tidak punya induknya). Pilih berkas cadangan yang lain.',
  invariant: 'Angka di dalam berkas tidak cocok dengan hitungan iuran, jadi tidak dipakai. Pilih berkas cadangan yang lain.',
  unreadable: 'Berkas tidak bisa dibaca. Pastikan itu berkas cadangan Mas Catat yang utuh.',
  busy: 'Proses lain masih berjalan. Tunggu sebentar, lalu coba lagi.',
  safety_failed: 'Data tidak berubah. Salinan pengaman gagal dibuat, mungkin karena ruang penyimpanan penuh atau data lama tidak terbaca, jadi pemulihan dibatalkan. Periksa ruang penyimpanan lalu coba lagi.',
  restore_failed: 'Pemulihan gagal dan data lama tidak berhasil dikembalikan otomatis. Jangan buat catatan baru. Salinan pengaman masih tersimpan dan bisa dipulihkan lewat Cadangan, lalu Pulihkan dari cadangan.',
  share_unavailable: 'Fitur berbagi tidak tersedia di HP ini, jadi berkas tidak bisa dikirim.',
};

// Messages raised by the database triggers of migrations 0005 and 0006. They are the last line of defence and should be
// unreachable (the domain and repository check first), but when one fires the driver throws a plain Error.
const TRIGGER_RULES: readonly { pattern: RegExp; text: string }[] = [
  { pattern: /only a meeting of the active period can be skipped|a skip can only be undone while the period is active/, text: 'Periode sudah berakhir. Pelewatan tidak bisa diubah lagi.' },
  { pattern: /only the last meeting can be skipped/, text: 'Hanya pertemuan terakhir yang bisa dilewati.' },
  { pattern: /every earlier meeting must be closed before the last one is skipped/, text: 'Tutup dulu pertemuan sebelumnya sebelum melewati pertemuan terakhir.' },
  { pattern: /a meeting with a host payout in force cannot be skipped/, text: SKIP_PAYOUT_STANDS_TEXT },
  { pattern: /this meeting is already skipped/, text: 'Pertemuan ini sudah dilewati.' },
  { pattern: /a skipped meeting has no|host and date of a skipped meeting cannot change/, text: 'Pertemuan yang dilewati tidak bisa diubah. Batalkan dulu pelewatannya.' },
  { pattern: /member of the active period cannot be archived/, text: 'Anggota masih ikut periode aktif, jadi belum bisa diarsipkan.' },
  { pattern: /archived member cannot join a period/, text: 'Anggota yang diarsipkan tidak bisa ikut periode. Aktifkan lagi dulu di halaman Anggota.' },
];

/** Why a member cannot be archived, in plain words. */
export function archiveBlockText(code: ArchiveBlockCode, amount: number): string {
  if (code === 'in_active_period') return 'Belum bisa diarsipkan: masih ikut periode aktif. Arsipkan setelah periodenya berakhir.';
  if (code === 'has_loan') return `Belum bisa diarsipkan: masih punya sisa pinjaman ${formatRupiah(amount)}. Lunasi dulu di Pinjaman anggota.`;
  return `Belum bisa diarsipkan: masih punya titipan ${formatRupiah(amount)}. Kembalikan dulu di Titipan anggota.`;
}

/** Texts of the cash count rules (decision 34), by error code. */
export const CASH_COUNT_ERROR_TEXT: Record<CashCountErrorCode, string> = {
  no_active_period: 'Tidak ada periode aktif, jadi kas belum bisa dicek. Mulai periode dulu.',
  week_not_countable: 'Pertemuan ini belum bisa dicek. Pilih pertemuan yang sedang berjalan atau yang terakhir ditutup.',
  week_skipped: 'Pertemuan ini dilewati, jadi tidak ada uang yang dicek. Pilih pertemuan lain.',
  tunai_required: 'Isi jumlah Tunai dulu. Isi 0 bila tidak ada uang tunai.',
  no_amount: 'Isi jumlah yang dihitung.',
};

/** Maps any thrown value to a short Indonesian message. Unknown errors get a generic message (never raw English). */
export function toIndonesian(error: unknown, context: ErrorContext = 'save'): string {
  const generic = CONTEXT_ERROR_TEXT[context];
  if (error instanceof BackupError) return BACKUP_ERROR_TEXT[error.code];
  if (error instanceof CashCountError) return CASH_COUNT_ERROR_TEXT[error.code];
  if (error instanceof MemberArchiveError) return archiveBlockText(error.code, error.amount);
  if (error instanceof HostPayoutStandsError) return HOST_PAYOUT_STANDS_TEXT;
  if (error instanceof PaymentHostPayoutStandsError) return PAYMENT_HOST_PAYOUT_STANDS_TEXT;
  if (error instanceof MigrationError) return 'Gagal memuat data. Tutup aplikasi sepenuhnya lalu buka lagi. Jika tetap gagal, jangan hapus aplikasi karena data bisa hilang.';
  if (error instanceof RepositoryError || error instanceof DomainError) {
    for (const rule of RULES) {
      const match = error.message.match(rule.pattern);
      if (match) return typeof rule.text === 'function' ? rule.text(match) : rule.text;
    }
    return generic;
  }
  if (error instanceof Error) {
    const trigger = TRIGGER_RULES.find((rule) => rule.pattern.test(error.message));
    if (trigger) return trigger.text;
  }
  return generic;
}

/**
 * After a failed restore: must every screen be rebuilt? Only when the live data is certainly untouched
 * (no safety copy could be made, or another job is running) can the screens stay. Any other error may have
 * happened after the data changed, so the screens must reload.
 */
export function restoreErrorNeedsReload(error: unknown): boolean {
  return !(error instanceof BackupError && (error.code === 'safety_failed' || error.code === 'busy'));
}
