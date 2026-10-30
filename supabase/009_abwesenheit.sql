-- 009 · Abwesenheit: „Heute nicht im Training“ mit Grund
-- krank/verletzt wandern aus dem Befinden in die Abwesenheit; Urlaub, Schule, Sonstiges kommen dazu.
alter table public.diary_entries add column if not exists absence text
  check (absence in ('krank','verletzt','Urlaub','Schule','Sonstiges'));

alter table public.diary_entries drop constraint if exists diary_entries_status_check;
alter table public.diary_entries add constraint diary_entries_status_check
  check (status in ('fit','eingeschränkt','müde','gestresst','Muskelkater','krank','verletzt','abwesend'));

-- Bestehende Einträge übernehmen
update public.diary_entries
   set absence = case when 'verletzt' = any(befinden) or status = 'verletzt' then 'verletzt' else 'krank' end,
       befinden = array_remove(array_remove(befinden, 'krank'), 'verletzt')
 where absence is null and (status in ('krank','verletzt') or befinden && array['krank','verletzt']);
