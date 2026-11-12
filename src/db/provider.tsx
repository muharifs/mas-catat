// Opens the database ONCE at app start and shares the repositories through React context.
//
// Compared with React on the web: there is no server and no fetch. The "backend" is a SQLite file on the
// phone, opened with an async call. Until it is open and migrated we render "Memuat..." instead of the
// screens, so no screen ever sees a missing database. The context works like any React context on the web.
//
// After a restore the data under every screen has changed. `dataVersion` goes up by one and the root layout uses it
// as the `key` of the navigator, so React throws the old screens away and builds fresh ones that load the new data.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { toIndonesian } from '@/ui/errors';
import type { NativeBridge } from './backup';
import type { Db } from './db';
import { createRepositories, type Repositories } from './index';
import { openDatabase } from './openDatabase';

interface Opened {
  repos: Repositories;
  db: Db;
  bridge: NativeBridge;
}

// Module-level promise: in development React may run effects twice; this keeps it to ONE open + migrate.
let opening: Promise<Opened> | null = null;

function openOnce(): Promise<Opened> {
  if (!opening) {
    opening = openDatabase()
      .then(({ db, bridge }) => ({ repos: createRepositories(db), db, bridge }))
      .catch((error: unknown) => {
        opening = null; // allow the retry button
        throw error;
      });
  }
  return opening;
}

type State = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; opened: Opened };

const RepositoriesContext = createContext<Repositories | null>(null);

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
      (opened) => {
        if (!cancelled) setState({ status: 'ready', opened });
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

  const control = useMemo<DatabaseControl | null>(
    () => (state.status === 'ready' ? { db: state.opened.db, bridge: state.opened.bridge, dataVersion, bumpDataVersion } : null),
    [state, dataVersion, bumpDataVersion],
  );

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState message={toIndonesian(state.error, 'load')} onRetry={retry} />;
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
