// Shared rule for the "(perkiraan)" label of a meeting date, so the Jadwal and the Pembayaran screens agree. Pure, display only.
// A meeting date is stored together with its host. An open meeting without a host has only an ESTIMATED date (computed
// from the previous meeting, never written to the database), so it is always labelled. Nothing here writes a date.
import type { WeekState } from '@/db/weeks';

export const ESTIMATE_SUFFIX = ' (perkiraan)';

/** True when the date of this meeting is an estimate: the meeting is open and has no host yet. */
export function isEstimatedMeetingDate(week: { status: WeekState; hostMemberId: string | null }): boolean {
  return week.status === 'open' && week.hostMemberId === null;
}

/** Appends " (perkiraan)" to an already formatted date when it is an estimate. */
export function withEstimateLabel(formattedDate: string, estimated: boolean): string {
  return estimated ? `${formattedDate}${ESTIMATE_SUFFIX}` : formattedDate;
}
