import type { WeekSkipPreview } from '@/domain/week-skip';
import {
  shouldLoadSkipPreview,
  SKIP_CARD_HELP,
  SKIP_DEFAULT_REASON,
  skipCard,
  skipCardTitle,
  skipDialogMessage,
  skipDisabledReason,
  skippedCloseDialogTail,
  skippedClosePrefix,
  skippedCloseNotice,
  skippedPaymentsLine,
  skippedRowHelp,
  skippedSentence,
  skippedTurnNewPeriodNotice,
  skippedTurnNotice,
  totalDuesHint,
  unskipDialogMessage,
  unskipFormTexts,
  unskipTitle,
} from './skipMeeting';

const preview = (patch: Partial<WeekSkipPreview> = {}): WeekSkipPreview => ({
  number: 19,
  eligible: true,
  blocker: null,
  prepaidTotal: 0,
  prepaidMembers: 0,
  ...patch,
});

describe('skip card', () => {
  it('only asks the repository when the last meeting is the oldest open one of an active period with 2+ members', () => {
    const base = { periodActive: true, memberCount: 19, oldestOpenNumber: 19 };
    expect(shouldLoadSkipPreview(base)).toBe(true);
    expect(shouldLoadSkipPreview({ ...base, oldestOpenNumber: 18 })).toBe(false);
    expect(shouldLoadSkipPreview({ ...base, oldestOpenNumber: null })).toBe(false);
    expect(shouldLoadSkipPreview({ ...base, periodActive: false })).toBe(false);
    expect(shouldLoadSkipPreview({ periodActive: true, memberCount: 1, oldestOpenNumber: 1 })).toBe(false);
  });

  it('is enabled when the repository says eligible', () => {
    expect(skipCard(preview())).toEqual({ number: 19, enabled: true, reason: null });
    expect(skipCard(null)).toBeNull();
  });

  it('is disabled with a reason for the two blockers the owner can fix', () => {
    const unpaid = preview({ eligible: false, blocker: { code: 'host_unpaid', message: 'x', weeks: [7, 9] } });
    expect(skipCard(unpaid)).toEqual({ number: 19, enabled: false, reason: 'Bayar dulu tuan rumah pertemuan 7, 9.' });
    const stands = preview({ eligible: false, blocker: { code: 'payout_stands', message: 'x', weeks: [19] } });
    expect(skipCard(stands)?.reason).toBe('Pembayaran tuan rumah pertemuan 19 sudah dicatat. Koreksi dulu pembayarannya.');
    expect(skipDisabledReason({ code: 'host_unpaid', message: 'x', weeks: [3, 4, 5] }, 19)).toBe('Bayar dulu tuan rumah pertemuan 3 sampai 5.');
  });

  it('is not shown for blockers that are not about paying hosts', () => {
    for (const code of ['period_ended', 'too_few_members', 'not_last', 'already_skipped', 'week_closed', 'earlier_open'] as const) {
      expect(skipCard(preview({ eligible: false, blocker: { code, message: 'x', weeks: [] } }))).toBeNull();
    }
  });

  it('words the card without "Anda", "Kalau" or "selesai" and says it is not a holiday', () => {
    expect(skipCardTitle(19)).toBe('Lewati pertemuan 19');
    expect(SKIP_CARD_HELP).toContain('Ini bukan libur');
    for (const text of [SKIP_CARD_HELP, SKIP_DEFAULT_REASON, skipDialogMessage(19, preview()), unskipDialogMessage(19)]) {
      expect(text).not.toMatch(/\bAnda\b|\bKalau\b|\bselesai\b/);
    }
  });
});

describe('skip dialog', () => {
  it('uses the prepaid numbers of the repository', () => {
    const text = skipDialogMessage(19, preview({ prepaidTotal: 45_000, prepaidMembers: 3 }));
    expect(text).toContain('Lewati pertemuan 19?');
    expect(text).toContain('(Rp45.000 dari 3 anggota) menjadi titipan dan dibawa ke periode berikutnya');
    expect(text).toContain('Pelewatan bisa dibatalkan sampai periode berakhir.');
    expect(text.split('\n\n')).toHaveLength(4);
  });

  it('says so when nothing was paid ahead', () => {
    expect(skipDialogMessage(19, preview())).toContain('Belum ada iuran yang dibayar di muka untuk pertemuan ini.');
  });

  it('has a default reason the owner can change', () => {
    expect(SKIP_DEFAULT_REASON).toBe('Tuan rumah tidak bisa menerima tamu');
  });
});

