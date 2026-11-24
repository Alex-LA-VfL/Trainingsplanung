-- 013 · Co-Trainer: lesen ja, schreiben nur mit Freigabe durch den Planer
-- Schreibend (Abweichungen festlegen, Testwerte/Ergebnisse eintragen und bestätigen) dürfen nur
-- der Planer und Co-Trainer mit may_write = true. Standard: aus.
alter table public.people add column if not exists may_write boolean not null default false;

create or replace function public.can_coach_write() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'planer' or (role = 'cotrainer' and may_write)
                    from public.people where id = auth.uid() and active), false) $$;
revoke all on function public.can_coach_write() from public, anon;
grant execute on function public.can_coach_write() to authenticated;

-- Abweichungen: alle Trainer lesen, schreiben nur mit Freigabe
drop policy if exists dev_trainer on public.deviations;
drop policy if exists dev_trainer_read on public.deviations;
drop policy if exists dev_trainer_write on public.deviations;
create policy dev_trainer_read  on public.deviations for select to authenticated using (public.is_trainer());
create policy dev_trainer_write on public.deviations for all    to authenticated
  using (public.can_coach_write()) with check (public.can_coach_write() and author_id = auth.uid());

-- Tests und Ergebnisse: Trainer-Eintrag und Bestätigung nur mit Freigabe
drop policy if exists tests_insert on public.tests;
create policy tests_insert on public.tests for insert to authenticated with check (athlete_id = auth.uid() or public.can_coach_write());
drop policy if exists tests_update on public.tests;
create policy tests_update on public.tests for update to authenticated using (public.can_coach_write());
drop policy if exists results_insert on public.results;
create policy results_insert on public.results for insert to authenticated with check (athlete_id = auth.uid() or public.can_coach_write());
drop policy if exists results_update on public.results;
create policy results_update on public.results for update to authenticated using (public.can_coach_write() or (athlete_id = auth.uid() and not confirmed));

-- Tagebuch: Trainer lesen nur; ändern und löschen nur die Athletin selbst
-- (vorher erlaubte die „for all“-Regel Trainern das Löschen fremder Tagebucheinträge)
drop policy if exists diary_own on public.diary_entries;
drop policy if exists diary_read on public.diary_entries;
drop policy if exists diary_write on public.diary_entries;
create policy diary_read  on public.diary_entries for select to authenticated using (athlete_id = auth.uid() or public.is_trainer());
create policy diary_write on public.diary_entries for all    to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
drop policy if exists diary_items_own on public.diary_items;
drop policy if exists diary_items_read on public.diary_items;
drop policy if exists diary_items_write on public.diary_items;
create policy diary_items_read  on public.diary_items for select to authenticated
  using (exists (select 1 from public.diary_entries d where d.id = diary_id and (d.athlete_id = auth.uid() or public.is_trainer())));
create policy diary_items_write on public.diary_items for all to authenticated
  using (exists (select 1 from public.diary_entries d where d.id = diary_id and d.athlete_id = auth.uid()))
  with check (exists (select 1 from public.diary_entries d where d.id = diary_id and d.athlete_id = auth.uid()));
