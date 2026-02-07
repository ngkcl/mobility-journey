-- Add appointments table for specialist tracking

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  appointment_date date not null,
  specialist_name text not null,
  specialist_type text not null check (specialist_type in ('physio', 'chiro', 'ortho', 'massage', 'other')),
  notes text,
  recommendations text,
  follow_up_date date
);

create index if not exists appointments_date_idx on public.appointments (appointment_date desc);
create index if not exists appointments_follow_up_idx on public.appointments (follow_up_date desc);

alter table appointments enable row level security;
create policy "allow_all_appointments" on appointments for all using (true) with check (true);
