import { firstRunChecklist, type ChecklistInput } from './checklist';

const fresh: ChecklistInput = { memberCount: 0, hasOpeningBalance: false, periodCount: 0, hasEndedPeriod: false, activePeriod: null };
const doneKeys = (input: ChecklistInput) =>
  firstRunChecklist(input)
    .items.filter((i) => i.done)
    .map((i) => i.key);

describe('firstRunChecklist', () => {
  it('starts with four open steps in the agreed order', () => {
    const c = firstRunChecklist(fresh);
    expect(c.visible).toBe(true);
    expect(c.items.map((i) => i.label)).toEqual([
      'Tambah anggota',
      'Isi saldo awal kas',
      'Buat periode',
      'Tentukan tuan rumah pertemuan 1',
    ]);
    expect(doneKeys(fresh)).toEqual([]);
  });

  it('ticks each step when it is done', () => {
    expect(doneKeys({ ...fresh, memberCount: 3 })).toEqual(['members']);
    expect(doneKeys({ ...fresh, memberCount: 3, hasOpeningBalance: true })).toEqual(['members', 'opening']);
    const withPeriod = { ...fresh, memberCount: 3, periodCount: 1, activePeriod: { hasClosedMeeting: false, firstMeetingHasHost: false } };
    expect(doneKeys(withPeriod)).toEqual(['members', 'period']);
    const withHost = { ...withPeriod, activePeriod: { hasClosedMeeting: false, firstMeetingHasHost: true } };
    expect(doneKeys(withHost)).toEqual(['members', 'period', 'host']);
  });

  it('hides itself when all four are done', () => {
    const all: ChecklistInput = {
      memberCount: 3,
      hasOpeningBalance: true,
      periodCount: 1,
      hasEndedPeriod: false,
      activePeriod: { hasClosedMeeting: false, firstMeetingHasHost: true },
    };
    expect(firstRunChecklist(all).visible).toBe(false);
  });

  it('stays hidden for an owner who is past first-run, even without an opening balance', () => {
    const running: ChecklistInput = {
      memberCount: 3,
      hasOpeningBalance: false,
      periodCount: 1,
      hasEndedPeriod: false,
      activePeriod: { hasClosedMeeting: true, firstMeetingHasHost: true },
    };
    expect(firstRunChecklist(running).visible).toBe(false);
    expect(firstRunChecklist({ ...running, activePeriod: null, hasEndedPeriod: true }).visible).toBe(false);
  });
});
