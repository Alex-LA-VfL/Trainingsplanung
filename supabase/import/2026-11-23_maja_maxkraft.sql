-- Altdaten-Import Maximalkrafttests Maja (Stand 23.11.2026, aus den Papier-Testbögen)
-- Einmal komplett im Supabase SQL-Editor ausführen. Mehrfaches Ausführen erzeugt keine Doppelungen.

do $$
declare c int;
begin
  select count(*) into c from public.people where split_part(name,' ',1) = 'Maja' and role = 'athletin';
  if c <> 1 then raise exception 'Athletin Maja nicht eindeutig gefunden (% Treffer)', c; end if;
end $$;

with t(uebung, datum, wert) as (values
  ('Kniebeuge hinten (KB hinten)', date '2025-11-20', 100),
  ('Kniebeuge vorne (KB vorne)', date '2024-10-31', 55),
  ('Kniebeuge vorne (KB vorne)', date '2025-02-27', 75),
  ('Kniebeuge vorne (KB vorne)', date '2025-11-17', 80),
  ('Reißen', date '2024-10-31', 35),
  ('Reißen', date '2025-02-27', 37.5),
  ('Reißen', date '2025-11-20', 40),
  ('Reißen', date '2026-04-04', 42.5),
  ('Umsetzen', date '2025-11-17', 50),
  ('Umsetzen', date '2026-04-04', 62),
  ('Bankdrücken', date '2025-11-20', 42.5),
  ('Bankdrücken', date '2026-04-04', 55),
  ('Bankziehen', date '2025-02-27', 47.5),
  ('Bankziehen', date '2025-11-17', 50),
  ('Ausstoßen', date '2026-04-04', 45),
  ('Anreißen', date '2026-04-04', 50),
  ('Hanteldrehen', date '2025-11-17', 30),
  ('Hanteldrehen', date '2026-04-04', 55),
  ('Hip Thrust', date '2025-11-17', 130),
  ('Reiß-Kniebeuge (Reiß-KB)', date '2025-11-20', 50)
)
insert into public.tests (athlete_id, exercise_id, exercise_name, test_type, date, value, unit, context, confirmed)
select p.id, e.id, t.uebung, '1RM', t.datum, t.wert, 'kg', 'Test', true
from t
join public.people p on split_part(p.name,' ',1) = 'Maja' and p.role = 'athletin'
left join public.exercises e on e.name = t.uebung
on conflict (athlete_id, date, test_type, exercise_name) do update set value = excluded.value, confirmed = true;

-- Kontrolle: erwartet 20 Tests für Maja
select p.name, count(*) as tests from public.tests t join public.people p on p.id = t.athlete_id
where split_part(p.name,' ',1) = 'Maja' and t.test_type = '1RM' group by 1;
