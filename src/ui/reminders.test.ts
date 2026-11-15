import { homeReminders, type HomeReminderInput, type ReminderWeek } from './reminders';

const week = (number: number, status: 'open' | 'closed' | 'skipped', date: string, host: string | null = 'h'): ReminderWeek => ({
  number,
  status,
  date,
  hostMemberId: host,
});

const base: HomeReminderInput = {
  today: '2026-11-10',
  hasActivePeriod: true,
  weeks: [],
  lastMeetingNumber: 19,
  paidPayoutWeeks: new Set(),
  currentHostName: 'Budi',
  membersInArrears: 0,
  backup: { due: false, daysSince: 2 },
};

const kinds = (input: Partial<HomeReminderInput>) => homeReminders({ ...base, ...input }).map((r) => `${r.kind}:${r.week ?? '-'}`);

describe('homeReminders', () => {
  it('is empty when nothing needs doing', () => {
    // Current meeting has a host and lies in the future, and the next one has a host.
    const weeks = [week(1, 'open', '2026-11-17'), week(2, 'open', '2026-11-24')];
    expect(kinds({ weeks })).toEqual([]);
  });

  it('is empty without a period and without a due backup', () => {
    expect(kinds({ hasActivePeriod: false })).toEqual([]);
  });

  it('shows only the backup row when there is no active period', () => {
    const rows = homeReminders({ ...base, hasActivePeriod: false, backup: { due: true, daysSince: null } });
    expect(rows.map((r) => r.kind)).toEqual(['backup']);
  });

  it('row 1: a closed meeting with a host and no payout', () => {
    const weeks = [week(1, 'closed', '2026-11-03'), week(2, 'open', '2026-11-17')];
    const rows = homeReminders({ ...base, weeks });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'pay_host', week: 1, urgent: true, actionLabel: 'Bayar tuan rumah' });
    expect(rows[0]?.title).toBe('Tuan rumah pertemuan 1 belum dibayar');
  });

  it('row 1 is skipped once the payout is recorded', () => {
    const weeks = [week(1, 'closed', '2026-11-03'), week(2, 'open', '2026-11-17')];
    expect(kinds({ weeks, paidPayoutWeeks: new Set([1]) })).toEqual([]);
  });

  it('row 1 lists every unpaid closed meeting, oldest first', () => {
    const weeks = [week(2, 'closed', '2026-11-10'), week(1, 'closed', '2026-11-03'), week(3, 'open', '2026-11-24')];
    expect(kinds({ weeks })).toEqual(['pay_host:1', 'pay_host:2']);
  });

  it('row 2: current meeting today or past, host set, not paid; names the host and the date', () => {
    const weeks = [week(1, 'open', '2026-11-10'), week(2, 'open', '2026-11-17')];
    const rows = homeReminders({ ...base, weeks });
    expect(rows.map((r) => r.kind)).toEqual(['pay_host', 'close_week']);
    expect(rows[0]?.detail).toBe('Tuan rumah: Budi. Pertemuan 10 Nov 2026.');
  });

  it('row 2 is skipped when the date is still in the future or the host is paid', () => {
    expect(kinds({ weeks: [week(1, 'open', '2026-11-11'), week(2, 'open', '2026-11-18')] })).toEqual([]);
    expect(kinds({ weeks: [week(1, 'open', '2026-11-03'), week(2, 'open', '2026-11-10')], paidPayoutWeeks: new Set([1]) })).toEqual(['close_week:1']);
  });

  it('row 3: current meeting without a host, even when the date is in the future', () => {
    const weeks = [week(1, 'open', '2026-11-17', null), week(2, 'open', '2026-11-24', null)];
    const rows = homeReminders({ ...base, weeks });
    expect(rows.map((r) => `${r.kind}:${r.week}`)).toEqual(['choose_host:1']);
    expect(rows[0]).toMatchObject({ urgent: true, actionLabel: 'Tentukan', detail: 'Tanpa tuan rumah, pertemuan tidak bisa ditutup.' });
  });

  it('row 4: ready to close, with the arrears sentence only when someone is behind', () => {
    const weeks = [week(1, 'open', '2026-11-03'), week(2, 'open', '2026-11-17')];
    const clean = homeReminders({ ...base, weeks, paidPayoutWeeks: new Set([1]) });
    expect(clean).toHaveLength(1);
    expect(clean[0]).toMatchObject({ kind: 'close_week', week: 1, actionLabel: 'Tutup pertemuan', urgent: false, detail: 'Tanggalnya 3 Nov 2026.' });
    const behind = homeReminders({ ...base, weeks, paidPayoutWeeks: new Set([1]), membersInArrears: 3 });
    expect(behind[0]?.detail).toBe('Tanggalnya 3 Nov 2026. Ada 3 anggota menunggak.');
  });

  it('row 5: next meeting without a host once the current one has a host', () => {
    const weeks = [week(1, 'open', '2026-11-17'), week(2, 'open', '2026-11-24', null)];
    const rows = homeReminders({ ...base, weeks });
    expect(rows.map((r) => `${r.kind}:${r.week}`)).toEqual(['choose_host:2']);
    expect(rows[0]?.detail).toBe('Tanggal sementara masih perkiraan.');
  });

  it('row 5 is not offered while the current meeting has no host', () => {
    const weeks = [week(1, 'open', '2026-11-17', null), week(2, 'open', '2026-11-24', null)];
    expect(kinds({ weeks })).toEqual(['choose_host:1']);
  });

  it('row 5 needs a next meeting (the last meeting has none)', () => {
    expect(kinds({ weeks: [week(1, 'open', '2026-11-17')] })).toEqual([]);
  });

  it('row 6: every meeting closed offers to end the period, below an unpaid host row', () => {
    const weeks = [week(1, 'closed', '2026-11-03'), week(2, 'closed', '2026-11-10')];
    expect(kinds({ weeks, paidPayoutWeeks: new Set([1, 2]) })).toEqual(['close_period:-']);
    expect(kinds({ weeks, paidPayoutWeeks: new Set([1]) })).toEqual(['pay_host:2', 'close_period:-']);
  });

  it('no meetings at all gives no row 6', () => {
    expect(kinds({ weeks: [] })).toEqual([]);
  });

  it('row 7: backup comes last, with words for never and for days', () => {
    const weeks = [week(1, 'open', '2026-11-03', null)];
    const never = homeReminders({ ...base, weeks, backup: { due: true, daysSince: null } });
    expect(never.map((r) => r.kind)).toEqual(['choose_host', 'backup']);
    expect(never[1]?.title).toBe('Cadangan belum dibuat');
    const old = homeReminders({ ...base, weeks: [], backup: { due: true, daysSince: 9 } });
    expect(old[0]).toMatchObject({ title: 'Cadangan terakhir 9 hari lalu', actionLabel: 'Buat cadangan', urgent: false });
  });

  it('keeps the full ordering and unique keys with everything at once', () => {
    const weeks = [week(1, 'closed', '2026-10-27'), week(2, 'open', '2026-11-03'), week(3, 'open', '2026-11-10', null)];
    const rows = homeReminders({ ...base, weeks, backup: { due: true, daysSince: 8 } });
    expect(rows.map((r) => r.kind)).toEqual(['pay_host', 'pay_host', 'close_week', 'choose_host', 'backup']);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe('homeReminders: a skipped last meeting (decision 33)', () => {
  const closedThrough18 = Array.from({ length: 18 }, (_, i) => week(i + 1, 'closed', '2026-05-05'));
  const allPaid = new Set(Array.from({ length: 18 }, (_, i) => i + 1));

  it('never asks to pay the host or close a skipped meeting, even with a host and a past date', () => {
    const weeks = [...closedThrough18, week(19, 'skipped', '2026-11-03', 'h19')];
    expect(kinds({ weeks, paidPayoutWeeks: allPaid })).toEqual(['close_period:-']);
  });

  it('says "ditutup atau dilewati" when something was skipped, and keeps the old words otherwise', () => {
    const skipped = homeReminders({ ...base, weeks: [...closedThrough18, week(19, 'skipped', '2026-11-03')], paidPayoutWeeks: allPaid });
    expect(skipped[0]).toMatchObject({
      kind: 'close_period',
      title: 'Semua pertemuan sudah ditutup atau dilewati',
      detail: 'Periode siap diakhiri.',
      actionLabel: 'Akhiri periode',
    });
    const plain = homeReminders({ ...base, weeks: [...closedThrough18, week(19, 'closed', '2026-11-03')], paidPayoutWeeks: new Set([...allPaid, 19]) });
    expect(plain[0]?.title).toBe('Semua pertemuan sudah ditutup');
  });

  it('a closed meeting before the skipped one still asks for its payout', () => {
    const weeks = [...closedThrough18, week(19, 'skipped', '2026-11-03')];
    expect(kinds({ weeks, paidPayoutWeeks: new Set([...allPaid].filter((n) => n !== 7)) })).toEqual(['pay_host:7', 'close_period:-']);
  });

  it('the last meeting without a host mentions that it can be skipped; earlier meetings do not', () => {
    const last = homeReminders({ ...base, weeks: [...closedThrough18, week(19, 'open', '2026-11-03', null)], paidPayoutWeeks: allPaid });
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({
      kind: 'choose_host',
      week: 19,
      actionLabel: 'Tentukan',
      detail: 'Tanpa tuan rumah, pertemuan tidak bisa ditutup. Jika tuan rumahnya tidak bisa menerima tamu, pertemuan ini bisa dilewati.',
    });
    const earlier = homeReminders({ ...base, weeks: [week(5, 'open', '2026-11-03', null), week(6, 'open', '2026-11-10', null)] });
    expect(earlier[0]?.detail).toBe('Tanpa tuan rumah, pertemuan tidak bisa ditutup.');
  });

  it('a one-member period is never offered a skip hint', () => {
    const rows = homeReminders({ ...base, lastMeetingNumber: 1, weeks: [week(1, 'open', '2026-11-03', null)] });
    expect(rows[0]?.detail).toBe('Tanpa tuan rumah, pertemuan tidak bisa ditutup.');
  });
});
