-- 006 · Trainingstage je Athletin
-- training_days: Wochentage, an denen die Person zur Gruppe gehört (1 = Mo … 7 = So).
-- Leer = alle Tage. Athletinnen sehen nur Einheiten an ihren Tagen.
alter table public.people add column if not exists training_days smallint[];

create or replace function public.sees_day(d date)
returns boolean
language sql stable security definer set search_path = public as
$$
  select coalesce(
    (select p.training_days is null or cardinality(p.training_days) = 0
              or extract(isodow from d)::smallint = any (p.training_days)
       from public.people p where p.id = auth.uid()),
    false)
$$;
revoke all on function public.sees_day(date) from public, anon;
grant execute on function public.sees_day(date) to authenticated;

drop policy if exists units_read on public.units;
create policy units_read on public.units for select to authenticated
  using (public.is_trainer() or (released and date <= current_date and public.sees_day(date)));

drop policy if exists lines_read on public.plan_lines;
create policy lines_read on public.plan_lines for select to authenticated
  using (public.is_trainer() or exists (
    select 1 from public.units u where u.id = unit_id and u.released and u.date <= current_date and public.sees_day(u.date)));
