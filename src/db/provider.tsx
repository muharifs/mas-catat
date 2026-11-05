// Opens the database ONCE at app start and shares the repositories through React context.
//
// Compared with React on the web: there is no server and no fetch. The "backend" is a SQLite file on the
// phone, opened with an async call. Until it is open and migrated we render "Memuat..." instead of the
// screens, so no screen ever sees a missing database. The context works like any React context on the web.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ErrorState } from '@/ui/components/ErrorState';
import { Loading } from '@/ui/components/Loading';
import { toIndonesian } from '@/ui/errors';
import { createRepositories, type Repositories } from './index';
import { openDatabase } from './openDatabase';

// Module-level promise: in development React may run effects twice; this keeps it to ONE open + migrate.
let opening: Promise<Repositories> | null = null;

function openOnce(): Promise<Repositories> {
  if (!opening) {
    opening = openDatabase()
      .then((db) => createRepositories(db))
      .catch((error: unknown) => {
        opening = null; // allow the retry button
        throw error;
      });
  }
  return opening;
}

type State = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; repos: Repositories };

const RepositoriesContext = createContext<Repositories | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    openOnce().then(
      (repos) => {
        if (!cancelled) setState({ status: 'ready', repos });
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

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState message={toIndonesian(state.error)} onRetry={retry} />;
  return <RepositoriesContext.Provider value={state.repos}>{children}</RepositoriesContext.Provider>;
}

/** Repositories for screens. Only valid below DatabaseProvider (which renders children once ready). */
export function useRepos(): Repositories {
  const repos = useContext(RepositoriesContext);
  if (!repos) throw new Error('useRepos must be used inside DatabaseProvider');
  return repos;
}
