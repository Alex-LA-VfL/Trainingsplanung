-- 008 · Betrieb: Wach-halten-Aufruf und Zeitpunkt der letzten Sicherung
-- ping(): harmloser Aufruf ohne Daten, für den automatischen Aufruf alle 3 Tage (GitHub Actions)
create or replace function public.ping()
returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.ping() to anon, authenticated;

-- Einstellungen der App (nur der Planer liest und schreibt)
create table if not exists public.app_meta (
  key   text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table public.app_meta enable row level security;
create policy meta_planer on public.app_meta for all to authenticated
  using (public.is_planer()) with check (public.is_planer());
