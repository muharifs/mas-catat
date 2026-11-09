// Members repository: CRUD plus removal. A member with no data at all is hard-deleted; a member with history is
// archived (hidden from the member list and new-period selection, history intact, undoable).
import { assertCanArchive, canHardDelete, MemberArchiveError, type ArchiveBlockCode, type MemberUsage } from '@/domain/members';
import { loadAvailableCredit } from './credits';
import type { Db, Queryable } from './db';
import { defaultDeps, type RepoDeps } from './deps';
import { RepositoryError } from './errors';
import { loadLoanBalance } from './ledger';

export interface Member {
  id: string;
  name: string;
  createdAt: string;
  /** ISO timestamp when archived, or null for an active member. */
  archivedAt: string | null;
}

interface MemberRow {
  id: string;
  name: string;
  created_at: string;
  archived_at: string | null;
}

const COLUMNS = 'id, name, created_at, archived_at';

const toMember = (r: MemberRow): Member => ({ id: r.id, name: r.name, createdAt: r.created_at, archivedAt: r.archived_at });

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new RepositoryError('member name must not be empty');
  return trimmed;
}

/**
 * Exact name match, case-insensitive, over ALL members including archived ones (an archived member's name stays
 * reserved). `exceptId` lets a member keep (or re-case) its own name on rename.
 */
async function assertNameFree(db: Queryable, name: string, exceptId?: string): Promise<void> {
  const rows = await db.getAll<{ id: string; name: string }>('SELECT id, name FROM members');
  const wanted = name.toLowerCase();
  if (rows.some((r) => r.id !== exceptId && r.name.toLowerCase() === wanted)) {
    throw new RepositoryError(`member name already exists: ${name}`);
  }
}

async function loadMember(db: Queryable, id: string): Promise<Member> {
  const row = await db.getFirst<MemberRow>(`SELECT ${COLUMNS} FROM members WHERE id = ?`, [id]);
  if (!row) throw new RepositoryError(`member ${id} not found`);
  return toMember(row);
}

const countOf = async (db: Queryable, sql: string, id: string): Promise<number> =>
  (await db.getFirst<{ n: number }>(sql, [id]))?.n ?? 0;

/** How many records refer to the member, per table. Read through `db` (a transaction handle when it guards a write). */
export async function loadMemberUsage(db: Queryable, memberId: string): Promise<MemberUsage> {
  return {
    periodMemberships: await countOf(db, 'SELECT COUNT(*) AS n FROM period_members WHERE member_id = ?', memberId),
    ledgerEntries: await countOf(db, 'SELECT COUNT(*) AS n FROM ledger_entries WHERE member_id = ?', memberId),
    payments: await countOf(db, 'SELECT COUNT(*) AS n FROM payments WHERE member_id = ?', memberId),
    allocations: await countOf(db, 'SELECT COUNT(*) AS n FROM allocations WHERE member_id = ?', memberId),
    offsetCredits: await countOf(db, 'SELECT COUNT(*) AS n FROM offset_credits WHERE member_id = ?', memberId),
    creditApplications: await countOf(db, 'SELECT COUNT(*) AS n FROM credit_applications WHERE member_id = ?', memberId),
    hostedWeeks: await countOf(db, 'SELECT COUNT(*) AS n FROM weeks WHERE host_member_id = ?', memberId),
  };
}

