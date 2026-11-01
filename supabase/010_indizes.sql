-- 010 · Vorbeugende Indizes auf Fremdschlüsseln (Postgres legt sie nicht automatisch an)
create index if not exists plan_lines_unit_idx     on public.plan_lines (unit_id);
create index if not exists diary_items_diary_idx   on public.diary_items (diary_id);
create index if not exists diary_entries_unit_idx  on public.diary_entries (unit_id);
create index if not exists deviations_unit_idx     on public.deviations (unit_id, athlete_id);
create index if not exists tests_athlete_idx       on public.tests (athlete_id, test_type, date desc);
create index if not exists results_athlete_idx     on public.results (athlete_id, date);
