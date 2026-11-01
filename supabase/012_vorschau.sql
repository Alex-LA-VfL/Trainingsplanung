-- 012 · Vorschau: einzelne Konten (z. B. Testkonto) sehen freigegebene Tage auch in der Zukunft
alter table public.people add column if not exists preview boolean not null default false;

create or replace function public.can_preview()
returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select preview from public.people where id = auth.uid() and active), false) $$;
revoke all on function public.can_preview() from public, anon;
grant execute on function public.can_preview() to authenticated;

drop policy if exists units_read on public.units;
create policy units_read on public.units for select to authenticated
  using (public.is_trainer() or (released and (date <= current_date or public.can_preview()) and public.sees_day(date)));

drop policy if exists lines_read on public.plan_lines;
create policy lines_read on public.plan_lines for select to authenticated
  using (public.is_trainer() or exists (
    select 1 from public.units u where u.id = unit_id and u.released
      and (u.date <= current_date or public.can_preview()) and public.sees_day(u.date)));
