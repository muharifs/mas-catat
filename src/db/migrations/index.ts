// Ordered list of migrations. Versions must be 1, 2, 3, ... with no gaps.
// To change the schema: add migrations/000N_name.ts and append it here. Never edit shipped migrations.
import { sql as sql0001 } from './0001_init';
import { sql as sql0002 } from './0002_ledger_account';
import { sql as sql0003 } from './0003_kas_corrections';
import { sql as sql0004 } from './0004_period_close';
import { sql as sql0005 } from './0005_member_archive';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', sql: sql0001 },
  { version: 2, name: 'ledger_account', sql: sql0002 },
  { version: 3, name: 'kas_corrections', sql: sql0003 },
  { version: 4, name: 'period_close', sql: sql0004 },
  { version: 5, name: 'member_archive', sql: sql0005 },
];
