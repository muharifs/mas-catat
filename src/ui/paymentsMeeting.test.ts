import { meetingStatusBlock, type MeetingStatusInput, type MeetingStatusWeek } from './paymentsMeeting';

const names = new Map([['m1', 'Budi']]);

function week(over: Partial<MeetingStatusWeek> = {}): MeetingStatusWeek {
  return { number: 3, date: '2026-11-17', hostMemberId: 'm1', status: 'open', ...over };
}

function input(w: MeetingStatusWeek, over: Partial<MeetingStatusInput> = {}): MeetingStatusInput {
  return { weeks: [w], throughWeek: w.number, meetingCount: 18, periodActive: true, memberNames: names, ...over };
}

describe('meetingStatusBlock', () => {
  it('open with a host', () => {
    const b = meetingStatusBlock(input(week()))!;
    expect(b.title).toBe('Pertemuan 3 dari 18');
    expect(b.statusLabel).toBe('Terbuka');
    expect(b.badgeTone).toBe('brand');
    expect(b.hostLine).toBe('Tuan rumah: Budi');
    expect(b.hostKnown).toBe(true);
    expect(b.dateLine).toBe('Tanggal: 17 Nov 2026');
    expect(b.throughLine).toBe('Tunggakan dihitung sampai pertemuan 3.');
    expect(b.accessibilityLabel).toBe(
      'Pertemuan 3 dari 18, Terbuka, tuan rumah Budi, tanggal 17 Nov 2026. Tunggakan dihitung sampai pertemuan 3.',
    );
  });

  it('open without a host: estimated date, host unknown', () => {
    const b = meetingStatusBlock(input(week({ hostMemberId: null })))!;
    expect(b.hostLine).toBe('Tuan rumah: Belum ditentukan');
    expect(b.hostKnown).toBe(false);
    expect(b.dateLine).toBe('Tanggal: 17 Nov 2026 (perkiraan)');
    expect(b.accessibilityLabel).toContain('belum ditentukan');
    expect(b.accessibilityLabel).toContain('perkiraan');
  });

  it('closed without a host: no estimate mark', () => {
    const b = meetingStatusBlock(input(week({ hostMemberId: null, status: 'closed' })))!;
    expect(b.dateLine).toBe('Tanggal: 17 Nov 2026');
    expect(b.hostKnown).toBe(false);
    expect(b.badgeTone).toBe('neutral');
  });

  it('closed with a host', () => {
    const b = meetingStatusBlock(input(week({ status: 'closed' })))!;
    expect(b.statusLabel).toBe('Ditutup');
    expect(b.badgeTone).toBe('neutral');
    expect(b.hostLine).toBe('Tuan rumah: Budi');
    expect(b.dateLine).not.toContain('perkiraan');
  });

  it('skipped with a stored host does not leak the name', () => {
    const b = meetingStatusBlock(input(week({ status: 'skipped' })))!;
    expect(b.hostLine).toBe('Tuan rumah: tidak ada');
    expect(b.hostKnown).toBe(false);
    expect(b.badgeTone).toBe('neutral');
    expect(b.accessibilityLabel).not.toContain('Budi');
    expect(b.accessibilityLabel).toContain('Dilewati');
    expect(b.accessibilityLabel).toContain('tidak ada tuan rumah');
  });

  it('unknown host id falls back to a dash', () => {
    expect(meetingStatusBlock(input(week({ hostMemberId: 'zzz' })))!.hostLine).toBe('Tuan rumah: -');
  });

  it('finished period uses the final through line', () => {
    const b = meetingStatusBlock(input(week({ status: 'closed' }), { periodActive: false }))!;
    expect(b.throughLine).toBe('Periode berakhir. Tunggakan dihitung sampai pertemuan terakhir.');
  });

  it('returns null without throughWeek or when the meeting does not exist', () => {
    expect(meetingStatusBlock(input(week(), { throughWeek: undefined }))).toBeNull();
    expect(meetingStatusBlock(input(week(), { throughWeek: 9 }))).toBeNull();
  });

  it('does not change its input', () => {
    const i = input(week());
    const copy = JSON.parse(JSON.stringify(i)) as MeetingStatusInput;
    meetingStatusBlock(i);
    expect(i.weeks).toEqual(copy.weeks);
    expect(i.throughWeek).toBe(copy.throughWeek);
    expect([...i.memberNames]).toEqual([['m1', 'Budi']]);
  });
  it('picks the week matching throughWeek among many and ignores the others', () => {
    const weeks = [
      week({ number: 1, status: 'closed', date: '2026-11-03' }),
      week({ number: 2, status: 'open', date: '2026-11-10', hostMemberId: null }),
      week({ number: 3, status: 'open', date: '2026-11-17', hostMemberId: 'm1' }),
    ];
    const b = meetingStatusBlock({ weeks, throughWeek: 2, meetingCount: 3, periodActive: true, memberNames: names })!;
    expect(b.title).toBe('Pertemuan 2 dari 3');
    expect(b.dateLine).toBe('Tanggal: 10 Nov 2026 (perkiraan)');
  });

  it('skipped meeting without a stored host: no estimate mark, host "tidak ada"', () => {
    const b = meetingStatusBlock(input(week({ status: 'skipped', hostMemberId: null })))!;
    expect(b.hostLine).toBe('Tuan rumah: tidak ada');
    expect(b.dateLine).toBe('Tanggal: 17 Nov 2026');
    expect(b.accessibilityLabel).not.toContain('belum ditentukan');
  });

  it('finished period whose last meeting was skipped keeps the final through line', () => {
    const b = meetingStatusBlock(input(week({ status: 'skipped' }), { periodActive: false }))!;
    expect(b.statusLabel).toBe('Dilewati');
    expect(b.throughLine).toBe('Periode berakhir. Tunggakan dihitung sampai pertemuan terakhir.');
  });
});