/** Throws MemberArchiveError when the member may not be archived. All reads go through `db`. */
async function assertMemberMayBeArchived(db: Queryable, memberId: string): Promise<void> {
  const active = await db.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM period_members pm JOIN periods p ON p.id = pm.period_id
      WHERE pm.member_id = ? AND p.status = 'active'`,
    [memberId],
  );
  const periods = await db.getAll<{ period_id: string }>('SELECT period_id FROM period_members WHERE member_id = ?', [memberId]);
  let creditHeld = 0;
  for (const p of periods) creditHeld += await loadAvailableCredit(db, p.period_id, memberId);
  assertCanArchive({
    inActivePeriod: (active?.n ?? 0) > 0,
    loanRemaining: (await loadLoanBalance(db, memberId)).remaining,
    creditHeld,
  });
}

export function createMembersRepo(db: Db, deps: RepoDeps = defaultDeps) {
  return {
    async create(name: string): Promise<Member> {
      const cleaned = cleanName(name);
      await assertNameFree(db, cleaned);
      const member: Member = { id: deps.newId(), name: cleaned, createdAt: deps.now(), archivedAt: null };
      await db.run('INSERT INTO members (id, name, created_at) VALUES (?, ?, ?)', [member.id, member.name, member.createdAt]);
      return member;
    },

    async getById(id: string): Promise<Member | null> {
      const row = await db.getFirst<MemberRow>(`SELECT ${COLUMNS} FROM members WHERE id = ?`, [id]);
      return row ? toMember(row) : null;
    },

    /**
     * ALL members including archived ones, ordered by name then creation order. Not filtered on purpose: screens use
     * it as a name lookup for history, and an archived member's name must still resolve there.
     */
    async list(): Promise<Member[]> {
      const rows = await db.getAll<MemberRow>(`SELECT ${COLUMNS} FROM members ORDER BY name, rowid`);
      return rows.map(toMember);
    },

    /** Members that are not archived: for the member list and for choosing the members of a new period. */
    async listActive(): Promise<Member[]> {
      const rows = await db.getAll<MemberRow>(`SELECT ${COLUMNS} FROM members WHERE archived_at IS NULL ORDER BY name, rowid`);
      return rows.map(toMember);
    },

    async rename(id: string, name: string): Promise<void> {
      const cleaned = cleanName(name);
      await assertNameFree(db, cleaned, id);
      const { changes } = await db.run('UPDATE members SET name = ? WHERE id = ?', [cleaned, id]);
      if (changes === 0) throw new RepositoryError(`member ${id} not found`);
    },

    /** What refers to the member (for the screen: delete when all zero, archive otherwise). */
    async getUsage(id: string): Promise<MemberUsage> {
      return loadMemberUsage(db, id);
    },

    /** The reason archiving would be refused right now, or null when it is allowed. Read-only; archive() re-checks. */
    async archiveBlocker(id: string): Promise<{ code: ArchiveBlockCode; amount: number } | null> {
      return db.transaction(async (tx) => {
        await loadMember(tx, id);
        try {
          await assertMemberMayBeArchived(tx, id);
          return null;
        } catch (e) {
          if (e instanceof MemberArchiveError) return { code: e.code, amount: e.amount };
          throw e;
        }
      });
    },

    /**
     * Archives the member. The rules are checked and the write happens in ONE transaction, so nothing can change in
     * between. Archiving twice is a no-op (the first archive time is kept).
     */
    async archive(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        const member = await loadMember(tx, id);
        if (member.archivedAt !== null) return;
        await assertMemberMayBeArchived(tx, id);
        const { changes } = await tx.run('UPDATE members SET archived_at = ? WHERE id = ? AND archived_at IS NULL', [deps.now(), id]);
        if (changes !== 1) throw new RepositoryError(`member ${id} could not be archived`);
      });
    },

    /** Undo archive. Always allowed; a no-op for a member that is not archived. */
    async unarchive(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        await loadMember(tx, id);
        await tx.run('UPDATE members SET archived_at = NULL WHERE id = ?', [id]);
      });
    },

    /** Hard delete of a member with no data at all. Check and DELETE happen in ONE transaction. */
    async remove(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        await loadMember(tx, id);
        if (!canHardDelete(await loadMemberUsage(tx, id))) {
          throw new RepositoryError(`member ${id} has history and cannot be deleted; archive it instead`);
        }
        const { changes } = await tx.run('DELETE FROM members WHERE id = ?', [id]);
        if (changes !== 1) throw new RepositoryError(`member ${id} could not be deleted`);
      });
    },
  };
}

export type MembersRepo = ReturnType<typeof createMembersRepo>;
