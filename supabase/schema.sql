-- Run this in your Supabase SQL editor to set up the database

-- Main checkins table (one row per day)
create table if not exists checkins (
  id uuid default gen_random_uuid() primary key,
  date date not null unique,
  sleep jsonb default '{}'::jsonb,
  feel jsonb default '{}'::jsonb,
  training_sessions jsonb default '[]'::jsonb,
  meals jsonb default '[]'::jsonb,
  hydration_ml integer,
  supplements jsonb default '[]'::jsonb,
  mindset jsonb default '{}'::jsonb,
  context jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Meal templates table
create table if not exists meal_templates (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  protein decimal,
  fat decimal,
  carbs decimal,
  calories integer,
  fiber decimal,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- Insert 5 default meal templates
insert into meal_templates (name, protein, fat, carbs, calories, fiber, sort_order) values
  ('Protein Shake', 35, 5, 10, 225, 2, 1),
  ('Chicken & Rice', 45, 8, 55, 472, 2, 2),
  ('Greek Yogurt Bowl', 20, 5, 30, 245, 3, 3),
  ('Eggs & Toast', 22, 14, 28, 326, 2, 4),
  ('Salmon & Veg', 40, 18, 12, 368, 4, 5)
on conflict do nothing;

-- Auto-update updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger checkins_updated_at
  before update on checkins
  for each row execute function update_updated_at();

-- Disable RLS for personal use (no auth required)
alter table checkins disable row level security;
alter table meal_templates disable row level security;
