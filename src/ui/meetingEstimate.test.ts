import { isEstimatedMeetingDate, withEstimateLabel } from './meetingEstimate';

describe('isEstimatedMeetingDate', () => {
  it('is true only for an open meeting without a host', () => {
    expect(isEstimatedMeetingDate({ status: 'open', hostMemberId: null })).toBe(true);
    expect(isEstimatedMeetingDate({ status: 'open', hostMemberId: 'm1' })).toBe(false);
    expect(isEstimatedMeetingDate({ status: 'closed', hostMemberId: null })).toBe(false);
    expect(isEstimatedMeetingDate({ status: 'skipped', hostMemberId: null })).toBe(false);
  });
});

describe('withEstimateLabel', () => {
  it('adds the label only for an estimate, the same text on every screen', () => {
    expect(withEstimateLabel('17 Nov 2026', true)).toBe('17 Nov 2026 (perkiraan)');
    expect(withEstimateLabel('17 Nov 2026', false)).toBe('17 Nov 2026');
  });
});
