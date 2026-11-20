import { GLOSSARY, glossaryGroups } from './glossary';

describe('glossary (Istilah page)', () => {
  it('has the four groups and 46 terms from the spec', () => {
    expect(glossaryGroups().map((g) => g.group)).toEqual(['Kas dan uang', 'Iuran dan tuan rumah', 'Periode dan anggota', 'Catatan dan cadangan']);
    expect(GLOSSARY).toHaveLength(51);
  });

  it('gives every term a non-empty meaning and lists no term twice', () => {
    for (const entry of GLOSSARY) {
      expect(entry.term.trim().length).toBeGreaterThan(0);
      expect(entry.meaning.trim().length).toBeGreaterThan(0);
    }
    const terms = GLOSSARY.map((e) => e.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('never uses the forbidden words', () => {
    const forbidden = /\b(pos|entri|file|database|transfer|payout|Anda|Kalau|tur)\b/i;
    for (const entry of GLOSSARY) {
      expect(`${entry.term} ${entry.meaning}`).not.toMatch(forbidden);
    }
  });

  it('uses the new name for written-off arrears', () => {
    expect(GLOSSARY.some((e) => e.term === 'Tunggakan ditanggung kas')).toBe(true);
    expect(GLOSSARY.map((e) => e.meaning).join(' ')).not.toMatch(/[Pp]enghapusan tunggakan/);
  });
});
