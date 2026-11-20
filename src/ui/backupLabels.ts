// Indonesian texts for the backup, export and restore screens (M7). Display only: every number comes from the
// engine in src/db/backup.ts, nothing is calculated here. The UI says "titipan", never "kredit".
import type { BackupReminder, DbSummary, RestoreClassification } from '@/domain/backup';
import { BackupError, DamagedDatabaseError, parseSafetyName, PHRASE_RESET, PHRASE_RESTORE, SAFETY_KEEP } from '@/domain/backup';
import type { RestoreOutcome } from '@/db/backup';
import { formatDate, formatTime, todayIso } from './dates';
import { restoreErrorNeedsReload } from './errors';
import { formatRupiah } from './format';

/** Shown in a dialog right before the backup goes to the share sheet. */
export const BACKUP_WARNING = 'Berisi nama dan uang anggota. Kirim ke diri sendiri atau Google Drive pribadi.';

/** Shown after a backup was made while the live data failed its health check (M2). The backup is still shared. */
export const BACKUP_UNHEALTHY_TEXT = 'Data di HP ini gagal pemeriksaan; berkas cadangan ini mungkin tidak bisa dipulihkan.';

export const OFFSITE_HINT =
  'Simpan satu salinan di luar HP ini, misalnya di Google Drive pribadi atau dikirim ke diri sendiri. Jika HP hilang atau rusak, salinan di dalam HP ikut hilang.';

export const ONE_PHONE_HINT =
  'Gunakan satu HP saja. Untuk pindah HP: buat cadangan, pulihkan di HP baru, lalu berhenti memakai HP lama. Data dari dua HP tidak bisa digabung.';

export const CSV_HINT =
  'Berkas CSV hanya untuk dibaca di Excel atau Google Sheets. Bukan cadangan dan tidak bisa dipakai untuk memulihkan data. Isinya memuat nama dan uang anggota.';

/** Shown under the Buku kas button only. Mirrors csvAmountColumns (src/domain/flow.ts). */
export const CSV_LEDGER_HINT =
  'Masuk dan Keluar mengikuti perubahan Tunai + Debit untuk semua jenis catatan: pinjaman di Keluar, pelunasan di Masuk, sedangkan pindah saldo, tunggakan ditanggung kas, dan saldo awal Piutang ada di Tanpa perubahan kas. Kolom Dicatat di paling kanan berisi waktu catatan diketik, memakai jam HP ini.';

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
  return 'Buat cadangan baru supaya catatan terbaru ikut aman.';
}

/** Sentence about Cek kas counts (saves, not rows). Empty when no count differs. */
function cashCountSentence(c: RestoreClassification): string {
  if (c.cashCountsLost > 0 && c.cashCountsAdded > 0) {
    return `${c.cashCountsLost} hitungan Cek kas di HP ini akan hilang, dan HP ini akan memakai ${c.cashCountsAdded} hitungan dari cadangan.`;
  }
  if (c.cashCountsLost > 0) return `${c.cashCountsLost} hitungan Cek kas di HP ini tidak ada di cadangan dan akan hilang.`;
  if (c.cashCountsAdded > 0) return `Cadangan ini punya ${c.cashCountsAdded} hitungan Cek kas yang belum ada di HP ini.`;
  return '';
}

/** Said when meeting, period or member state differs although every record is the same (see classifyRestore). */
export const STATE_CHANGED_TEXT = 'Cadangan ini berbeda: status pertemuan, periode atau anggota di HP ini akan kembali seperti di cadangan.';

/** Extra sentence for a backup that ALSO lacks or adds records: the state of meetings, periods and members goes back too. */
const STATE_ALSO_TEXT = 'Status pertemuan, periode, dan anggota di HP ini juga akan kembali seperti di cadangan.';

/**
 * What the restore will do to the data, in words. Counts are records (kas entries, payments, skips, members, periods); Cek kas counts are
 * named apart. A "0 data" is never shown. The word is "data", not "catatan": the counts include members and periods.
 */
export function classificationText(c: RestoreClassification): string {
  const cash = cashCountSentence(c);
  let base: string;
  switch (c.kind) {
    case 'same':
      return 'Isi cadangan sama dengan data di HP ini.';
    case 'changed':
      return STATE_CHANGED_TEXT;
    case 'newer':
      base = c.added > 0 ? `Cadangan ini lebih baru: ${c.added} data lebih banyak daripada di HP ini.` : 'Cadangan ini lebih baru.';
      break;
    case 'older':
      base = c.lost > 0 ? `Cadangan ini lebih lama. ${c.lost} data di HP ini tidak ada di cadangan dan akan hilang.` : 'Cadangan ini lebih lama.';
      break;
    case 'diverged': {
      const intro = 'Isi cadangan ini dan data di HP ini sama-sama punya data yang tidak ada di pihak lain.';
      if (c.lost > 0 && c.added > 0) {
        base = `${intro} ${c.lost} data di HP ini akan hilang, dan HP ini akan memakai ${c.added} data dari cadangan.`;
      } else if (c.lost > 0) {
        base = `${intro} ${c.lost} data di HP ini akan hilang.`;
      } else if (c.added > 0) {
        base = `${intro} HP ini akan memakai ${c.added} data dari cadangan.`;
      } else {
        base = intro;
      }
      break;
    }
  }
  const withCash = cash ? `${base} ${cash}` : base;
  return c.stateChanged > 0 ? `${withCash} ${STATE_ALSO_TEXT}` : withCash;
}

