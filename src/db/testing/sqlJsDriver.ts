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

type SqlJsDatabase = InstanceType<SqlJsStatic['Database']>;

/** Raw driver over a sql.js database. The getter is a function so a test bridge can swap the database underneath. */
export function createSqlJsRawDriver(getDatabase: () => SqlJsDatabase): RawDriver {
  const driver: RawDriver = {
    exec: async (sql) => {
      getDatabase().exec(sql);
    },
    run: async (sql, params = []) => {
      const database = getDatabase();
      database.run(sql, params as SqlValue[]);
      return { changes: database.getRowsModified() };
    },
    getAll: async <T>(sql: string, params: readonly SqlValue[] = []) => {
      const statement = getDatabase().prepare(sql);
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
  return driver;
}

/** The sql.js engine itself (for the backup test bridge, which needs export and import of bytes). */
export function loadSqlJsEngine(): Promise<SqlJsStatic> {
  return loadSqlJs();
}

/** Creates a fresh in-memory database. Foreign keys are NOT enabled until migrate() runs. */
export async function createSqlJsDb(): Promise<Db> {
  const SQL = await loadSqlJs();
  const database = new SQL.Database();
  return createDb(createSqlJsRawDriver(() => database));
}

/** Fresh in-memory database with all migrations applied. */
export async function createMigratedTestDb(): Promise<Db> {
  const db = await createSqlJsDb();
  await migrate(db);
  return db;
}
