-- 002 · Namensliste absichern
-- Ersetzt die Sicht people_names (lief mit den Rechten des Erstellers und wäre über den
-- öffentlichen Schlüssel auch ohne Anmeldung lesbar gewesen) durch eine Funktion,
-- die nur für angemeldete, aktive Personen Namen liefert.
drop view if exists public.people_names;

create or replace function public.people_names()
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = public as
$$
  select p.id, p.name, p.role
  from public.people p
  where p.active
    and exists (select 1 from public.people me where me.id = auth.uid() and me.active)
$$;

revoke all on function public.people_names() from public, anon;
grant execute on function public.people_names() to authenticated;
