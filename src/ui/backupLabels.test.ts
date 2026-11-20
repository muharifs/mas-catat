import { backupReminder, BackupError, DamagedDatabaseError, type DbSummary } from '@/domain/backup';
import { MARKER_NOT_CLEARED_TEXT, recoveryDoneBody, UNREADABLE_FILE_NOTE, recoveryConfirmText, recoveryFailure, recoveryHint, recoveryTexts, safetyCopyWhen, BACKUP_UNHEALTHY_TEXT, classificationText, classificationTitle, lastSharedText, phraseInstruction, phraseReason, reminderText, safetyCopyLabel, summaryRows, BACKUP_WARNING, CSV_HINT, CSV_LEDGER_HINT, ONE_PHONE_HINT, OFFSITE_HINT, restoreTexts, RESET_SAFETY_NOTE, ROLLED_BACK_TEXT } from './backupLabels';

const summary: DbSummary = {
  userVersion: 4,
  ledgerCount: 12,
  paymentCount: 5,
  cashCountBatches: 3,
  memberCount: 19,
  periodCount: 2,
  lastEntryDate: '2026-01-09',
  lastLedgerId: 'x',
  kas: { tunai: 100_000, debit: 50_000, piutang: 20_000, actual: 150_000 },
  tableCounts: {},
};

