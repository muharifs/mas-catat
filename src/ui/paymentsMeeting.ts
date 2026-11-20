// Status card of the payment list: the meeting that arrears are counted through. Pure; shows stored data only, no money.
import type { WeekState } from '@/db/weeks';
import { formatDate } from './dates';
import { isEstimatedMeetingDate, withEstimateLabel } from './meetingEstimate';
import { MEETING_STATUS_LABELS } from './reportLabels';

export interface MeetingStatusWeek {
  number: number;
  date: string;
  hostMemberId: string | null;
  status: WeekState;
}

export interface MeetingStatusInput {
  weeks: readonly MeetingStatusWeek[];
  throughWeek: number | undefined;
  meetingCount: number;
  periodActive: boolean;
  memberNames: ReadonlyMap<string, string>;
}

export interface MeetingStatusBlock {
  title: string;
  status: WeekState;
  statusLabel: string;
  badgeTone: 'brand' | 'neutral';
  hostLine: string;
  /** False when no host is shown as a name (not chosen yet, or skipped): the line is drawn in the secondary colour. */
  hostKnown: boolean;
  dateLine: string;
  throughLine: string;
  accessibilityLabel: string;
}

export function meetingStatusBlock(input: MeetingStatusInput): MeetingStatusBlock | null {
  const { throughWeek, meetingCount, periodActive, memberNames } = input;
  if (throughWeek === undefined) return null;
  const week = input.weeks.find((w) => w.number === throughWeek);
  if (!week) return null;

  const skipped = week.status === 'skipped';
  const noHostYet = !skipped && week.hostMemberId === null;
  const hostName = skipped || week.hostMemberId === null ? null : (memberNames.get(week.hostMemberId) ?? '-');
  const estimated = isEstimatedMeetingDate(week);

  const hostLine = skipped ? 'Tuan rumah: tidak ada' : noHostYet ? 'Tuan rumah: Belum ditentukan' : `Tuan rumah: ${hostName}`;
  const hostKnown = hostName !== null;
  const date = formatDate(week.date);
  const dateLine = `Tanggal: ${withEstimateLabel(date, estimated)}`;
  const throughLine = periodActive
    ? `Tunggakan dihitung sampai pertemuan ${week.number}.`
    : 'Periode berakhir. Tunggakan dihitung sampai pertemuan terakhir.';
  const title = `Pertemuan ${week.number} dari ${meetingCount}`;
  const statusLabel = MEETING_STATUS_LABELS[week.status];

  const hostSpoken = skipped ? 'tidak ada tuan rumah' : noHostYet ? 'tuan rumah belum ditentukan' : `tuan rumah ${hostName}`;
  const dateSpoken = `tanggal ${date}${estimated ? ' perkiraan' : ''}`;

  return {
    title,
    status: week.status,
    statusLabel,
    badgeTone: week.status === 'open' ? 'brand' : 'neutral',
    hostLine,
    hostKnown,
    dateLine,
    throughLine,
    accessibilityLabel: `${title}, ${statusLabel}, ${hostSpoken}, ${dateSpoken}. ${throughLine}`,
  };
}
