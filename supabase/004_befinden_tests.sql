-- 004 · Befinden mit mehreren Angaben, Maximalkrafttests aus dem Tagebuch
alter table public.diary_entries drop constraint if exists diary_entries_status_check;
alter table public.diary_entries add constraint diary_entries_status_check
  check (status in ('fit','eingeschränkt','müde','gestresst','Muskelkater','krank','verletzt'));
alter table public.diary_entries add column if not exists befinden text[] not null default '{}';

-- Test je Übung: Name aus dem Übungskatalog (z. B. „Reißen“)
alter table public.tests add column if not exists exercise_name text;
alter table public.tests add constraint tests_unique_per_day unique (athlete_id, date, test_type, exercise_name);
-- Athletin darf eigene, noch nicht bestätigte Testwerte korrigieren
create policy tests_update_own on public.tests for update to authenticated
  using (athlete_id = auth.uid() and not confirmed) with check (athlete_id = auth.uid() and not confirmed);