describe('cancel a skip', () => {
  it('words the form and the dialog', () => {
    expect(unskipTitle(19)).toBe('Batalkan pelewatan pertemuan 19');
    expect(unskipDialogMessage(19)).toContain('Pertemuan 19 dibuka lagi.');
    expect(unskipFormTexts(19)).toEqual({
      explain: 'Pertemuan 19 dibuka lagi dan iuran mulai dihitung lagi. Alasan disimpan sebagai catatan perubahan.',
      reasonLabel: 'Alasan pembatalan (wajib)',
      placeholder: 'Contoh: tuan rumah ternyata bisa menerima tamu',
      requiredText: 'Alasan pembatalan wajib diisi.',
    });
  });
});

describe('skipped meeting texts', () => {
  it('names the member whose turn moved, or stays general', () => {
    expect(skippedRowHelp('Budi')).toBe('Tidak ada iuran dan tidak ada pembayaran tuan rumah. Giliran Budi pindah ke periode berikutnya.');
    expect(skippedRowHelp(null)).toBe('Tidak ada iuran dan tidak ada pembayaran tuan rumah. Giliran tuan rumahnya pindah ke periode berikutnya.');
  });

  it('adds sentences to the close screens only when something was skipped', () => {
    expect(skippedClosePrefix([19])).toBe('Pertemuan 19 dilewati, jadi tidak perlu ditutup. ');
    expect(skippedClosePrefix([])).toBe('');
    expect(skippedCloseNotice([])).toBeNull();
    expect(skippedCloseNotice([19])).toBe(
      'Pertemuan 19 dilewati: tidak ada iuran dan tidak ada pembayaran tuan rumah. Iuran yang dibayar di muka menjadi titipan dan dibawa ke periode berikutnya. Pelewatan bisa dibatalkan di Jadwal sampai periode berakhir.',
    );
    expect(skippedCloseDialogTail([19])).toBe(' Pelewatan pertemuan 19 juga tidak bisa dibatalkan lagi.');
    expect(skippedCloseDialogTail([])).toBe('');
    expect(skippedSentence([19])).toBe('Pertemuan 19 dilewati.');
    expect(skippedSentence([])).toBe('');
  });

  it('adds the Pembayaran line only when the meeting the arrears run through is skipped', () => {
    expect(skippedPaymentsLine(19, [19])).toBe('Pertemuan 19 dilewati: tidak ada iuran.');
    expect(skippedPaymentsLine(19, [])).toBeNull();
    expect(skippedPaymentsLine(18, [19])).toBeNull();
  });

  it('extends the total dues hint of the period report', () => {
    expect(totalDuesHint(false)).toBe('Rp15.000 x anggota x pertemuan');
    expect(totalDuesHint(true)).toBe('Rp15.000 x anggota x pertemuan. Pertemuan yang dilewati tidak dihitung.');
  });

  it('words the new-period hints for a selected and a not selected member', () => {
    expect(skippedTurnNotice('Budi', 'Periode 1', 19)).toBe('Budi belum sempat jadi tuan rumah di Periode 1 karena pertemuan 19 dilewati.');
    expect(skippedTurnNewPeriodNotice('Budi', 'Periode 1', 19, true)).toBe(
      'Budi belum sempat jadi tuan rumah di Periode 1 karena pertemuan 19 dilewati. Pilih Budi sebagai tuan rumah pertemuan 1.',
    );
    expect(skippedTurnNewPeriodNotice('Budi', 'Periode 1', 19, false)).toBe(
      'Budi belum sempat jadi tuan rumah di Periode 1 karena pertemuan 19 dilewati, tetapi tidak dipilih di periode ini.',
    );
  });
});
