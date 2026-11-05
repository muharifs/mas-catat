// Injectable id and clock so tests can be deterministic.

export interface RepoDeps {
  /** Returns a new unique id (TEXT primary key). */
  newId: () => string;
  /** Returns the current moment as an ISO 8601 timestamp (stored in created_at columns). */
  now: () => string;
}

let counter = 0;

/**
 * Local-only id: time + in-process counter + random suffix. Enough for a single-user offline app;
 * avoids an extra dependency (expo-crypto) just for UUIDs.
 */
export function defaultNewId(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const defaultDeps: RepoDeps = {
  newId: defaultNewId,
  now: () => new Date().toISOString(),
};

/** Local calendar date of the injected clock, as ISO. The phone's own timezone is what the owner sees. */
export function todayOf(deps: RepoDeps): string {
  const d = new Date(deps.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
