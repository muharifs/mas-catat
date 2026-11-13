import { MigrationError, RepositoryError } from '@/db/errors';
import { BackupError, type BackupErrorCode } from '@/domain/backup';
import { LoanError } from '@/domain/loans';
import { DomainError } from '@/domain/money';
import { HostPayoutStandsError } from '@/domain/schedule';
import { archiveBlockText, BACKUP_ERROR_TEXT, CONTEXT_ERROR_TEXT, GENERIC_LOAD_ERROR, restoreErrorNeedsReload, type ErrorContext, toIndonesian } from './errors';

describe('toIndonesian', () => {
  it.each([
    [new RepositoryError('member name must not be empty'), 'Nama anggota tidak boleh kosong.'],
    [new RepositoryError('member name already exists: Budi'), 'Nama ini sudah dipakai (mungkin oleh anggota yang diarsipkan). Gunakan nama lain.'],
    [new RepositoryError('another period is still active; end it before creating a new one'), 'Masih ada periode yang aktif. Akhiri dulu sebelum membuat periode baru.'],
    [new RepositoryError('period still has open weeks; close every week first'), 'Periode belum bisa diakhiri karena masih ada pertemuan yang belum ditutup. Tutup dulu semua pertemuan.'],
    [new RepositoryError('week 3 is closed; its host cannot be changed'), 'Pertemuan yang sudah ditutup tidak bisa diubah tuan rumah atau tanggalnya.'],
    [new HostPayoutStandsError(2), 'Tuan rumah sudah dibayar. Koreksi pembayarannya dulu untuk mengganti tuan rumah.'],
    [new RepositoryError('cannot swap a week with itself'), 'Pilih dua pertemuan yang berbeda.'],
    [new RepositoryError('memberIds must list each member exactly once'), 'Setiap anggota hanya boleh dipilih satu kali.'],
    [new RepositoryError('week 2 not found in period p'), 'Pertemuan tidak ditemukan.'],
    [new DomainError('week 3 is outside the selectable window (the current and the next week only)'), 'Tuan rumah hanya bisa diatur untuk pertemuan saat ini dan pertemuan berikutnya.'],
    [new DomainError('member m1 already hosted a closed week'), 'Anggota ini sudah pernah jadi tuan rumah pada pertemuan yang ditutup.'],
    [new RepositoryError('week 2 has no host; pick a host first'), 'Pertemuan ini belum punya tuan rumah. Tentukan dulu tuan rumahnya.'],
    [new DomainError('meeting date is not a real calendar date: 2026-02-31'), 'Tanggal tidak valid. Pilih tanggal dari kalender.'],
    [new DomainError('meeting date must be later than the previous meeting date (2026-01-04)'), 'Tanggal harus setelah tanggal pertemuan sebelumnya.'],
    [new DomainError('meeting date must be earlier than the next meeting date (2026-01-11)'), 'Tanggal harus sebelum tanggal pertemuan berikutnya. Ubah dulu tanggal pertemuan berikutnya.'],
    [new DomainError('meeting dates must stay in order, each later than the one before'), 'Tanggal pertemuan harus berurutan, makin lama makin akhir.'],
    [new RepositoryError('period abc not found'), 'Periode tidak ditemukan.'],
    [new DomainError('startDate is not a real calendar date: 2026-02-31'), 'Tanggal tidak valid. Pilih tanggal dari kalender.'],
    [new DomainError('memberCount must be a positive integer, got 0'), 'Pilih minimal satu anggota.'],
    [new DomainError('payment amount must be a positive multiple of 15000 rupiah (the weekly due), got 20000'), 'Jumlah pembayaran harus kelipatan Rp15.000.'],
    [new RepositoryError('period abc has ended; payments are not accepted'), 'Periode sudah berakhir. Pembayaran tidak bisa dicatat.'],
    [new DomainError('payment date is in the future: 2027-01-01'), 'Tanggal pembayaran tidak boleh di masa depan. Pilih hari ini atau sebelumnya.'],
    [new DomainError('payment date is not a real calendar date: 2026-02-31'), 'Tanggal tidak valid. Pilih tanggal dari kalender.'],
    [new RepositoryError('receiving account must be tunai or debit'), 'Pilih tempat uang masuk: Tunai atau Debit.'],
    [new RepositoryError('no open week left to close'), 'Semua pertemuan sudah ditutup.'],
    [new RepositoryError('member x not found in period y'), 'Anggota tidak ditemukan.'],
    [new DomainError('correction reason is required'), 'Alasan koreksi wajib diisi.'],
    [new RepositoryError('payment p1 is already corrected'), 'Catatan ini sudah pernah dikoreksi.'],
    [new RepositoryError('entry e1 is already corrected'), 'Catatan ini sudah pernah dikoreksi.'],
    [new DomainError('a reversal cannot be reversed'), 'Koreksi tidak bisa dikoreksi lagi. Catat ulang transaksi yang benar.'],
    [new RepositoryError('entry type member_payment cannot be corrected here'), 'Catatan ini tidak bisa dikoreksi dari sini. Pembayaran anggota dikoreksi di halaman anggota, pembayaran tuan rumah di halaman bayar tuan rumah.'],
    [new RepositoryError('period p1 has ended; a correction is not allowed'), 'Koreksi hanya bisa dilakukan pada periode yang masih aktif.'],
    [new RepositoryError('period p1 has ended; a host payout is not allowed'), 'Periode sudah berakhir. Tuan rumah tidak bisa dibayar lagi.'],
    [new RepositoryError('payout account must be tunai or debit'), 'Pilih sumber uang: Tunai atau Debit.'],
    [new DomainError('entry date is in the future: 2027-01-01'), 'Tanggal tidak boleh di masa depan. Pilih hari ini atau sebelumnya.'],
    [new DomainError('entry date is not a real calendar date: 2026-02-31'), 'Tanggal tidak valid. Pilih tanggal dari kalender.'],
    [new RepositoryError('week 4 cannot be paid out yet; only the current or a closed week can be'), 'Tuan rumah hanya bisa dibayar untuk pertemuan saat ini atau pertemuan yang sudah ditutup.'],
    [new RepositoryError('week 1 already has a host payout'), 'Pertemuan ini sudah dibayarkan ke tuan rumah. Koreksi dulu jika salah.'],
    [new RepositoryError('week 1 is not paid out; there is no host payout to correct'), 'Pertemuan ini belum punya pembayaran tuan rumah yang bisa dikoreksi.'],
    [new RepositoryError('payment ghost not found'), 'Pembayaran tidak ditemukan.'],
    [new RepositoryError('ledger entry ghost not found'), 'Catatan kas tidak ditemukan.'],
    [new RepositoryError('payment p1 has no ledger entry to reverse'), 'Pembayaran lama ini tidak punya catatan kas, jadi tidak bisa dikoreksi otomatis. Catat ulang pembayarannya bila perlu.'],
    [new RepositoryError('no active period; kas entries are attached to the active period'), 'Tidak ada periode aktif. Buat periode dulu.'],
    [new DomainError('transfer must go between tunai and debit'), 'Pindah saldo hanya antara Tunai dan Debit, dan keduanya harus berbeda.'],
    [new RepositoryError('a move entry needs two different pos'), 'Pindah saldo hanya antara Tunai dan Debit, dan keduanya harus berbeda.'],
    [new DomainError('a loan must be paid from tunai or debit'), 'Pilih sumber uang: Tunai atau Debit.'],
    [new DomainError('a loan needs a member'), 'Pilih anggota.'],
    [new DomainError('shared goal needs a note'), 'Catatan wajib diisi untuk pengeluaran bersama.'],
    [new DomainError('opening balance needs a pos'), 'Pilih Tunai, Debit, atau Piutang.'],
    [new DomainError('amount must be a positive integer, got 0'), 'Jumlah harus lebih dari nol.'],
    [new RepositoryError('no period exists yet; create a period first'), 'Belum ada periode. Buat periode dulu.'],
    [new RepositoryError('no active period; a new loan is only for members of the active period'), 'Tidak ada periode aktif. Buat periode dulu.'],
    [new DomainError('end date is in the future: 2027-01-01'), 'Tanggal berakhir tidak boleh di masa depan. Pilih hari ini atau sebelumnya.'],
    [new RepositoryError('weeks 1, 2 have no host payout in force; pay the hosts before closing the period'), 'Periode belum bisa diakhiri karena masih ada tuan rumah yang belum dibayar. Bayar dulu semua tuan rumah.'],
    [new DomainError('nothing to refund: the member holds no credit'), 'Anggota ini tidak punya titipan yang bisa dikembalikan.'],
    [new RepositoryError('period p1 has not ended; its credit cannot be refunded yet'), 'Titipan periode yang masih aktif belum bisa dikembalikan. Akhiri periodenya dulu.'],
    [new DomainError('refund account must be tunai or debit'), 'Pilih sumber uang: Tunai atau Debit.'],
    [new LoanError('no_loan', 'the member has no outstanding loan to repay', 0), 'Anggota ini tidak punya sisa pinjaman, jadi tidak ada yang bisa dilunasi.'],
    [new LoanError('above_remaining', 'repayment 300001 is above the remaining loan 300000', 300_000), 'Jumlah melebihi sisa pinjaman (Rp300.000). Kurangi jumlah.'],
    [
      new LoanError('reversal_below_zero', 'loan cannot be corrected: the member already repaid 100000; correct the repayment first', 200_000, 100_000),
      'Pinjaman ini sudah dikembalikan Rp100.000. Koreksi pelunasannya dulu, baru koreksi pinjamannya.',
    ],
    [new DomainError('an opening balance in piutang needs a member'), 'Pilih anggota yang punya pinjaman lama ini.'],
  ])('maps %s', (error, expected) => {
    expect(toIndonesian(error)).toBe(expected);
  });

  it('maps migration failures', () => {
    expect(toIndonesian(new MigrationError('boom'))).toMatch(/^Gagal memuat data\. Tutup aplikasi sepenuhnya/);
    expect(toIndonesian(new MigrationError('boom'))).not.toMatch(/Database|Hubungi|Anda/);
  });

  it('falls back to a generic message and never leaks English', () => {
    expect(toIndonesian(new RepositoryError('something new'))).toBe(CONTEXT_ERROR_TEXT.save);
    expect(toIndonesian(new Error('raw'))).toBe(CONTEXT_ERROR_TEXT.save);
    expect(toIndonesian('text')).toBe(CONTEXT_ERROR_TEXT.save);
  });

  it('separates a read failure from a save failure and never says "Anda"', () => {
    expect(toIndonesian(new RepositoryError('something new'), 'load')).toBe(GENERIC_LOAD_ERROR);
    expect(toIndonesian(new Error('raw'), 'load')).toBe(GENERIC_LOAD_ERROR);
    expect(GENERIC_LOAD_ERROR).toContain('Data tidak berubah');
    expect(CONTEXT_ERROR_TEXT.save).toBe(
      'Catatan belum tersimpan. Tidak ada data yang berubah. Coba lagi. Jika tetap gagal, tutup aplikasi sepenuhnya lalu buka lagi.',
    );
    expect(GENERIC_LOAD_ERROR).not.toContain('Anda');
    expect(BACKUP_ERROR_TEXT.safety_failed).not.toContain('Anda');
  });
});

