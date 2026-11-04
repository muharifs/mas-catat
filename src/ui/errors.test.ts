import { MigrationError, RepositoryError } from '@/db/errors';
import { DomainError } from '@/domain/money';
import { GENERIC_ERROR, toIndonesian } from './errors';

describe('toIndonesian', () => {
  it.each([
    [new RepositoryError('member name must not be empty'), 'Nama anggota tidak boleh kosong.'],
    [new RepositoryError('member name already exists: Budi'), 'Nama anggota sudah ada. Pakai nama lain.'],
    [new RepositoryError('another period is still active; end it before creating a new one'), 'Masih ada periode yang aktif. Akhiri dulu sebelum membuat periode baru.'],
    [new RepositoryError('period still has open weeks; close every week first'), 'Periode belum bisa diakhiri karena masih ada minggu yang belum ditutup.'],
    [new RepositoryError('week 3 is closed; its host cannot be changed'), 'Minggu yang sudah ditutup tidak bisa diganti tuan rumahnya.'],
    [new RepositoryError('cannot swap a week with itself'), 'Pilih dua minggu yang berbeda.'],
    [new RepositoryError('period abc not found'), 'Periode tidak ditemukan.'],
    [new DomainError('startDate is not a real calendar date: 2026-02-31'), 'Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.'],
    [new DomainError('memberCount must be a positive integer, got 0'), 'Pilih minimal satu anggota.'],
  ])('maps %s', (error, expected) => {
    expect(toIndonesian(error)).toBe(expected);
  });

  it('maps migration failures', () => {
    expect(toIndonesian(new MigrationError('boom'))).toMatch(/Database gagal/);
  });

  it('falls back to a generic message and never leaks English', () => {
    expect(toIndonesian(new RepositoryError('something new'))).toBe(GENERIC_ERROR);
    expect(toIndonesian(new Error('raw'))).toBe(GENERIC_ERROR);
    expect(toIndonesian('text')).toBe(GENERIC_ERROR);
  });
});