describe('backup labels', () => {
  it('uses the exact warning text agreed with the owner', () => {
    expect(BACKUP_WARNING).toBe('Berisi nama dan uang anggota. Kirim ke diri sendiri atau Google Drive pribadi.');
  });

  it('says a copy must exist outside the phone, one active phone, and that CSV is not a backup', () => {
    expect(OFFSITE_HINT).toContain('di luar HP');
    expect(ONE_PHONE_HINT).toContain('satu HP');
    expect(ONE_PHONE_HINT).toContain('tidak bisa digabung');
    expect(CSV_HINT).toMatch(/bukan cadangan/i);
    expect(CSV_LEDGER_HINT).toContain('Tanpa perubahan kas');
    expect(CSV_LEDGER_HINT).toContain('Kolom Dicatat di paling kanan');
    expect(CSV_LEDGER_HINT).toContain('pinjaman di Keluar');
    expect(CSV_LEDGER_HINT).toContain('pelunasan di Masuk');
  });

  it('summary rows show the numbers the owner compares', () => {
    expect(summaryRows(summary)).toEqual([
      { label: 'Tanggal catatan kas terakhir', value: '9 Jan 2026' },
      { label: 'Jumlah catatan kas', value: '12' },
      { label: 'Jumlah hitungan Cek kas', value: '3' },
      { label: 'Anggota', value: '19' },
      { label: 'Periode', value: '2' },
      { label: 'Total kas (Tunai + Debit)', value: 'Rp150.000' },
    ]);
    expect(summaryRows({ ...summary, lastEntryDate: null })[0]?.value).toBe('-');
  });

  it('describes each classification, with the number of lost records for older and diverged', () => {
    expect(classificationText({ kind: 'same', lost: 0, added: 0, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 })).toMatch(/sama/);
    expect(classificationText({ kind: 'newer', lost: 0, added: 4, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 })).toContain('4 data');
    expect(classificationText({ kind: 'older', lost: 7, added: 0, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 })).toContain('7 data');
    expect(classificationText({ kind: 'older', lost: 7, added: 0, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 })).toBe(
      'Cadangan ini lebih lama. 7 data di HP ini tidak ada di cadangan dan akan hilang.',
    );
    const diverged = classificationText({ kind: 'diverged', lost: 3, added: 2, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 });
    expect(diverged).toContain('3 data');
    expect(diverged).toContain('2 data');
    expect(diverged).not.toContain('BERBEDA');
  });

  it('emphasises data loss with a title, never with capital letters', () => {
    expect(classificationTitle({ kind: 'older', lost: 7, added: 0, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 })).toBe('Sebagian data di HP ini akan hilang');
    expect(classificationTitle({ kind: 'diverged', lost: 3, added: 2, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 })).toBeDefined();
    expect(classificationTitle({ kind: 'newer', lost: 0, added: 4, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 })).toBeUndefined();
    expect(classificationTitle({ kind: 'same', lost: 0, added: 0, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 })).toBeUndefined();
    expect(classificationText({ kind: 'diverged', lost: 3, added: 2, cashCountsLost: 0, cashCountsAdded: 0, stateChanged: 0 })).not.toMatch(/HILANG|LEBIH/);
  });

  const cls = (kind: 'same' | 'older' | 'newer' | 'diverged', lost: number, added: number, cashCountsLost: number, cashCountsAdded: number) => ({
    kind, lost, added, cashCountsLost, cashCountsAdded, stateChanged: 0,
  });

  it('a version 6 backup shows 0 hitungan Cek kas', () => {
    expect(summaryRows({ ...summary, cashCountBatches: 0 })[2]).toEqual({ label: 'Jumlah hitungan Cek kas', value: '0' });
  });

  it('names Cek kas counts apart and never shows 0 data', () => {
    expect(classificationText(cls('older', 0, 0, 2, 0))).toBe('Cadangan ini lebih lama. 2 hitungan Cek kas di HP ini tidak ada di cadangan dan akan hilang.');
    expect(classificationText(cls('newer', 0, 0, 0, 3))).toBe('Cadangan ini lebih baru. Cadangan ini punya 3 hitungan Cek kas yang belum ada di HP ini.');
    expect(classificationText(cls('diverged', 0, 0, 1, 2))).toContain('1 hitungan Cek kas di HP ini akan hilang, dan HP ini akan memakai 2 hitungan dari cadangan.');
    expect(classificationText(cls('older', 7, 0, 1, 0))).toBe(
      'Cadangan ini lebih lama. 7 data di HP ini tidak ada di cadangan dan akan hilang. 1 hitungan Cek kas di HP ini tidak ada di cadangan dan akan hilang.',
    );
    expect(classificationText(cls('newer', 0, 4, 0, 1))).toBe(
      'Cadangan ini lebih baru: 4 data lebih banyak daripada di HP ini. Cadangan ini punya 1 hitungan Cek kas yang belum ada di HP ini.',
    );
    for (const c of [cls('older', 0, 0, 2, 0), cls('newer', 0, 0, 0, 3), cls('diverged', 0, 0, 1, 2), cls('diverged', 0, 2, 1, 0)]) {
      expect(classificationText(c)).not.toMatch(/0 data|catatan/);
    }
  });

  it('the loss title also appears when only Cek kas counts are lost', () => {
    expect(classificationTitle(cls('older', 0, 0, 2, 0))).toBe('Sebagian data di HP ini akan hilang');
    expect(classificationTitle(cls('newer', 0, 0, 0, 2))).toBeUndefined();
  });

  it('the reset warning names the Cek kas counts', () => {
    expect(restoreTexts.resetWarning).toContain('anggota, periode, pembayaran, kas, dan hitungan Cek kas. Aplikasi mulai dari kosong.');
  });

  it('last shared and the reminder', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    const last = '2026-11-07T12:00:00.000Z';
    const reminder = backupReminder(last, now, true);
    expect(lastSharedText(last, reminder)).toMatch(/^Terakhir mencoba membagikan: .* \(3 hari lalu\)\. Pastikan berkasnya benar-benar terkirim\.$/);
    expect(lastSharedText(null, backupReminder(null, now, true))).toBe('Belum pernah dibagikan');
    expect(reminderText(backupReminder(null, now, true))).toContain('belum pernah');
    expect(reminderText(backupReminder('2026-11-01T12:00:00.000Z', now, true))).toBe('Buat cadangan baru supaya catatan terbaru ikut aman.');
  });

  it('names a safety copy by date and time without a file name', () => {
    expect(safetyCopyLabel('pengaman-20261106-090507-v4.db')).toBe('Salinan pengaman 6 Nov 2026 pukul 09.05');
    expect(safetyCopyLabel('pengaman-20261106-000507-v4.db')).toBe('Salinan pengaman 6 Nov 2026 pukul 00.05');
    expect(safetyCopyLabel('pengaman-20261106-231507-v4.db')).toBe('Salinan pengaman 6 Nov 2026 pukul 23.15');
    expect(safetyCopyLabel('whatever')).toBe('Salinan pengaman');
  });

  it('asks for the right word', () => {
    expect(phraseInstruction('PULIHKAN')).toContain('PULIHKAN');
    expect(phraseInstruction('HAPUS SEMUA')).toContain('HAPUS SEMUA');
  });

  it('gives a short reason under the disabled restore button', () => {
    expect(phraseReason('PULIHKAN')).toBe('Ketik PULIHKAN dulu.');
    expect(phraseReason('HAPUS SEMUA')).toBe('Ketik HAPUS SEMUA dulu.');
  });

  it('never uses the word kredit', () => {
    const all = [BACKUP_WARNING, OFFSITE_HINT, ONE_PHONE_HINT, CSV_HINT, CSV_LEDGER_HINT, ROLLED_BACK_TEXT, ...Object.values(restoreTexts)].join(' ').toLowerCase();
    expect(all).not.toContain('kredit');
  });
});

describe('reset safety note', () => {
  it('says the safety copy keeps the old data on this phone', () => {
    expect(RESET_SAFETY_NOTE).toContain('data lama');
    expect(RESET_SAFETY_NOTE).toContain('tetap tersimpan di HP ini');
  });
});