/** Bold title of the restore Notice when records would be lost or state would change (emphasis by title, not by CAPITAL letters), else undefined. */
export function classificationTitle(c: RestoreClassification): string | undefined {
  if (c.kind === 'older' || c.kind === 'diverged' || c.cashCountsLost > 0) return 'Sebagian data di HP ini akan hilang';
  return c.stateChanged > 0 ? 'Sebagian data di HP ini akan berubah' : undefined;
}

export interface SummaryRow {
  label: string;
  value: string;
}

/** The numbers the owner compares before a restore. Total kas is Tunai + Debit. */
export function summaryRows(s: DbSummary): SummaryRow[] {
  return [
    { label: 'Tanggal catatan kas terakhir', value: s.lastEntryDate ? formatDate(s.lastEntryDate) : '-' },
    { label: 'Jumlah catatan kas', value: String(s.ledgerCount) },
    { label: 'Jumlah hitungan Cek kas', value: String(s.cashCountBatches) },
    { label: 'Anggota', value: String(s.memberCount) },
    { label: 'Periode', value: String(s.periodCount) },
    { label: 'Total kas (Tunai + Debit)', value: formatRupiah(s.kas.actual) },
  ];
}

export function safetyCopyLabel(name: string): string {
  const parsed = parseSafetyName(name);
  if (!parsed) return 'Salinan pengaman';
  // The name holds local clock parts ("HH:mm"), not an instant. They go through formatTime so the clock reads like
  // "Dicatat 19.42" everywhere ("09.05"). The Date is built from local components, so no time zone shift happens.
  const [hour = 0, minute = 0] = parsed.time.split(':').map(Number);
  return `Salinan pengaman ${formatDate(parsed.date)} pukul ${formatTime(new Date(2000, 0, 1, hour, minute))}`;
}

export function phraseInstruction(phrase: string): string {
  return phrase === PHRASE_RESET
    ? `Untuk melanjutkan, ketik ${PHRASE_RESET} di bawah ini.`
    : `Untuk melanjutkan, ketik ${PHRASE_RESTORE} di bawah ini.`;
}

/** Reason under the disabled restore button (short, like "Buat periode dulu."). */
export function phraseReason(phrase: string): string {
  return `Ketik ${phrase} dulu.`;
}