describe('toIndonesian: one unknown-error text per context', () => {
  const contexts = Object.keys(CONTEXT_ERROR_TEXT) as ErrorContext[];

  it.each(contexts)('context %s returns its own text for unknown errors', (context) => {
    const text = CONTEXT_ERROR_TEXT[context];
    expect(toIndonesian(new RepositoryError('something new'), context)).toBe(text);
    expect(toIndonesian(new Error('raw'), context)).toBe(text);
    expect(toIndonesian('text', context)).toBe(text);
    expect(text).not.toMatch(/Anda|Kalau|file/);
  });

  it('keeps every context text different', () => {
    expect(new Set(Object.values(CONTEXT_ERROR_TEXT)).size).toBe(contexts.length);
    expect(CONTEXT_ERROR_TEXT.load).toBe(GENERIC_LOAD_ERROR);
  });

  it('does not claim the data is unchanged after an unknown restore error', () => {
    expect(CONTEXT_ERROR_TEXT.restore).toContain('belum bisa dipastikan');
    expect(CONTEXT_ERROR_TEXT.restore).not.toContain('Data tidak berubah');
  });

  it('keeps known errors mapped before the context text', () => {
    expect(toIndonesian(new RepositoryError('member name must not be empty'), 'archive')).toBe('Nama anggota tidak boleh kosong.');
  });
});

