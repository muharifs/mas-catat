// Test-only: a version 5 database (before migration 0006) written with plain SQL: an ended period with a payout,
// an offset and member credit, and an active period that received the carried-over credit.
// Shared by migrate0006.test.ts and backupSkip.test.ts.
export const T = "'2026-01-01T00:00:00.000Z'";

export const V5_FIXTURE_SQL = `
INSERT INTO members (id, name, created_at) VALUES ('m1', 'Ani', ${T}), ('m2', 'Budi', ${T}), ('m3', 'Citra', ${T});

-- Period 1: ended. m1 paid 60.000 for 45.000 of dues (15.000 credit); host 2 (m2) was paid with an offset for her week 1.
INSERT INTO periods (id, name, member_count, status, start_date, end_date, created_at) VALUES ('p1', 'Periode 1', 3, 'closed', '2026-01-06', '2026-02-10', ${T});
INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p1', 'm1', 1), ('p1', 'm2', 2), ('p1', 'm3', 3);
INSERT INTO weeks (period_id, number, date, host_member_id, status, closed_at) VALUES
  ('p1', 1, '2026-01-06', 'm1', 'closed', ${T}), ('p1', 2, '2026-01-13', 'm2', 'closed', ${T}), ('p1', 3, '2026-01-20', 'm3', 'closed', ${T});
INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES ('pay1', 'p1', 'm1', '2026-01-06', 60000, ${T});
INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES
  ('pay1', 'p1', 'm1', 1, 15000, '2026-01-06'), ('pay1', 'p1', 'm1', 2, 15000, '2026-01-06'), ('pay1', 'p1', 'm1', 3, 15000, '2026-01-06');
INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at)
  VALUES ('e-pay1', 'p1', '2026-01-06', 60000, 'in', 'member_payment', 'm1', NULL, '', ${T}),
         ('e-out1', 'p1', '2026-01-20', 30000, 'out', 'host_payout', 'm2', 2, '', ${T}),
         ('e-off1', 'p1', '2026-01-20', 15000, 'in', 'host_offset', 'm2', 2, '', ${T});
INSERT INTO offset_credits (ledger_entry_id, period_id, member_id, week, amount) VALUES ('e-off1', 'p1', 'm2', 1, 15000);

-- Period 2: active. m1's credit was carried over week 1; meeting 1 is closed and paid, 2 and 3 are open.
INSERT INTO periods (id, name, member_count, status, start_date, created_at) VALUES ('p2', 'Periode 2', 3, 'active', '2026-03-03', ${T});
INSERT INTO period_members (period_id, member_id, initial_order) VALUES ('p2', 'm1', 1), ('p2', 'm2', 2), ('p2', 'm3', 3);
INSERT INTO weeks (period_id, number, date, host_member_id, status, closed_at) VALUES
  ('p2', 1, '2026-03-03', 'm1', 'closed', ${T}), ('p2', 2, '2026-03-10', 'm2', 'open', NULL), ('p2', 3, '2026-03-17', 'm3', 'open', NULL);
INSERT INTO credit_applications (kind, from_period_id, member_id, to_period_id, week, amount, created_at)
  VALUES ('carry_over', 'p1', 'm1', 'p2', 1, 15000, ${T});
INSERT INTO payments (id, period_id, member_id, date, amount, created_at) VALUES ('pay2', 'p2', 'm2', '2026-03-03', 30000, ${T});
INSERT INTO allocations (payment_id, period_id, member_id, week, amount, payment_date) VALUES
  ('pay2', 'p2', 'm2', 1, 15000, '2026-03-03'), ('pay2', 'p2', 'm2', 2, 15000, '2026-03-03');
INSERT INTO ledger_entries (id, period_id, date, amount, direction, type, member_id, week, note, created_at)
  VALUES ('e-pay2', 'p2', '2026-03-03', 30000, 'in', 'member_payment', 'm2', NULL, '', ${T}),
         ('e-out2', 'p2', '2026-03-04', 30000, 'out', 'host_payout', 'm1', 1, '', ${T});
`;
