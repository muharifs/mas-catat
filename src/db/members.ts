// Members repository: plain CRUD, no money.
import type { Db } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { RepositoryError } from './errors';

export interface Member {
  id: string;
  name: string;
  createdAt: string;
}

interface MemberRow {
  id: string;
  name: string;
  created_at: string;
}

const toMember = (r: MemberRow): Member => ({ id: r.id, name: r.name, createdAt: r.created_at });

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new RepositoryError('member name must not be empty');
  return trimmed;
}

/** Exact name match, case-insensitive. `exceptId` lets a member keep (or re-case) its own name on rename. */
async function assertNameFree(db: Db, name: string, exceptId?: string): Promise<void> {
  const rows = await db.getAll<{ id: string; name: string }>('SELECT id, name FROM members');
  const wanted = name.toLowerCase();
  if (rows.some((r) => r.id !== exceptId && r.name.toLowerCase() === wanted)) {
    throw new RepositoryError(`member name already exists: ${name}`);
  }
}

export function createMembersRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    async create(name: string): Promise<Member> {
      const cleaned = cleanName(name);
      await assertNameFree(db, cleaned);
      const member: Member = { id: deps.newId(), name: cleaned, createdAt: deps.now() };
      await db.run('INSERT INTO members (id, name, created_at) VALUES (?, ?, ?)', [
        member.id,
        member.name,
        member.createdAt,
      ]);
      return member;
    },

    async getById(id: string): Promise<Member | null> {
      const row = await db.getFirst<MemberRow>('SELECT id, name, created_at FROM members WHERE id = ?', [id]);
      return row ? toMember(row) : null;
    },

    /** All members, ordered by name then creation order. */
    async list(): Promise<Member[]> {
      const rows = await db.getAll<MemberRow>('SELECT id, name, created_at FROM members ORDER BY name, rowid');
      return rows.map(toMember);
    },

    async rename(id: string, name: string): Promise<void> {
      const cleaned = cleanName(name);
      await assertNameFree(db, cleaned, id);
      const { changes } = await db.run('UPDATE members SET name = ? WHERE id = ?', [cleaned, id]);
      if (changes === 0) throw new RepositoryError(`member ${id} not found`);
    },
  };
}

export type MembersRepo = ReturnType<typeof createMembersRepo>;
