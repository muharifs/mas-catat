// Guard for the text truncation fix. On Android (Fabric, RN issue #57950) a Text or TextInput without an explicit
// fontFamily is measured with the default typeface but drawn with the phone's system font, so lines get clipped or
// wrapped wrongly. Android also ignores fontWeight for custom fonts. So: every type token has a family from `fonts`,
// fontWeight is never used, and every Text / TextInput in src gets a font family through its style.
// jest cannot measure layout, so this is a static scan of the source. It follows `styles.x` and `map[key]` references to
// the StyleSheet.create objects of the same file; a Text passes when at least one style it uses carries a family.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fonts, type } from './theme';

const SRC = path.resolve(__dirname, '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Same text with // and block comments blanked out (same length), so a comment never counts as code. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"`])\/\/.*$/gm, (m, lead: string | undefined) => (lead ?? '') + ' '.repeat(m.length - (lead ?? '').length));
}

/** Index just after the bracket that closes the one at `start`, skipping string contents. */
function closeIndex(code: string, start: number): number {
  const open = code[start];
  const close = open === '{' ? '}' : open === '(' ? ')' : ']';
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const c = code[i];
    if (c === "'" || c === '"' || c === '`') {
      i = code.indexOf(c, i + 1);
      if (i === -1) return code.length;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return i + 1;
  }
  return code.length;
}

/** The body of every `const NAME = StyleSheet.create({...})`: name -> key -> source text of the value. */
function styleSheets(code: string): Map<string, Map<string, string>> {
  const sheets = new Map<string, Map<string, string>>();
  const re = /const\s+(\w+)\s*=\s*StyleSheet\.create\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const braceAt = m.index + m[0].length - 1;
    const end = closeIndex(code, braceAt);
    const body = code.slice(braceAt + 1, end - 1);
    const keys = new Map<string, string>();
    let depth = 0;
    let keyStart = 0;
    for (let i = 0; i <= body.length; i++) {
      const c = body[i];
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') depth--;
      else if ((c === ',' && depth === 0) || i === body.length) {
        const entry = body.slice(keyStart, i);
        const k = /^\s*(\w+)\s*:/.exec(entry);
        if (k?.[1]) keys.set(k[1], entry.slice(k[0].length));
        keyStart = i + 1;
      }
    }
    sheets.set(m[1] ?? '', keys);
  }
  return sheets;
}

const hasFamily = (text: string): boolean => /\.\.\.\s*type\.\w+|fontFamily/.test(text);

interface Offender {
  file: string;
  line: number;
  style: string;
}

function textsWithoutFamily(file: string): Offender[] {
  const code = stripComments(fs.readFileSync(file, 'utf8'));
  const sheets = styleSheets(code);
  const offenders: Offender[] = [];
  const re = /<(Text|TextInput)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    // Opening tag ends at the first `>` outside braces/strings (so `=>` and `a > b` inside {} do not end it).
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < code.length; i++) {
      const c = code[i];
      if (c === '{') i = closeIndex(code, i) - 1;
      else if (c === '"' || c === "'") i = code.indexOf(c, i + 1);
      else if (c === '>' && depth === 0) break;
    }
    const tag = code.slice(m.index, i);
    const at = tag.search(/\bstyle=\{/);
    const line = code.slice(0, m.index).split('\n').length;
    if (at === -1) {
      offenders.push({ file, line, style: '(no style)' });
      continue;
    }
    const exprStart = tag.indexOf('{', at);
    const expr = tag.slice(exprStart, closeIndex(tag, exprStart));
    let ok = hasFamily(expr);
    for (const ref of expr.matchAll(/\b(\w+)\.(\w+)\b|\b(\w+)\[/g)) {
      const sheetName = ref[1] ?? ref[3];
      const sheet = sheets.get(sheetName ?? '');
      if (!sheet) continue;
      // `sheet.key`: that key. `sheet[expr]`: any entry of the sheet (a lookup by variant or tone).
      const values = ref[2] !== undefined ? [sheet.get(ref[2]) ?? ''] : [...sheet.values()];
      if (values.some(hasFamily)) ok = true;
    }
    if (!ok) offenders.push({ file, line, style: expr.replace(/\s+/g, ' ').slice(0, 80) });
  }
  return offenders;
}

describe('fonts', () => {
  test('every type token has a family from `fonts` and no fontWeight', () => {
    const families = Object.values(fonts) as string[];
    for (const [name, token] of Object.entries(type)) {
      expect({ name, family: families.includes((token as { fontFamily?: string }).fontFamily ?? '') }).toEqual({ name, family: true });
      expect(token).not.toHaveProperty('fontWeight');
    }
  });

  test('regular is used for body and secondary, bold for the rest', () => {
    expect(type.body.fontFamily).toBe(fonts.regular);
    expect(type.secondary.fontFamily).toBe(fonts.regular);
    for (const name of ['hero', 'display', 'titleL', 'amountL', 'titleM', 'bodyStrong', 'label'] as const) {
      expect(type[name].fontFamily).toBe(fonts.bold);
    }
  });

  test('the font files named by `fonts` exist next to their license', () => {
    for (const file of ['Inter-Regular.ttf', 'Inter-Bold.ttf', 'OFL.txt']) {
      expect(fs.existsSync(path.resolve(SRC, '..', 'assets', 'fonts', file))).toBe(true);
    }
  });

  test('no source file under src uses fontWeight (Android ignores it for custom fonts)', () => {
    const found = sourceFiles(SRC)
      .filter((f) => /fontWeight/.test(stripComments(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(SRC, f));
    expect(found).toEqual([]);
  });

  test('every Text and TextInput gets a font family through its style', () => {
    const offenders = sourceFiles(SRC)
      .flatMap(textsWithoutFamily)
      .map((o) => `${path.relative(SRC, o.file)}:${o.line} ${o.style}`);
    expect(offenders).toEqual([]);
  });

  // The scan itself must be able to fail, otherwise a green result means nothing.
  test('the scan flags a Text whose style has no family', () => {
    const tmp = path.join(os.tmpdir(), 'fontscan_sample.tsx');
    fs.writeFileSync(tmp, "const styles = StyleSheet.create({ a: { fontSize: 12 }, b: { ...type.body } });\nconst x = (<><Text style={styles.a}>x</Text><Text style={styles.b}>y</Text><Text>z</Text></>);\n");
    try {
      expect(textsWithoutFamily(tmp).map((o) => o.style)).toEqual(['{styles.a}', '(no style)']);
    } finally {
      fs.rmSync(tmp);
    }
  });
});
