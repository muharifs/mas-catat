import type { PaymentPreview } from '@/domain/payment-preview';
import { arrearsRemainderNote, closeWeekMessage, describeWeeks, overdueNotice, paymentChoiceLabel, paymentConfirmTitle, swipePaymentToast, toasts } from './messages';

describe('paymentConfirmTitle', () => {
  it('says the whole payment is titipan when nothing settles dues, and "Sebagian" only for a part', () => {
    expect(paymentConfirmTitle({ amount: 30_000, allocatedAmount: 0, creditAmount: 30_000 })).toBe('Rp30.000 menjadi titipan');
    expect(paymentConfirmTitle({ amount: 30_000, allocatedAmount: 15_000, creditAmount: 15_000 })).toBe('Sebagian menjadi titipan - Rp30.000');
    expect(paymentConfirmTitle({ amount: 30_000, allocatedAmount: 30_000, creditAmount: 0 })).toBe('Konfirmasi pembayaran Rp30.000');
  });
});

describe('closeWeekMessage', () => {
  it('mentions the arrears of the meeting being closed, as a warning only', () => {
    expect(closeWeekMessage(3, '2026-01-04', { membersInArrears: 2, totalArrears: 45_000 })).toBe(
      'Tutup pertemuan 3 (4 Jan 2026)? 2 anggota belum lunas sampai pertemuan ini: total Rp45.000. Tuan rumah dan tanggal tidak bisa diubah lagi dan penutupan tidak bisa dibatalkan.',
    );
  });

  it('leaves the arrears sentence out when everyone is settled', () => {
    expect(closeWeekMessage(3, '2026-01-04', { membersInArrears: 0, totalArrears: 0 })).toBe(
      'Tutup pertemuan 3 (4 Jan 2026)? Tuan rumah dan tanggal tidak bisa diubah lagi dan penutupan tidak bisa dibatalkan.',
    );
    expect(closeWeekMessage(1, '2026-01-04', null)).toMatch(/^Tutup pertemuan 1 \(4 Jan 2026\)\? Tuan rumah/);
  });
});

describe('overdueNotice', () => {
  it('says how many days the open meeting date is past', () => {
    expect(overdueNotice('2026-01-04', '2026-01-16')).toBe(
      'Tanggal 4 Jan sudah lewat 12 hari. Jika libur, biarkan terbuka dan ubah tanggalnya saat pertemuan jadi.',
    );
    expect(overdueNotice('2026-01-04', '2026-01-05')).toMatch(/sudah lewat 1 hari/);
  });

  it('is silent today and for a future date', () => {
    expect(overdueNotice('2026-01-04', '2026-01-04')).toBeNull();
    expect(overdueNotice('2026-01-11', '2026-01-04')).toBeNull();
  });

  it('has no "libur" button text, only advice', () => {
    expect(overdueNotice('2026-01-04', '2026-02-04')).not.toMatch(/tombol/i);
  });
});

describe('paymentChoiceLabel and arrearsRemainderNote', () => {
  it('labels the fixed and arrears chips', () => {
    expect(paymentChoiceLabel({ kind: 'weeks', weeks: 2, amount: 30_000 }, false)).toBe('2 pertemuan Rp30.000');
    expect(paymentChoiceLabel({ kind: 'arrears', amount: 75_000 }, false)).toBe('Lunasi tunggakan Rp75.000');
  });

  it('does not say "Lunasi" when part of the arrears cannot be paid alone', () => {
    expect(paymentChoiceLabel({ kind: 'arrears', amount: 30_000 }, true)).toBe('Tunggakan Rp30.000');
    expect(arrearsRemainderNote(5_000)).toMatch(/Rp5\.000 tidak bisa dibayar sendiri.*kelipatan Rp15\.000/);
    expect(arrearsRemainderNote(0)).toBeNull();
  });
});

describe('toasts', () => {
  it('words each success message', () => {
    expect(toasts.payment(30_000, 'Budi')).toBe('Pembayaran Rp30.000 dari Budi tersimpan');
    expect(toasts.weekClosed(3)).toBe('Pertemuan 3 ditutup');
    expect(toasts.host(3, 'Budi')).toBe('Tuan rumah pertemuan 3: Budi tersimpan');
    expect(toasts.payout(100_000, 'Budi')).toBe('Pembayaran tuan rumah Rp100.000 untuk Budi tersimpan');
    expect(toasts.kas('Saldo awal', 500_000)).toBe('Saldo awal Rp500.000 tersimpan');
    expect(toasts.periodSaved('Periode 2')).toBe('Periode "Periode 2" tersimpan');
    expect(toasts.periodClosed('Periode 1')).toBe('Periode "Periode 1" diakhiri');
    expect(toasts.refund(5_000, 'Budi')).toBe('Titipan Rp5.000 dikembalikan ke Budi');
  });
});

describe('describeWeeks and swipePaymentToast', () => {
  const base: PaymentPreview = {
    amount: 15_000,
    allocations: [],
    weekCount: 1,
    allocatedAmount: 15_000,
    creditAmount: 0,
    settledWeeks: [2],
    partialWeek: null,
  };

  it('describes single, consecutive and scattered meetings', () => {
    expect(describeWeeks([2])).toBe('pertemuan 2');
    expect(describeWeeks([1, 2, 3])).toBe('pertemuan 1 sampai 3');
    expect(describeWeeks([1, 3])).toBe('pertemuan 1, 3');
    expect(describeWeeks([])).toBe('');
  });

  it('names the meeting that was settled', () => {
    expect(swipePaymentToast('Budi', base)).toBe('Budi: Rp15.000 melunasi pertemuan 2');
  });

  it('says so when a meeting is only partly paid', () => {
    expect(swipePaymentToast('Budi', { ...base, settledWeeks: [], partialWeek: 2 })).toBe(
      'Budi: Rp15.000 masuk ke pertemuan 2, baru terbayar sebagian',
    );
  });

  it('names both a settled meeting and a partly paid one when the payment spans meetings', () => {
    expect(swipePaymentToast('Budi', { ...base, weekCount: 2, settledWeeks: [2], partialWeek: 3 })).toBe(
      'Budi: Rp15.000 melunasi pertemuan 2 dan sebagian pertemuan 3',
    );
  });

  it('mentions credit when part of the payment exceeds the dues', () => {
    expect(swipePaymentToast('Budi', { ...base, allocatedAmount: 5_000, creditAmount: 10_000 })).toBe(
      'Budi: Rp15.000 melunasi pertemuan 2 (Rp10.000 menjadi titipan)',
    );
    expect(swipePaymentToast('Budi', { ...base, allocatedAmount: 0, creditAmount: 15_000, settledWeeks: [], weekCount: 0 })).toBe(
      'Budi: Rp15.000 menjadi titipan',
    );
  });
});
