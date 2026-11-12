import { backupReminder, type DbSummary } from '@/domain/backup';
import { classificationText, classificationTitle, lastSharedText, phraseInstruction, reminderText, safetyCopyLabel, summaryRows, BACKUP_WARNING, CSV_HINT, CSV_LEDGER_HINT, ONE_PHONE_HINT, OFFSITE_HINT, restoreTexts, RESET_SAFETY_NOTE, ROLLED_BACK_TEXT } from './backupLabels';

const summary: DbSummary = {
  userVersion: 4,
  ledgerCount: 12,
  paymentCount: 5,
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
    expect(CSV_LEDGER_HINT).toContain('pinjaman di Keluar');
    expect(CSV_LEDGER_HINT).toContain('pelunasan di Masuk');
  });

  it('summary rows show the five numbers the owner compares', () => {
    expect(summaryRows(summary)).toEqual([
      { label: 'Tanggal catatan kas terakhir', value: '9 Jan 2026' },
      { label: 'Jumlah catatan kas', value: '12' },
      { label: 'Anggota', value: '19' },
      { label: 'Periode', value: '2' },
      { label: 'Total kas (Tunai + Debit)', value: 'Rp150.000' },
    ]);
    expect(summaryRows({ ...summary, lastEntryDate: null })[0]?.value).toBe('-');
  });

  it('describes each classification, with the number of lost records for older and diverged', () => {
    expect(classificationText({ kind: 'same', lost: 0, added: 0 })).toMatch(/sama/);
    expect(classificationText({ kind: 'newer', lost: 0, added: 4 })).toContain('4 catatan');
    expect(classificationText({ kind: 'older', lost: 7, added: 0 })).toContain('7 catatan');
    expect(classificationText({ kind: 'older', lost: 7, added: 0 })).toBe(
      'Cadangan ini lebih lama. 7 catatan di HP ini tidak ada di cadangan dan akan hilang.',
    );
    const diverged = classificationText({ kind: 'diverged', lost: 3, added: 2 });
    expect(diverged).toContain('3 catatan');
    expect(diverged).toContain('2 catatan');
    expect(diverged).not.toContain('BERBEDA');
  });

  it('emphasises data loss with a title, never with capital letters', () => {
    expect(classificationTitle({ kind: 'older', lost: 7, added: 0 })).toBe('Sebagian catatan di HP ini akan hilang');
    expect(classificationTitle({ kind: 'diverged', lost: 3, added: 2 })).toBeDefined();
    expect(classificationTitle({ kind: 'newer', lost: 0, added: 4 })).toBeUndefined();
    expect(classificationTitle({ kind: 'same', lost: 0, added: 0 })).toBeUndefined();
    expect(classificationText({ kind: 'diverged', lost: 3, added: 2 })).not.toMatch(/HILANG|LEBIH/);
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
    expect(safetyCopyLabel('pengaman-20261106-090507-v4.db')).toBe('Salinan pengaman 6 Nov 2026 pukul 09:05');
    expect(safetyCopyLabel('whatever')).toBe('Salinan pengaman');
  });

  it('asks for the right word', () => {
    expect(phraseInstruction('PULIHKAN')).toContain('PULIHKAN');
    expect(phraseInstruction('HAPUS SEMUA')).toContain('HAPUS SEMUA');
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
