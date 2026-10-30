-- Altdaten-Import (Stand 30.10.2026): Maximalkrafttests Alena + Milena, Wettkampfergebnisse Alena + Maja
-- Einmal komplett im Supabase SQL-Editor ausführen ("Run"). Mehrfaches Ausführen erzeugt keine Doppelungen.
-- Zuordnung über den Vornamen (erstes Wort von people.name).

do $$
declare n text; c int;
begin
  foreach n in array array['Alena','Milena','Maja'] loop
    select count(*) into c from public.people where split_part(name,' ',1) = n and role = 'athletin';
    if c <> 1 then raise exception 'Athletin % nicht eindeutig gefunden (% Treffer)', n, c; end if;
  end loop;
end $$;

with t(vorname, uebung, datum, wert) as (values
  ('Alena','Kniebeuge vorne (KB vorne)',date '2025-11-17',55),
  ('Alena','Kniebeuge vorne (KB vorne)',date '2026-04-04',65),
  ('Alena','Kniebeuge hinten (KB hinten)',date '2025-11-20',65),
  ('Alena','Kniebeuge hinten (KB hinten)',date '2026-04-04',75),
  ('Alena','Umsetzen',date '2025-11-17',40),
  ('Alena','Umsetzen',date '2026-04-04',47.5),
  ('Alena','Reißen',date '2025-11-20',25),
  ('Alena','Reißen',date '2026-04-04',30),
  ('Alena','Bankziehen',date '2025-11-17',40),
  ('Alena','Bankziehen',date '2026-04-04',42),
  ('Alena','Reiß-Kniebeuge (Reiß-KB)',date '2025-11-20',40),
  ('Alena','Hip Thrust',date '2025-11-17',100),
  ('Alena','Hanteldrehen',date '2025-11-17',20),
  ('Alena','Anreißen',date '2025-11-20',40),
  ('Alena','Anreißen',date '2026-04-04',40),
  ('Milena','Kniebeuge hinten (KB hinten)',date '2025-02-27',90),
  ('Milena','Kniebeuge hinten (KB hinten)',date '2025-11-20',100),
  ('Milena','Kniebeuge hinten (KB hinten)',date '2026-04-04',100),
  ('Milena','Umsetzen',date '2025-11-17',55),
  ('Milena','Umsetzen',date '2026-04-04',60),
  ('Milena','Reißen',date '2025-02-27',37.5),
  ('Milena','Reißen',date '2025-11-20',32.5),
  ('Milena','Reißen',date '2026-04-04',37.5),
  ('Milena','Bankziehen',date '2025-11-17',50),
  ('Milena','Bankdrücken',date '2022-09-29',35),
  ('Milena','Bankdrücken',date '2025-11-20',37.5),
  ('Milena','Bankdrücken',date '2026-04-04',45),
  ('Milena','Kniebeuge vorne (KB vorne)',date '2025-11-17',70),
  ('Milena','Kniebeuge vorne (KB vorne)',date '2026-04-04',85),
  ('Milena','Hip Thrust',date '2025-11-17',130),
  ('Milena','Hanteldrehen',date '2025-11-17',35),
  ('Milena','Hanteldrehen',date '2026-04-04',55),
  ('Milena','Reiß-Kniebeuge (Reiß-KB)',date '2025-11-20',40),
  ('Milena','Ausstoßen',date '2026-04-04',40),
  ('Milena','Anreißen',date '2026-04-04',55)
)
insert into public.tests (athlete_id, exercise_id, exercise_name, test_type, date, value, unit, context, confirmed)
select p.id, e.id, t.uebung, '1RM', t.datum, t.wert, 'kg', 'Test', true
from t
join public.people p on split_part(p.name,' ',1) = t.vorname and p.role = 'athletin'
left join public.exercises e on e.name = t.uebung
on conflict (athlete_id, date, test_type, exercise_name) do update set value = excluded.value, confirmed = true;

