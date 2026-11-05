import { arrearsRemainderNote, closeWeekMessage, overdueNotice, paymentChoiceLabel, toasts } from './messages';

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
