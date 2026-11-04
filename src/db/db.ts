// Minimal async database interface used by migrations and repositories.
//
// Two adapters implement it: expo-sqlite (production, native on the phone, see openDatabase.ts)
// and sql.js (tests in Node, see testing/sqlJsDriver.ts). Everything above this file is
// driver-agnostic, so the SAME migration and repository code runs against real SQLite in tests.

/** Values that can be bound to a `?` placeholder. Money is always an integer number. */
export type SqlValue = string | number | null;

export interface RunResult {
  /** Rows changed by the last INSERT/UPDATE/DELETE. */
  changes: number;
}

/** Statement-level operations. A transaction handle exposes exactly this. */
export interface Queryable {
  /** Runs one or more SQL statements without parameters (DDL, PRAGMA, BEGIN, ...). */
  exec(sql: string): Promise<void>;
  /** Runs one statement with `?` parameters. Never build SQL by string concatenation. */
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  getAll<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  getFirst<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
}

export interface Db extends Queryable {
  /**
   * Runs `fn` inside BEGIN ... COMMIT; any thrown error rolls everything back and is re-thrown.
   * Use the `tx` handle inside `fn`. Calling `tx.transaction` joins the outer transaction.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** What a driver must provide. No locking or transactions: createDb adds those. */
export type RawDriver = Queryable;

/**
 * Wraps a raw driver and adds serialized transactions.
 * A single connection can only hold one transaction, so calls from outside a running transaction
 * wait until it finishes (a simple promise queue). Calls made through `tx` skip the queue.
 */
export function createDb(raw: RawDriver): Db {
  let tail: Promise<unknown> = Promise.resolve();

  function locked<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  }

  const tx: Db = {
    exec: (sql) => raw.exec(sql),
    run: (sql, params) => raw.run(sql, params),
    getAll: (sql, params) => raw.getAll(sql, params),
    getFirst: (sql, params) => raw.getFirst(sql, params),
    transaction: (fn) => fn(tx),
  };

  return {
    exec: (sql) => locked(() => raw.exec(sql)),
    run: (sql, params) => locked(() => raw.run(sql, params)),
    getAll: (sql, params) => locked(() => raw.getAll(sql, params)),
    getFirst: (sql, params) => locked(() => raw.getFirst(sql, params)),
    transaction: <T>(fn: (tx: Db) => Promise<T>) =>
      locked(async () => {
        await raw.exec('BEGIN');
        try {
          const value = await fn(tx);
          await raw.exec('COMMIT');
          return value;
        } catch (error) {
          try {
            await raw.exec('ROLLBACK');
          } catch {
            // The original error is more useful than a failed rollback.
          }
          throw error;
        }
      }),
  };
}