with r(vorname, datum, wettkampf, disziplin, geraet, weite) as (values
  ('Alena',date '2023-05-06','Langenbrand (Forbach)','Hammerwurf','3 kg',30.32),
  ('Alena',date '2023-06-08','Crailsheim','Hammerwurf','3 kg',28.35),
  ('Alena',date '2023-06-17','Aichach','Hammerwurf','3 kg',35.83),
  ('Alena',date '2023-07-09','Sindelfingen','Hammerwurf','3 kg',34.41),
  ('Alena',date '2024-05-16','Sindelfingen','Hammerwurf','3 kg',38.11),
  ('Alena',date '2024-05-25','Halle (Saale)','Hammerwurf','3 kg',40.3),
  ('Alena',date '2024-06-07','Dischingen','Hammerwurf','3 kg',40.21),
  ('Alena',date '2024-06-22','Koblenz','Hammerwurf','3 kg',42.26),
  ('Alena',date '2024-07-13','Stuttgart','Hammerwurf','3 kg',40.15),
  ('Alena',date '2024-07-17','Sindelfingen','Hammerwurf','3 kg',35.81),
  ('Alena',date '2024-07-28','Koblenz','Hammerwurf','3 kg',41.55),
  ('Alena',date '2024-09-14','Hösbach','Hammerwurf','3 kg',30.34),
  ('Alena',date '2025-06-29','St. Wendel','Hammerwurf','3 kg',37.87),
  ('Alena',date '2025-07-02','Sindelfingen','Hammerwurf','3 kg',41.37),
  ('Alena',date '2025-07-16','Sindelfingen','Hammerwurf','3 kg',34.8),
  ('Alena',date '2025-07-27','Löffingen','Hammerwurf','3 kg',40.9),
  ('Alena',date '2026-02-07','Frickenhausen','Hammerwurf','3 kg',43.83),
  ('Alena',date '2026-04-25','Langenbrand (Forbach)','Hammerwurf','3 kg',44.88),
  ('Alena',date '2026-05-10','Langenbrand (Forbach)','Hammerwurf','3 kg',50.86),
  ('Alena',date '2026-05-23','Fränkisch-Crumbach','Hammerwurf','3 kg',46.63),
  ('Alena',date '2026-05-31','Brixen/ITA','Hammerwurf','3 kg',53.47),
  ('Alena',date '2026-06-20','Koblenz','Hammerwurf','3 kg',52.95),
  ('Alena',date '2026-07-04','Bochum-Wattenscheid','Hammerwurf','3 kg',51.9),
  ('Alena',date '2026-07-11','Stuttgart','Hammerwurf','3 kg',52.1),
  ('Alena',date '2026-07-19','Walldorf','Hammerwurf','3 kg',54.12),
  ('Alena',date '2026-07-22','Sindelfingen','Hammerwurf','3 kg',50.77),
  ('Maja',date '2023-03-05','Stuttgart','Kugelstoß','3 kg',9.01),
  ('Maja',date '2023-04-22','Stuttgart','Kugelstoß','3 kg',9.63),
  ('Maja',date '2023-05-21','Leonberg','Kugelstoß','3 kg',9.93),
  ('Maja',date '2023-07-01','Heidenheim','Kugelstoß','3 kg',9.09),
  ('Maja',date '2023-07-08','Stuttgart','Kugelstoß','3 kg',9.56),
  ('Maja',date '2023-07-16','Dagersheim','Kugelstoß','3 kg',10.38),
  ('Maja',date '2024-01-21','Mannheim','Kugelstoß','3 kg',9.52),
  ('Maja',date '2024-04-27','Ettlingen','Kugelstoß','3 kg',10.18),
  ('Maja',date '2024-05-01','Rechberghausen','Kugelstoß','3 kg',10.37),
  ('Maja',date '2024-05-09','Bönnigheim','Kugelstoß','3 kg',10.56),
  ('Maja',date '2024-05-11','Leonberg','Kugelstoß','3 kg',10.9),
  ('Maja',date '2024-05-26','Halle (Saale)','Kugelstoß','3 kg',11.43),
  ('Maja',date '2024-07-14','Stuttgart','Kugelstoß','3 kg',11.48),
  ('Maja',date '2024-09-14','Hösbach','Kugelstoß','3 kg',11.3),
  ('Maja',date '2025-01-18','Sindelfingen','Kugelstoß','3 kg',11.36),
  ('Maja',date '2025-01-26','Sindelfingen','Kugelstoß','3 kg',11.11),
  ('Maja',date '2025-02-09','Sindelfingen','Kugelstoß','3 kg',11.67),
  ('Maja',date '2025-05-01','Renningen','Kugelstoß','3 kg',12.93),
  ('Maja',date '2025-05-25','Halle (Saale)','Kugelstoß','3 kg',12.8),
  ('Maja',date '2025-05-29','Bönnigheim','Kugelstoß','3 kg',12.64),
  ('Maja',date '2025-06-21','Langensteinbach (Karlsbad)','Kugelstoß','3 kg',12.29),
  ('Maja',date '2025-06-29','St. Wendel','Kugelstoß','3 kg',12.16),
  ('Maja',date '2025-07-11','Nagold','Kugelstoß','3 kg',12.88),
  ('Maja',date '2025-07-16','Köngen','Kugelstoß','3 kg',12.21),
  ('Maja',date '2026-01-31','Karlsruhe','Kugelstoß','3 kg',12.64),
  ('Maja',date '2026-02-08','Sindelfingen','Kugelstoß','3 kg',13.39),
  ('Maja',date '2026-05-01','Renningen','Kugelstoß','3 kg',13.67),
  ('Maja',date '2026-05-14','Bönnigheim','Kugelstoß','3 kg',13.01),
  ('Maja',date '2026-06-17','Keltern','Kugelstoß','3 kg',13.93),
  ('Maja',date '2026-06-21','Koblenz','Kugelstoß','3 kg',12.56),
  ('Maja',date '2026-07-04','Bochum-Wattenscheid','Kugelstoß','3 kg',12.12),
  ('Maja',date '2026-07-11','Stuttgart','Kugelstoß','3 kg',11.2),
  ('Maja',date '2026-07-19','Walldorf','Kugelstoß','3 kg',11.92)
)
insert into public.results (athlete_id, date, competition, discipline, implement, best, confirmed)
select p.id, r.datum, r.wettkampf, r.disziplin, r.geraet, r.weite, true
from r
join public.people p on split_part(p.name,' ',1) = r.vorname and p.role = 'athletin'
where not exists (select 1 from public.results x where x.athlete_id = p.id and x.date = r.datum
                  and x.discipline = r.disziplin and x.best = r.weite);

-- Kontrolle: erwartet Alena 15 Tests / 26 Ergebnisse, Milena 20 Tests, Maja 33 Ergebnisse
select p.name, 'Tests' as art, count(*) from public.tests t join public.people p on p.id = t.athlete_id group by 1
union all
select p.name, 'Ergebnisse', count(*) from public.results r join public.people p on p.id = r.athlete_id group by 1
order by 1, 2;
