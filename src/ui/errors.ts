// The ONE place where English error messages from the data and domain layers become Indonesian UI text.
// Repositories and domain functions throw English messages (for logs and tests); screens call toIndonesian().
import { MigrationError, RepositoryError } from '@/db/errors';
import { DomainError } from '@/domain/money';

export const GENERIC_ERROR = 'Terjadi kesalahan. Coba lagi.';

// First match wins. Patterns match the English messages thrown in src/db and src/domain.
const RULES: readonly { pattern: RegExp; text: string }[] = [
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
];

/** Maps any thrown value to a short Indonesian message. Unknown errors get a generic message (never raw English). */
export function toIndonesian(error: unknown): string {
  if (error instanceof MigrationError) return 'Database gagal disiapkan. Tutup lalu buka lagi aplikasinya.';
  if (error instanceof RepositoryError || error instanceof DomainError) {
    const rule = RULES.find((r) => r.pattern.test(error.message));
    return rule ? rule.text : GENERIC_ERROR;
  }
  return GENERIC_ERROR;
}
