-- Admin actions log
create table if not exists admin_actions (
  id              uuid primary key default gen_random_uuid(),
  admin_user_id   uuid references auth.users(id) on delete set null,
  target_user_id  uuid references auth.users(id) on delete cascade,
  action_type     text not null,
  notes           text,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

alter table admin_actions enable row level security;

-- Only service role can read/write admin_actions (admin panel uses service key)
-- No anon/user policies needed

-- App settings (key-value store)
create table if not exists app_settings (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table app_settings enable row level security;

-- Seed maintenance_mode flag
insert into app_settings (key, value)
values ('maintenance_mode', 'false')
on conflict (key) do nothing;

-- Allow CT3000 main app (anon key) to read app_settings
create policy "Anyone can read app_settings"
  on app_settings for select
  using (true);