describe('toIndonesian: migration 0005 triggers and archive texts', () => {
  it('maps the raw trigger messages (plain driver errors) to Indonesian', () => {
    expect(toIndonesian(new Error('a member of the active period cannot be archived'))).toBe('Anggota masih ikut periode aktif, jadi belum bisa diarsipkan.');
    expect(toIndonesian(new Error('Error code 19: an archived member cannot join a period'))).toBe('Anggota yang diarsipkan tidak bisa ikut periode. Aktifkan lagi dulu di halaman Anggota.');
  });

  it('gives a next step for every archive block', () => {
    expect(archiveBlockText('in_active_period', 0)).toBe('Belum bisa diarsipkan: masih ikut periode aktif. Arsipkan setelah periodenya berakhir.');
    expect(archiveBlockText('has_loan', 100000)).toBe('Belum bisa diarsipkan: masih punya sisa pinjaman Rp100.000. Lunasi dulu di Pinjaman anggota.');
  });

  it('writes the credit block with a plain hyphen, never a long dash', () => {
    const text = archiveBlockText('has_credit', 15000);
    expect(text).toBe('Belum bisa diarsipkan: masih punya titipan Rp15.000. Kembalikan dulu di Titipan anggota.');
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('toIndonesian: backup and restore (M7)', () => {
  const codes = Object.keys(BACKUP_ERROR_TEXT) as BackupErrorCode[];

  it.each(codes)('maps the code %s to Indonesian text', (code) => {
    const text = toIndonesian(new BackupError(code, 'English detail with a path C:\\data\\file.db'));
    expect(text).toBe(BACKUP_ERROR_TEXT[code]);
    expect(text).not.toMatch(/[\\/]/);
    expect(text).not.toMatch(/\.db\b/);
    expect(text.toLowerCase()).not.toContain('kredit');
  });

  it('names the share feature without the old "Menu bagikan" wording', () => {
    expect(BACKUP_ERROR_TEXT.share_unavailable).not.toContain('Menu bagikan');
    expect(BACKUP_ERROR_TEXT.share_unavailable).toContain('berkas');
  });

  it.each(['file_empty', 'file_too_small', 'file_too_large', 'not_sqlite', 'version_missing', 'tables_missing', 'schema_mismatch', 'integrity', 'foreign_keys', 'invariant'] as const)(
    'tells what to do next for %s',
    (code) => {
      expect(BACKUP_ERROR_TEXT[code]).toMatch(/Pilih berkas cadangan yang (lain|benar)\.$/);
    },
  );

  it('covers every code of the domain', () => {
    expect(codes.length).toBe(17);
  });

  it('never shows the English detail', () => {
    expect(toIndonesian(new BackupError('unreadable', 'opening the file failed: disk I/O error'))).not.toMatch(/disk|opening/);
  });
});

describe('restoreErrorNeedsReload', () => {
  it('keeps the screens only when the live data is certainly untouched', () => {
    expect(restoreErrorNeedsReload(new BackupError('safety_failed', 'x'))).toBe(false);
    expect(restoreErrorNeedsReload(new BackupError('busy', 'x'))).toBe(false);
  });

  it.each(['restore_failed', 'unreadable', 'integrity'] as const)('reloads after %s', (code) => {
    expect(restoreErrorNeedsReload(new BackupError(code, 'x'))).toBe(true);
  });

  it('reloads after an unknown error (the data may have changed)', () => {
    expect(restoreErrorNeedsReload(new Error('boom'))).toBe(true);
  });

  it('the restore_failed text names the safety copy and holds no path', () => {
    expect(BACKUP_ERROR_TEXT.restore_failed).toContain('Salinan pengaman');
    expect(BACKUP_ERROR_TEXT.restore_failed).not.toMatch(/[\/]/);
  });
});
