import { describeDateProblem } from './meetingDate';

describe('describeDateProblem', () => {
  it('explains each problem in Indonesian, with the limit date in readable form', () => {
    expect(describeDateProblem({ kind: 'not_real' })).toMatch(/TTTT-BB-HH/);
    expect(describeDateProblem({ kind: 'not_after_previous', limit: '2026-01-04' })).toBe(
      'Tanggal harus setelah pertemuan sebelumnya (4 Jan 2026).',
    );
    expect(describeDateProblem({ kind: 'not_before_next', limit: '2026-01-11' })).toMatch(/sebelum pertemuan berikutnya \(11 Jan 2026\)/);
  });
});
