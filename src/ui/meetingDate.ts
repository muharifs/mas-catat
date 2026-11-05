// Indonesian text for the domain's meeting-date problems (see meetingDateProblem in src/domain/schedule.ts).
import type { MeetingDateProblem } from '@/domain/schedule';
import { formatDate } from './dates';

export function describeDateProblem(problem: MeetingDateProblem): string {
  switch (problem.kind) {
    case 'not_real':
      return 'Tanggal tidak valid. Gunakan format TTTT-BB-HH, misalnya 2026-01-04.';
    case 'not_after_previous':
      return `Tanggal harus setelah pertemuan sebelumnya (${formatDate(problem.limit)}).`;
    case 'not_before_next':
      return `Tanggal harus sebelum pertemuan berikutnya (${formatDate(problem.limit)}). Ubah dulu tanggal pertemuan berikutnya.`;
  }
}
