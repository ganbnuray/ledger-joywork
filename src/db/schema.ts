// Tables for the matcher output and the review history. Safe to run more than once.
export const schema = `
-- What the matcher decided, one row per payment or credit.
create table if not exists findings (
  payment_id text primary key,
  status text not null check (status in ('ok', 'misapplied', 'wrong_account', 'unapplied', 'needs_human')),
  recorded_customer_id text,
  likely_customer_id text,
  likely_invoices text[] not null default '{}',
  amount_cents bigint not null,
  intended_applications jsonb,
  evidence jsonb not null,
  flags jsonb not null,
  decided_by text not null,
  confidence text not null check (confidence in ('high', 'low')),
  computed_at timestamptz not null default now()
);

-- What a person decided. Every action is kept, the latest one counts.
create table if not exists reviews (
  id serial primary key,
  payment_id text not null references findings (payment_id),
  action text not null check (action in ('confirm', 'correct')),
  system_status text not null,
  reviewed_status text not null check (reviewed_status in ('ok', 'misapplied', 'wrong_account', 'unapplied', 'needs_human')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists reviews_payment_id on reviews (payment_id, created_at desc);
`;