describe('state-only difference (M7b)', () => {
  const base = { lost: 0, added: 0, cashCountsLost: 0, cashCountsAdded: 0 };

  it('says what will go back, with a title', () => {
    expect(classificationText({ ...base, kind: 'changed', stateChanged: 2 })).toBe(
      'Cadangan ini berbeda: status pertemuan, periode atau anggota di HP ini akan kembali seperti di cadangan.',
    );
    expect(classificationTitle({ ...base, kind: 'changed', stateChanged: 2 })).toBe('Sebagian data di HP ini akan berubah');
  });

  it('adds a sentence to the other kinds only when state differs', () => {
    expect(classificationText({ ...base, kind: 'older', lost: 1, stateChanged: 0 })).not.toContain('Status pertemuan');
    expect(classificationText({ ...base, kind: 'older', lost: 1, stateChanged: 3 })).toContain('Status pertemuan, periode, dan anggota di HP ini juga akan kembali');
    expect(classificationTitle({ ...base, kind: 'older', lost: 1, stateChanged: 3 })).toBe('Sebagian data di HP ini akan hilang');
  });
});

describe('recovery screen texts (L6)', () => {
  it('uses the agreed wording', () => {
    expect(recoveryTexts.title).toBe('Pemulihan sebelumnya tidak selesai');
    expect(recoveryTexts.primary).toBe('Pulihkan salinan pengaman');
    expect(recoveryTexts.secondary).toBe('Pilih salinan atau berkas lain');
    expect(recoveryTexts.noticeBodyReset).toContain('setengah terhapus');
    expect(recoveryTexts.noticeBodyRestore).toContain('Jangan mencatat apa pun dulu.');
    expect(BACKUP_UNHEALTHY_TEXT).toBe('Data di HP ini gagal pemeriksaan; berkas cadangan ini mungkin tidak bisa dipulihkan.');
  });

  it('names the date and time of the safety copy in the dialog and the hint', () => {
    expect(safetyCopyWhen('pengaman-20261110-101530-v7.db')).toEqual({ date: '10 Nov 2026', time: '10.15' });
    expect(recoveryConfirmText('pengaman-20261110-101530-v7.db')).toBe(
      'Data di HP ini diganti dengan salinan pengaman tanggal 10 Nov 2026 pukul 10.15. Catatan yang dibuat setelah itu, jika ada, tidak ikut kembali. Data yang ada sekarang disimpan dulu sebagai salinan pengaman baru bila masih terbaca.',
    );
    expect(recoveryHint('pengaman-20261110-101530-v7.db')).toBe('Mengganti semua data di HP ini dengan salinan pengaman tanggal 10 Nov 2026');
    expect(safetyCopyWhen('mascatat.db')).toBeNull();
  });

  it('maps a failure to what the screen says', () => {
    expect(recoveryFailure(new BackupError('safety_missing', 'x'))).toBe('missing');
    expect(recoveryFailure(new BackupError('restore_failed', 'x'))).toBe('unsafe');
    expect(recoveryFailure(new Error('boom'))).toBe('unsafe');
    expect(recoveryFailure(new BackupError('safety_failed', 'x'))).toBe('retry');
    expect(recoveryFailure(new BackupError('busy', 'x'))).toBe('retry');
  });

  it('a failed replacement of an unreadable file is retry before the delete and unsafe after it', () => {
    expect(recoveryFailure(new DamagedDatabaseError(false, 'x'))).toBe('retry');
    expect(recoveryFailure(new DamagedDatabaseError(true, 'x'))).toBe('unsafe');
  });

  it('the confirmation says an unreadable data file is moved aside (kept as a damaged copy) and replaced, only when it is unreadable', () => {
    const readable = recoveryConfirmText('pengaman-20261110-101530-v7.db', false);
    const unreadable = recoveryConfirmText('pengaman-20261110-101530-v7.db', true);
    expect(readable).not.toContain('cadangan rusak');
    expect(unreadable).toContain(UNREADABLE_FILE_NOTE);
    expect(UNREADABLE_FILE_NOTE).toContain('dipindahkan');
    expect(UNREADABLE_FILE_NOTE).toContain('cadangan rusak');
    expect(UNREADABLE_FILE_NOTE).toContain('diganti');
  });

  it('the done dialog names the copy of the overwritten data, a difference and a marker that stayed', () => {
    const plain = recoveryDoneBody({ previousCopyName: null, liveDiffers: false, markerCleared: true });
    expect(plain).toBe(recoveryTexts.doneBody);
    const full = recoveryDoneBody({ previousCopyName: 'pengaman-20261110-101530-v7.db', liveDiffers: true, markerCleared: false });
    expect(full).toContain('Salinan pengaman 10 Nov 2026 pukul 10.15');
    expect(full).toContain('mungkin ada catatan baru');
    expect(full).toContain(MARKER_NOT_CLEARED_TEXT);
    expect(MARKER_NOT_CLEARED_TEXT).toBe(
      'Penanda pemulihan belum terhapus. Saat aplikasi dibuka lagi, layar pemulihan bisa muncul; jangan pulihkan salinan lama bila kamu sudah mencatat data baru, pilih berkas cadangan terbaru.',
    );
  });
});

