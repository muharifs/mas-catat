// Indonesian texts for the backup, export and restore screens (M7). Display only: every number comes from the
// engine in src/db/backup.ts, nothing is calculated here. The UI says "titipan", never "kredit".
import type { BackupReminder, DbSummary, RestoreClassification } from '@/domain/backup';
import { parseSafetyName, PHRASE_RESET, PHRASE_RESTORE, SAFETY_KEEP } from '@/domain/backup';
import type { RestoreOutcome } from '@/db/backup';
import { formatDate, todayIso } from './dates';
import { formatRupiah } from './format';

/** Shown in a dialog right before the backup goes to the share sheet. */
export const BACKUP_WARNING = 'Berisi nama dan uang anggota. Kirim ke diri sendiri atau Google Drive pribadi.';

export const OFFSITE_HINT =
  'Simpan satu salinan di luar HP ini, misalnya di Google Drive pribadi atau dikirim ke diri sendiri. Jika HP hilang atau rusak, salinan di dalam HP ikut hilang.';

export const ONE_PHONE_HINT =
  'Gunakan satu HP saja. Untuk pindah HP: buat cadangan, pulihkan di HP baru, lalu berhenti memakai HP lama. Data dari dua HP tidak bisa digabung.';

export const CSV_HINT =
  'Berkas CSV hanya untuk dibaca di Excel atau Google Sheets. CSV bukan cadangan dan tidak bisa dipakai untuk memulihkan data. Isinya juga memuat nama dan uang anggota. Di Buku kas, Masuk dan Keluar hanya berisi uang yang benar-benar masuk atau keluar dari Tunai dan Debit. Pindah saldo Tunai dan Debit, penghapusan tunggakan, dan saldo awal Piutang ada di kolom Tanpa perubahan kas.';

export const NO_ENCRYPTION_HINT = 'Cadangan tidak dikunci dengan kata sandi. Siapa pun yang memegang berkasnya bisa membacanya.';

/**
 * "Terakhir mencoba membagikan: 3 Nov 2026 (3 hari lalu)" or "Belum pernah dibagikan". Neutral on purpose: the app
 * only knows the share sheet was closed, not that the file reached anyone.
 */
export function lastSharedText(lastSharedAt: string | null, reminder: BackupReminder): string {
  if (lastSharedAt === null || reminder.daysSince === null) return 'Belum pernah dibagikan';
  const days = reminder.daysSince === 0 ? 'hari ini' : `${reminder.daysSince} hari lalu`;
  return `Terakhir mencoba membagikan: ${formatDate(todayIso(new Date(lastSharedAt)))} (${days}). Pastikan berkasnya benar-benar terkirim.`;
}

/** Text of the reminder on Home. */
export function reminderText(reminder: BackupReminder): string {
  if (reminder.daysSince === null) return 'Data belum pernah dicadangkan. Jika HP hilang atau rusak, semua catatan ikut hilang.';
  return `Cadangan terakhir ${reminder.daysSince} hari lalu. Buat cadangan baru supaya catatan terbaru ikut aman.`;
}

/** What the restore will do to the data, in words. Counts are records (kas entries and payments). */
export function classificationText(c: RestoreClassification): string {
  switch (c.kind) {
    case 'same':
      return 'Isi cadangan sama dengan data di HP ini.';
    case 'newer':
      return `Cadangan ini lebih baru: ${c.added} catatan lebih banyak daripada data di HP ini.`;
    case 'older':
      return `Cadangan ini lebih lama. ${c.lost} catatan di HP ini tidak ada di cadangan dan akan hilang.`;
    case 'diverged':
      return `Isi cadangan ini dan data di HP ini sama-sama punya catatan yang tidak ada di pihak lain. ${c.lost} catatan di HP ini akan hilang, dan HP ini akan memakai ${c.added} catatan dari cadangan.`;
  }
}

/** Bold title of the restore Notice when records would be lost (emphasis by title, not by CAPITAL letters), else undefined. */
export function classificationTitle(c: RestoreClassification): string | undefined {
  return c.kind === 'older' || c.kind === 'diverged' ? 'Sebagian catatan di HP ini akan hilang' : undefined;
}

export interface SummaryRow {
  label: string;
  value: string;
}

/** The numbers the owner compares before a restore. Total kas is Tunai + Debit. */
export function summaryRows(s: DbSummary): SummaryRow[] {
  return [
    { label: 'Catatan kas terakhir', value: s.lastEntryDate ? formatDate(s.lastEntryDate) : '-' },
    { label: 'Jumlah catatan kas', value: String(s.ledgerCount) },
    { label: 'Anggota', value: String(s.memberCount) },
    { label: 'Periode', value: String(s.periodCount) },
    { label: 'Total kas (Tunai + Debit)', value: formatRupiah(s.kas.actual) },
  ];
}

export function safetyCopyLabel(name: string): string {
  const parsed = parseSafetyName(name);
  return parsed ? `Salinan pengaman ${formatDate(parsed.date)} pukul ${parsed.time}` : 'Salinan pengaman';
}

export function phraseInstruction(phrase: string): string {
  return phrase === PHRASE_RESET
    ? `Untuk melanjutkan, ketik ${PHRASE_RESET} di bawah ini.`
    : `Untuk melanjutkan, ketik ${PHRASE_RESTORE} di bawah ini.`;
}

export const restoreTexts = {
  firstDialogTitle: 'Ganti semua data?',
  firstDialogBody:
    'Semua data di HP ini akan diganti dengan isi cadangan. Pemulihan tidak menggabungkan data. Salinan pengaman dari data sekarang dibuat otomatis lebih dulu.',
  secondDialogTitle: 'Yakin?',
  secondDialogBody: 'Setelah ini data di HP ini sama persis dengan cadangan.',
  secondDialogOk: 'Ya, ganti semua data',
  resetWarning:
    'Semua data di HP ini akan dihapus: anggota, periode, pembayaran, dan kas. Aplikasi mulai dari kosong. Salinan pengaman dibuat otomatis lebih dulu, tetapi setelah ini data tidak kembali dengan sendirinya.',
  working: 'Memulihkan data. Jangan tutup aplikasi.',
  done: 'Data berhasil dipulihkan',
  resetDone: 'Aplikasi dimulai dari kosong',
};

/** Extra line under "Mulai dari nol": the safety copy still holds the old data, on this phone. */
export const RESET_SAFETY_NOTE =
  'Salinan pengaman itu berisi data lama dan tetap tersimpan di HP ini, jadi hapus lewat cara lain bila HP akan dipindahtangankan.';

/** Message after a restore that was undone automatically because the new data failed its checks. */
export const ROLLED_BACK_TEXT =
  'Pemulihan tidak lolos pemeriksaan, jadi data lama sudah dikembalikan otomatis. Tidak ada data yang berubah. Coba lagi dengan berkas cadangan yang lain.';

export function safetyOfferText(outcome: RestoreOutcome): string {
  const base = `${safetyCopyLabel(outcome.safetyName)} tersimpan di HP ini (hanya ${SAFETY_KEEP} yang terakhir disimpan).`;
  return `${base} Mau dibagikan ke tempat lain sekarang? ${BACKUP_WARNING}`;
}
