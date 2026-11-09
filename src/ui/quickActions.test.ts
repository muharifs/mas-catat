import { quickActionReasons } from './quickActions';

describe('quickActionReasons', () => {
  it('has no reasons while an active period runs a meeting with a host', () => {
    expect(quickActionReasons({ hasActivePeriod: true, hasAnyPeriod: true, currentWeek: { hostMemberId: 'a' } })).toEqual({
      iuran: null,
      tuanRumah: null,
      catatKas: null,
      jadwal: null,
    });
  });

  it('explains every disabled tile when there is no period at all', () => {
    expect(quickActionReasons({ hasActivePeriod: false, hasAnyPeriod: false, currentWeek: null })).toEqual({
      iuran: 'Belum ada periode aktif.',
      tuanRumah: 'Belum ada periode aktif.',
      catatKas: 'Buat periode dulu.',
      jadwal: 'Belum ada periode aktif.',
    });
  });

  it('keeps Catat kas open when only ended periods exist', () => {
    const r = quickActionReasons({ hasActivePeriod: false, hasAnyPeriod: true, currentWeek: null });
    expect(r.catatKas).toBeNull();
    expect(r.iuran).toBe('Belum ada periode aktif.');
  });

  it('asks for a host first, and says so when every meeting is closed', () => {
    expect(quickActionReasons({ hasActivePeriod: true, hasAnyPeriod: true, currentWeek: { hostMemberId: null } }).tuanRumah).toBe('Tentukan tuan rumah dulu.');
    expect(quickActionReasons({ hasActivePeriod: true, hasAnyPeriod: true, currentWeek: null }).tuanRumah).toBe('Semua pertemuan sudah ditutup.');
  });
});
