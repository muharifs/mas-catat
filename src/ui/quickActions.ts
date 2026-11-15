// Which quick-action tiles on Beranda are disabled, and why. Pure. A disabled tile stays visible and says the reason
// (shown as a toast when tapped and read by screen readers).

export interface QuickActionInput {
  hasActivePeriod: boolean;
  /** Any period at all, ended or not (kas entries need one). */
  hasAnyPeriod: boolean;
  /** Oldest open meeting of the active period, or null when none is open (or no period). */
  currentWeek: { hostMemberId: string | null } | null;
  /** A meeting of the active period is skipped (decision 33): the "no open meeting" reason says so. Default false. */
  anySkipped?: boolean;
}

export interface QuickActionReasons {
  iuran: string | null;
  tuanRumah: string | null;
  catatKas: string | null;
  jadwal: string | null;
}

const NO_ACTIVE = 'Belum ada periode aktif.';

/** Reason why a tile is disabled, or null when it can be used. */
export function quickActionReasons(input: QuickActionInput): QuickActionReasons {
  return {
    iuran: input.hasActivePeriod ? null : NO_ACTIVE,
    tuanRumah: !input.hasActivePeriod
      ? NO_ACTIVE
      : !input.currentWeek
        ? input.anySkipped
          ? 'Semua pertemuan sudah ditutup atau dilewati.'
          : 'Semua pertemuan sudah ditutup.'
        : input.currentWeek.hostMemberId === null
          ? 'Tentukan tuan rumah dulu.'
          : null,
    catatKas: input.hasAnyPeriod ? null : 'Buat periode dulu.',
    jadwal: input.hasActivePeriod ? null : NO_ACTIVE,
  };
}
