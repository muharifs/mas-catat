// Test-only driver: real SQLite compiled to WebAssembly (sql.js), running in Node under Jest.
// Why: expo-sqlite is a native module and cannot load in Jest, and native Node SQLite packages need a
// C++ toolchain on Windows. sql.js is the same SQLite engine (triggers, CHECK, foreign keys behave alike),
// so migrations and repositories are tested against the real thing without a phone.
import initSqlJs from 'sql.js';
import { createDb, type Db, type RawDriver, type SqlValue } from '../db';
import { migrate } from '../migrate';

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
let sqlJsPromise: Promise<SqlJsStatic> | undefined;

function loadSqlJs(): Promise<SqlJsStatic> {
  sqlJsPromise ??= initSqlJs();
  return sqlJsPromise;
}

/** Creates a fresh in-memory database. Foreign keys are NOT enabled until migrate() runs. */
export async function createSqlJsDb(): Promise<Db> {
  const SQL = await loadSqlJs();
  const database = new SQL.Database();

  const driver: RawDriver = {
    exec: async (sql) => {
      database.exec(sql);
    },
    run: async (sql, params = []) => {
      database.run(sql, params as SqlValue[]);
      return { changes: database.getRowsModified() };
    },
    getAll: async <T>(sql: string, params: readonly SqlValue[] = []) => {
      const statement = database.prepare(sql);
      try {
        statement.bind(params as SqlValue[]);
        const rows: T[] = [];
        while (statement.step()) rows.push(statement.getAsObject() as T);
        return rows;
      } finally {
        statement.free();
      }
    },
    getFirst: async <T>(sql: string, params: readonly SqlValue[] = []) => {
      const rows = await driver.getAll<T>(sql, params);
      return rows[0] ?? null;
    },
  };
  return createDb(driver);
}

/** Fresh in-memory database with all migrations applied. */
export async function createMigratedTestDb(): Promise<Db> {
  const db = await createSqlJsDb();
  await migrate(db);
  return db;
}
