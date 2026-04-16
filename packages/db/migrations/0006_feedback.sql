-- 0006_feedback.sql — Unified feedback inbox (Week 10)
--
-- One table for comment / bug / request / rating / praise. Keeps the
-- maker inbox simple and lets the ranking engine read vote totals
-- from a single place. Moderation + leaderboards add columns later.
--
-- Spec v6 §10 (unified feedback_items).

create table if not exists feedback_items (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  type text not null check (type in ('comment', 'bug', 'request', 'rating', 'praise')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'in_progress', 'resolved', 'wont_fix', 'duplicate')),
  rating int check (rating between 1 and 5),
  title text,
  body text,
  vote_count int not null default 0,
  duplicate_of uuid references feedback_items(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_items_app_status_idx on feedback_items (app_id, status, created_at desc);
create index if not exists feedback_items_user_idx on feedback_items (user_id) where user_id is not null;

create trigger feedback_items_updated_at
  before update on feedback_items
  for each row execute function set_updated_at();

create table if not exists feedback_votes (
  feedback_id uuid not null references feedback_items(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  value int not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (feedback_id, user_id)
);
