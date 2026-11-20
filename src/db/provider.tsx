// Opens the database ONCE at app start and shares the repositories through React context.
//
// Compared with React on the web: there is no server and no fetch. The "backend" is a SQLite file on the
// phone, opened with an async call. Until it is open and migrated we render "Memuat..." instead of the
// screens, so no screen ever sees a missing database. The context works like any React context on the web.
//
// If the last restore did not finish (a marker file is found at start, L6) nothing below is rendered: a full-screen recovery
// blocker (src/ui/RestoreRecovery.tsx) offers the safety copy first. Only after it succeeds the app is shown.
//
// After a restore the data under every screen has changed. `dataVersion` goes up by one and the root layout uses it
// as the `key` of the navigator, so React throws the old screens away and builds fresh ones that load the new data.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { RestoreMarker } from '@/domain/backup';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { toIndonesian } from '@/ui/errors';
import { RestoreRecovery, type DbHandle } from '@/ui/RestoreRecovery';
import { copyDamagedDatabaseAside, createSafetyStore } from '@/ui/shareFile';
import { inspectRestoreMarker, type NativeBridge } from './backup';
import type { Db } from './db';
import { createRepositories, type Repositories } from './index';
import { openDatabase, replaceUnreadableDatabase, tryOpenAgain } from './openDatabase';

interface Opened {
  repos: Repositories;
  db: Db;
  bridge: NativeBridge;
}

// What the first open found: a normal database, or a restore that did not finish (then `handle` is null when the
// database file could not even be opened).
type OpenResult =
  | { kind: 'ready'; opened: Opened }
  | { kind: 'recovery'; handle: DbHandle | null; marker: RestoreMarker | 'corrupt' };

// Module-level promise: in development React may run effects twice; this keeps it to ONE open + migrate.
let opening: Promise<OpenResult> | null = null;

function toOpened({ db, bridge }: DbHandle): Opened {
  return { repos: createRepositories(db), db, bridge };
}

function openOnce(): Promise<OpenResult> {
  if (!opening) {
    opening = openDatabase()
      .then(
        async ({ db, bridge }): Promise<OpenResult> => {
          // Before any repository exists: is a restore still marked as in progress?
          const found = await inspectRestoreMarker(createSafetyStore());
          if (found.state === 'none') return { kind: 'ready', opened: toOpened({ db, bridge }) };
          return { kind: 'recovery', handle: { db, bridge }, marker: found.state === 'found' ? found.marker : 'corrupt' };
        },
        async (openError: unknown): Promise<OpenResult> => {
          // The file may be half replaced, so it cannot be opened: with a marker the recovery screen is better than a dead end.
          let found: Awaited<ReturnType<typeof inspectRestoreMarker>>;
          try {
            found = await inspectRestoreMarker(createSafetyStore());
          } catch {
            throw openError;
          }
          if (found.state === 'none') throw openError;
          return { kind: 'recovery', handle: null, marker: found.state === 'found' ? found.marker : 'corrupt' };
        },
      )
      .catch((error: unknown) => {
        opening = null; // allow the retry button
        throw error;
      });
  }
  return opening;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'recovery'; handle: DbHandle | null; marker: RestoreMarker | 'corrupt' }
  | { status: 'ready'; opened: Opened };

const RepositoriesContext = createContext<Repositories | null>(null);

/** One more try to open the file, before anything destructive (only the recovery screen calls this). */
async function tryOpenOnce(): Promise<DbHandle | null> {
  const opened = await tryOpenAgain();
  return opened ? { db: opened.db, bridge: opened.bridge } : null;
}

/**
 * Keeps a copy of a database file that cannot be opened, deletes it and opens a new empty one (only the recovery screen calls
 * this, and only after the replacement was checked in memory). Throws DamagedDatabaseError.
 */
async function replaceFresh(): Promise<DbHandle> {
  const { db, bridge } = await replaceUnreadableDatabase(copyDamagedDatabaseAside);
  return { db, bridge };
}

export interface DatabaseControl {
  db: Db;
  bridge: NativeBridge;
  /** Goes up after every restore; the root layout uses it as the key of the navigator. */
  dataVersion: number;
  /** Call after the live data was replaced: every screen is rebuilt and reloads. */
  bumpDataVersion: () => void;
}

const DatabaseControlContext = createContext<DatabaseControl | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    openOnce().then(
      (result) => {
        if (cancelled) return;
        setState(result.kind === 'ready' ? { status: 'ready', opened: result.opened } : { status: 'recovery', handle: result.handle, marker: result.marker });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const bumpDataVersion = useCallback(() => setDataVersion((n) => n + 1), []);

  // The recovery put the safety copy back and removed the marker: from here on the app is a normal one.
  const recovered = useCallback((handle: DbHandle) => {
    const opened = toOpened(handle);
    opening = Promise.resolve<OpenResult>({ kind: 'ready', opened });
    setState({ status: 'ready', opened });
  }, []);

  const control = useMemo<DatabaseControl | null>(
    () => (state.status === 'ready' ? { db: state.opened.db, bridge: state.opened.bridge, dataVersion, bumpDataVersion } : null),
    [state, dataVersion, bumpDataVersion],
  );

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState message={toIndonesian(state.error, 'load')} onRetry={retry} />;
  if (state.status === 'recovery') {
    return <RestoreRecovery marker={state.marker} handle={state.handle} tryOpen={tryOpenOnce} replace={replaceFresh} onRecovered={recovered} />;
  }
  return (
    <DatabaseControlContext.Provider value={control}>
      <RepositoriesContext.Provider value={state.opened.repos}>{children}</RepositoriesContext.Provider>
    </DatabaseControlContext.Provider>
  );
}

/** Repositories for screens. Only valid below DatabaseProvider (which renders children once ready). */
export function useRepos(): Repositories {
  const repos = useContext(RepositoriesContext);
  if (!repos) throw new Error('useRepos must be used inside DatabaseProvider');
  return repos;
}

/** Database-level control for backup and restore screens and the root layout. Only valid below DatabaseProvider. */
export function useDatabaseControl(): DatabaseControl {
  const control = useContext(DatabaseControlContext);
  if (!control) throw new Error('useDatabaseControl must be used inside DatabaseProvider');
  return control;
}
