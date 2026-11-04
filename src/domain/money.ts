// Money constants and integer-only validation helpers. No floating point anywhere.

export const WEEKLY_DUE = 15_000; // owed by EVERY member each week, host included
export const HOST_PAYOUT_PER_MEMBER = 10_000;
export const KAS_PER_MEMBER = 5_000;

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Requires a non-negative safe integer amount of rupiah. */
export function assertRupiah(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(`${label} must be a non-negative integer rupiah, got ${String(value)}`);
  }
}

/** Requires a positive safe integer (member count, week number). */
export function assertPositiveInt(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainError(`${label} must be a positive integer, got ${String(value)}`);
  }
}

export function assertIsoDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DomainError(`${label} must be an ISO date (YYYY-MM-DD), got ${String(value)}`);
  }
}
