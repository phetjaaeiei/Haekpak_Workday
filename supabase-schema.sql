create table if not exists public.workday_selections (
  id text primary key,
  nickname text not null,
  role text not null check (role in ('server', 'dishwasher', 'slicer', 'prep')),
  week_start date not null,
  days jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workday_selections_week_start_idx
  on public.workday_selections (week_start);

create index if not exists workday_selections_role_week_start_idx
  on public.workday_selections (role, week_start);

alter table public.workday_selections enable row level security;
