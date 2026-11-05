import { correctionRoute, flowText, visibleNote } from './kasLabels';

describe('flowText', () => {
  it('describes plain entries, moves and entries without a pos', () => {
    expect(flowText({ direction: 'in', account: 'tunai', toAccount: null })).toBe('Masuk ke Tunai');
    expect(flowText({ direction: 'out', account: 'debit', toAccount: null })).toBe('Keluar dari Debit');
    expect(flowText({ direction: 'out', account: 'tunai', toAccount: 'debit' })).toBe('Tunai -> Debit');
    expect(flowText({ direction: 'out', account: 'piutang', toAccount: 'tunai' })).toBe('Piutang -> Tunai');
    expect(flowText({ direction: 'out', account: null, toAccount: null })).toBe('Tanpa pos');
  });
});

describe('visibleNote', () => {
  it('hides system notes and shows what the owner typed', () => {
    expect(visibleNote({ type: 'host_payout', note: 'Host payout week 1' })).toBe('');
    expect(visibleNote({ type: 'shared_goal', note: 'DP tur' })).toBe('DP tur');
  });
});

describe('correctionRoute', () => {
  it('sends each entry to the right correction', () => {
    expect(correctionRoute({ type: 'transfer', reversedById: null }, true)).toBe('direct');
    expect(correctionRoute({ type: 'opening_balance', reversedById: null }, true)).toBe('direct');
    expect(correctionRoute({ type: 'member_payment', reversedById: null }, true)).toBe('payment');
    expect(correctionRoute({ type: 'host_payout', reversedById: null }, true)).toBe('payout');
    expect(correctionRoute({ type: 'host_offset', reversedById: null }, true)).toBe('payout');
    expect(correctionRoute({ type: 'reversal', reversedById: null }, true)).toBe('is_reversal');
    expect(correctionRoute({ type: 'loan', reversedById: 'r1' }, true)).toBe('already_corrected');
    // Kas-type entries can be corrected in an ended period too; payments and payouts cannot.
    expect(correctionRoute({ type: 'loan', reversedById: null }, false)).toBe('direct');
    expect(correctionRoute({ type: 'member_payment', reversedById: null }, false)).toBe('period_ended');
    expect(correctionRoute({ type: 'host_payout', reversedById: null }, false)).toBe('period_ended');
    expect(correctionRoute({ type: 'debt_writeoff', reversedById: null }, true)).toBe('not_correctable');
    expect(correctionRoute({ type: 'credit_refund', reversedById: null }, false)).toBe('not_correctable');
  });
});
