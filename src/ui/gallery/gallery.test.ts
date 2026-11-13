/// <reference types="node" />
// Node typings are only needed here (reading source files); tsconfig "types" lists jest only, so they are pulled in per file.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const GALLERY_DIR = __dirname;
const COMPONENTS_DIR = join(__dirname, '..', 'components');

function read(file: string): string {
  return readFileSync(join(GALLERY_DIR, file), 'utf8');
}

describe('component gallery', () => {
  it('fixtures never import the data layer at run time (type imports are erased)', () => {
    const lines = read('fixtures.ts').split('\n').filter((l) => /^\s*import\b/.test(l));
    const dbImports = lines.filter((l) => /@\/db|\/db\//.test(l));
    expect(dbImports.every((l) => /^\s*import type\b/.test(l))).toBe(true);
  });

  it('no gallery file imports a repository, store or provider', () => {
    const files = readdirSync(GALLERY_DIR).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
    for (const f of files) {
      const source = read(f);
      expect(source).not.toMatch(/from '@\/db\/(provider|index|db|openDatabase)'/);
      expect(source).not.toMatch(/useRepos|useLoad|Store'/);
    }
  });

  it('shows every component of src/ui/components', () => {
    const components = readdirSync(COMPONENTS_DIR)
      .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
      .map((f) => f.replace('.tsx', ''));
    expect(components).toHaveLength(30);
    const gallery = readdirSync(GALLERY_DIR)
      .filter((f) => /^Section[A-F]\.tsx$/.test(f))
      .map(read)
      .join('\n');
    const missing = components.filter((name) => !gallery.includes(`../components/${name}'`));
    expect(missing).toEqual([]);
  });
});