export const restoreTexts = {
  firstDialogTitle: 'Ganti semua data?',
  firstDialogBody:
    'Semua data di HP ini akan diganti dengan isi cadangan. Pemulihan tidak menggabungkan data. Salinan pengaman dari data sekarang dibuat otomatis lebih dulu.',
  secondDialogTitle: 'Yakin ingin mengganti semua data?',
  secondDialogBody: 'Setelah ini data di HP ini sama persis dengan cadangan.',
  secondDialogOk: 'Ya, ganti semua data',
  resetWarning:
    'Semua data di HP ini akan dihapus: anggota, periode, pembayaran, kas, dan hitungan Cek kas. Aplikasi mulai dari kosong. Salinan pengaman dibuat otomatis lebih dulu, tetapi setelah ini data tidak kembali dengan sendirinya.',
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

// ---------------------------------------------------------------------------------------------------------------
// Recovery screen (L6): shown at app start when a restore did not finish
// ---------------------------------------------------------------------------------------------------------------

/** Date and time of a safety copy as shown to the owner ("10 Nov 2026" and "10.15"), or null for a name that is not one. */
export function safetyCopyWhen(name: string): { date: string; time: string } | null {
  const parsed = parseSafetyName(name);
  if (!parsed) return null;
  const [hour = 0, minute = 0] = parsed.time.split(':').map(Number);
  return { date: formatDate(parsed.date), time: formatTime(new Date(2000, 0, 1, hour, minute)) };
}

export const recoveryTexts = {
  title: 'Pemulihan sebelumnya tidak selesai',
  noticeTitle: 'Data di HP ini mungkin setengah terganti',
  noticeBodyRestore:
    'Tadi aplikasi atau HP mati saat data sedang diganti. Karena itu sebagian data bisa belum lengkap atau bercampur. Jangan mencatat apa pun dulu.',
  // "Mulai dari nol" went through the same path. The last sentence is the same warning as above (owner-facing wording added by the developer).
  noticeBodyReset:
    'Tadi aplikasi atau HP mati saat data sedang dihapus untuk mulai dari nol. Data di HP ini mungkin setengah terhapus. Jangan mencatat apa pun dulu.',
  explain:
    'Sebelum penggantian dimulai, aplikasi sudah membuat salinan pengaman dari data kamu. Pulihkan salinan itu supaya data kembali seperti sebelum pemulihan.',
  cardNote: 'Salinan ini dibuat otomatis sebelum pemulihan tadi.',
  primary: 'Pulihkan salinan pengaman',
  secondary: 'Pilih salinan atau berkas lain',
  small: 'Pemulihan mengganti semua data di HP ini. Data tidak digabung.',
  confirmTitle: 'Pulihkan salinan pengaman?',
  confirmOk: 'Ya, pulihkan',
  working: 'Memulihkan salinan pengaman. Jangan tutup aplikasi.',
  toastDone: 'Salinan pengaman sudah dipulihkan',
  doneTitle: 'Data sudah dipulihkan',
  doneBody: 'Periksa Total kas dan catatan terakhir di Beranda. Jika ada yang kurang, bagikan berkas cadangan terakhir lewat menu Cadangan.',
  doneOk: 'Mengerti',
  retryTitle: 'Salinan pengaman belum bisa dipulihkan',
  retryBody: 'Data tidak berubah dari sebelum kamu menekan tombol. Coba lagi. Jika tetap gagal, pilih salinan atau berkas lain di bawah.',
  retry: 'Coba lagi',
  unsafe:
    'Pemulihan gagal dan data di HP ini belum aman dipakai. Jangan mencatat apa pun. Pilih berkas cadangan lain, misalnya yang terakhir kamu bagikan ke Drive.',
  pickFile: 'Pilih berkas cadangan',
  missingTitle: 'Salinan pengaman tidak ditemukan',
  missingBody:
    'Salinan otomatis dari sebelum pemulihan tadi tidak ada lagi di HP ini. Data di HP ini mungkin setengah terganti dan belum aman dipakai.',
  missingHint:
    'Pulihkan dari berkas cadangan yang kamu simpan di luar HP, misalnya di Google Drive atau dikirim ke diri sendiri.',
  otherCopies: 'Salinan lain di HP ini (bisa lebih lama dari yang tadi)',
  reviewTitle: 'Periksa sebelum memulihkan',
};

/** Said when the data file cannot be opened: it is moved aside (kept as a damaged copy), never just thrown away. */
export const UNREADABLE_FILE_NOTE =
  'Berkas data di HP ini tidak bisa dibaca. Berkas itu dipindahkan dan disimpan sebagai cadangan rusak, lalu diganti dengan berkas data baru.';

/** Message of the confirmation dialog of the recovery screen. `unreadable` = the data file cannot be opened (see UNREADABLE_FILE_NOTE). */
export function recoveryConfirmText(safetyName: string, unreadable = false): string {
  const when = safetyCopyWhen(safetyName);
  const label = when ? `tanggal ${when.date} pukul ${when.time}` : 'terakhir';
  const base = `Data di HP ini diganti dengan salinan pengaman ${label}. Catatan yang dibuat setelah itu, jika ada, tidak ikut kembali. Data yang ada sekarang disimpan dulu sebagai salinan pengaman baru bila masih terbaca.`;
  return unreadable ? `${base} ${UNREADABLE_FILE_NOTE}` : base;
}

/** Shown when a finished restore could not remove its "in progress" marker, even after a second try. */
export const MARKER_NOT_CLEARED_TEXT =
  'Penanda pemulihan belum terhapus. Saat aplikasi dibuka lagi, layar pemulihan bisa muncul; jangan pulihkan salinan lama bila kamu sudah mencatat data baru, pilih berkas cadangan terbaru.';

/** Body of the dialog after a recovery: what was saved, and what to watch for. */
export function recoveryDoneBody(outcome: { previousCopyName: string | null; liveDiffers: boolean; markerCleared: boolean }): string {
  const parts: string[] = [recoveryTexts.doneBody];
  if (outcome.previousCopyName) {
    parts.push(`Data yang tadi ada di HP ini disimpan dulu sebagai ${safetyCopyLabel(outcome.previousCopyName)}.`);
  }
  if (outcome.liveDiffers) {
    parts.push(
      'Data tadi berbeda dari data sebelum dan sesudah pemulihan yang gagal, jadi mungkin ada catatan baru. Bila ada yang kurang, pilih salinan itu lewat Cadangan, lalu Pulihkan data.',
    );
  }
  if (!outcome.markerCleared) parts.push(MARKER_NOT_CLEARED_TEXT);
  return parts.join(' ');
}

/** Screen reader hint of the main button. */
export function recoveryHint(safetyName: string): string {
  const when = safetyCopyWhen(safetyName);
  return `Mengganti semua data di HP ini dengan salinan pengaman${when ? ` tanggal ${when.date}` : ''}`;
}

export type RecoveryFailure = 'retry' | 'missing' | 'unsafe';

/**
 * How the recovery screen explains a failure. 'retry': the data is certainly untouched. 'missing': the safety copy cannot
 * be used (nothing was overwritten). 'unsafe': the live data may have changed and is not known to be good.
 */
export function recoveryFailure(error: unknown): RecoveryFailure {
  // Replacing an unreadable file: before the delete nothing changed; after it the old file is gone and the new one may not exist.
  if (error instanceof DamagedDatabaseError) return error.afterDelete ? 'unsafe' : 'retry';
  if (error instanceof BackupError && error.code === 'safety_missing') return 'missing';
  return restoreErrorNeedsReload(error) ? 'unsafe' : 'retry';
}
