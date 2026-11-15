// "Pengingat" on Beranda: the list of things the owner should do now. Pure: Beranda loads the facts, this decides
// which rows exist, their order and their words. No money is computed here (the arrears count comes from the repository).
import type { BackupReminder } from '@/domain/backup';
import { reminderText } from './backupLabels';
import { formatDate } from './dates';

export interface ReminderWeek {
  number: number;
  /** 'skipped' (decision 33) is neither open nor closed: it never asks to be closed or paid out. */
  status: 'open' | 'closed' | 'skipped';
  /** ISO date of the meeting. */
  date: string;
  hostMemberId: string | null;
}

export interface HomeReminderInput {
  /** Today as ISO "YYYY-MM-DD". */
  today: string;
  /** True when a period is active. Without it only the backup reminder can appear. */
  hasActivePeriod: boolean;
  /** Every meeting of the active period (any order). */
  weeks: readonly ReminderWeek[];
  /** Number of the last meeting (= member count). Its "Tentukan" hint mentions that it can be skipped (decision 33). */
  lastMeetingNumber: number;
  /** Meetings whose host payout is in force (repos.ledger.getWeekPayout is not null). */
  paidPayoutWeeks: ReadonlySet<number>;
  /** Name of the host of the oldest open meeting, or null. */
  currentHostName: string | null;
  /** Members in arrears through the oldest open meeting (getArrearsSummary.membersInArrears). */
  membersInArrears: number;
  backup: BackupReminder;
}

export type ReminderKind = 'pay_host' | 'choose_host' | 'close_week' | 'close_period' | 'backup';

export interface Reminder {
  /** Unique within one list. */
  key: string;
  kind: ReminderKind;
  /** Meeting number the action is about (not set for close_period and backup). */
  week?: number;
  title: string;
  detail: string;
  /** The single button of the row. */
  actionLabel: string;
  /** Needs doing now (warn colour); the rest is information (teal). A word always carries the meaning too. */
  urgent: boolean;
}

/**
 * Rows in order (the order is the priority):
 *  1. a CLOSED meeting with a host whose payout is not recorded (it blocks "Akhiri periode");
 *  2. the oldest open meeting: host not paid, date today or past;
 *  3. the oldest open meeting without a host;
 *  4. the oldest open meeting with a host, date today or past: ready to close;
 *  5. the next meeting without a host, once the current one has a host;
 *  6. every meeting closed or skipped: end the period;
 *  7. backup due.
 */
export function homeReminders(input: HomeReminderInput): Reminder[] {
  const rows: Reminder[] = [];
  if (input.hasActivePeriod) {
    const weeks = [...input.weeks].sort((a, b) => a.number - b.number);
    // A skipped meeting is not open and not closed: it never gets a pay_host or close_week row (decision 33).
    const open = weeks.filter((w) => w.status === 'open');
    const anySkipped = weeks.some((w) => w.status === 'skipped');
    const current = open[0];
    const next = open[1];

    for (const w of weeks) {
      if (w.status === 'closed' && w.hostMemberId !== null && !input.paidPayoutWeeks.has(w.number)) {
        rows.push({
          key: `pay_host_${w.number}`,
          kind: 'pay_host',
          week: w.number,
          title: `Tuan rumah pertemuan ${w.number} belum dibayar`,
          detail: 'Pertemuan sudah ditutup, pembayaran tuan rumah belum dicatat.',
          actionLabel: 'Bayar tuan rumah',
          urgent: true,
        });
      }
    }

    if (current) {
      const due = current.date <= input.today;
      if (current.hostMemberId !== null && due && !input.paidPayoutWeeks.has(current.number)) {
        rows.push({
          key: `pay_host_${current.number}`,
          kind: 'pay_host',
          week: current.number,
          title: `Tuan rumah pertemuan ${current.number} belum dibayar`,
          detail: `Tuan rumah: ${input.currentHostName ?? '-'}. Pertemuan ${formatDate(current.date)}.`,
          actionLabel: 'Bayar tuan rumah',
          urgent: true,
        });
      }
      if (current.hostMemberId === null) {
        rows.push({
          key: `choose_host_${current.number}`,
          kind: 'choose_host',
          week: current.number,
          title: `Tuan rumah pertemuan ${current.number} belum ditentukan`,
          detail:
            current.number === input.lastMeetingNumber && input.lastMeetingNumber >= 2
              ? 'Tanpa tuan rumah, pertemuan tidak bisa ditutup. Jika tuan rumahnya tidak bisa menerima tamu, pertemuan ini bisa dilewati.'
              : 'Tanpa tuan rumah, pertemuan tidak bisa ditutup.',
          actionLabel: 'Tentukan',
          urgent: true,
        });
      } else if (due) {
        const arrears = input.membersInArrears > 0 ? ` Ada ${input.membersInArrears} anggota menunggak.` : '';
        rows.push({
          key: `close_week_${current.number}`,
          kind: 'close_week',
          week: current.number,
          title: `Pertemuan ${current.number} siap ditutup`,
          detail: `Tanggalnya ${formatDate(current.date)}.${arrears}`,
          actionLabel: 'Tutup pertemuan',
          urgent: false,
        });
      }
      if (current.hostMemberId !== null && next && next.hostMemberId === null) {
        rows.push({
          key: `choose_host_${next.number}`,
          kind: 'choose_host',
          week: next.number,
          title: `Tuan rumah pertemuan ${next.number} belum ditentukan`,
          detail: 'Tanggal sementara masih perkiraan.',
          actionLabel: 'Tentukan',
          urgent: false,
        });
      }
    } else if (weeks.length > 0) {
      rows.push({
        key: 'close_period',
        kind: 'close_period',
        title: anySkipped ? 'Semua pertemuan sudah ditutup atau dilewati' : 'Semua pertemuan sudah ditutup',
        detail: 'Periode siap diakhiri.',
        actionLabel: 'Akhiri periode',
        urgent: false,
      });
    }
  }

  if (input.backup.due) {
    rows.push({
      key: 'backup',
      kind: 'backup',
      title: input.backup.daysSince === null ? 'Cadangan belum dibuat' : `Cadangan terakhir ${input.backup.daysSince} hari lalu`,
      detail: reminderText(input.backup),
      actionLabel: 'Buat cadangan',
      urgent: false,
    });
  }
  return rows;
}
