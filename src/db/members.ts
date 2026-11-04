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

export function createMembersRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    async create(name: string): Promise<Member> {
      const member: Member = { id: deps.newId(), name: cleanName(name), createdAt: deps.now() };
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
      const { changes } = await db.run('UPDATE members SET name = ? WHERE id = ?', [cleanName(name), id]);
      if (changes === 0) throw new RepositoryError(`member ${id} not found`);
    },
  };
}

export type MembersRepo = ReturnType<typeof createMembersRepo>;
