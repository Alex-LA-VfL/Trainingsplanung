-- Trainingsplanung · Datenbankschema (MVP)
-- Ausführen: Supabase → SQL Editor → Inhalt einfügen → Run. Einmalig.
-- Grundsatz: Plan (plan_lines), Ist (diary_*) und Anlass (deviations) liegen getrennt.
-- Zugriff regelt die Datenbank selbst (Row Level Security), nicht die App.

-- ───────────── Personen und Rollen ─────────────
create table public.people (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text not null,
  role         text not null check (role in ('planer','cotrainer','athletin')),
  birth_year   int,
  profile_code text,                 -- z. B. U18, steuert Profilregeln
  disciplines  text[] default '{}',
  consent_on   date,                 -- Einwilligung (bei U16 inkl. Eltern)
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.people where id = auth.uid() and active $$;

create or replace function public.is_trainer() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() in ('planer','cotrainer'), false) $$;

create or replace function public.is_planer() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'planer', false) $$;

-- ───────────── Übungskatalog ─────────────
create table public.exercises (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  block      text not null,
  count_type text,
  rm_based   boolean not null default false,
  status     text not null default 'aktiv' check (status in ('aktiv','archiviert','neu – prüfen')),
  aliases    text[] not null default '{}',
  description text,
  image_url  text
);

-- ───────────── Kalender ─────────────
create table public.calendar_entries (
  id        bigint generated always as identity primary key,
  date_from date not null,
  date_to   date not null,
  kind      text not null check (kind in ('Schulferien','Feiertag','Wettkampf','Trainingslager','Termin','frei')),
  title     text not null,
  athletes  uuid[]                    -- leer = alle
);

-- ───────────── Plan ─────────────
create table public.units (               -- eine Trainingseinheit (Tag, ggf. E1/E2)
  id          bigint generated always as identity primary key,
  date        date not null,
  slot        smallint not null default 1 check (slot in (1,2)),
  kw          int,
  phase       text,
  week_hint   text,
  released    boolean not null default false,
  released_at timestamptz,
  changed_at  timestamptz,
  unique (date, slot)
);

create table public.plan_lines (          -- eine Zeile der Planungssprache
  id        bigint generated always as identity primary key,
  unit_id   bigint not null references public.units(id) on delete cascade,
  position  smallint,
  block     text not null,
  raw_text  text not null,
  parsed    jsonb not null,              -- Ergebnis des Parsers
  author_id uuid references public.people(id),
  source_cell text                       -- z. B. "H90" aus der Excel
);

create table public.deviations (          -- Abweichung je Athletin, immer mit Anlass
  id          bigint generated always as identity primary key,
  athlete_id  uuid not null references public.people(id) on delete cascade,
  unit_id     bigint references public.units(id) on delete cascade,
  plan_line_id bigint references public.plan_lines(id) on delete cascade,
  kind        text not null,             -- z. B. 'last_prozent', 'weglassen', 'ersetzen', 'umfang'
  value       jsonb,
  reason      text not null check (reason in ('krank','verletzt','Wettkampf','Schule','Test','Wiedereinstieg','Sonstiges')),
  note        text,
  author_id   uuid not null references public.people(id),
  created_at  timestamptz not null default now()
);

create table public.rules (               -- gesammelte Faustregeln
  id        bigint generated always as identity primary key,
  trigger   jsonb not null,              -- z. B. {"fehltage_min":3,"reason":"krank"}
  proposal  jsonb not null,              -- z. B. {"kind":"last_prozent","value":-10}
  status    text not null default 'Kandidat' check (status in ('Kandidat','aktiv','verworfen')),
  created_at timestamptz not null default now()
);

-- ───────────── Ist: Tagebuch ─────────────
create table public.diary_entries (
  id          bigint generated always as identity primary key,
  athlete_id  uuid not null references public.people(id) on delete cascade,
  unit_id     bigint not null references public.units(id) on delete cascade,
  status      text not null default 'fit' check (status in ('fit','eingeschränkt','krank','verletzt')),
  day_rating  smallint check (day_rating between 1 and 5),
  chips       text[] not null default '{}',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (athlete_id, unit_id)
);

create table public.diary_items (         -- Ist je Planzeile bzw. Übung / Set / Wurfform
  id           bigint generated always as identity primary key,
  diary_id     bigint not null references public.diary_entries(id) on delete cascade,
  plan_line_id bigint references public.plan_lines(id) on delete set null,
  exercise_id  bigint references public.exercises(id),
  actual       jsonb,                    -- z. B. {"sets":[{"reps":10,"kg":37.5}]} oder {"wurfform":"Ganze Würfe","geraet":"4 kg","wuerfe":15}
  rating       smallint check (rating between 1 and 5),
  chips        text[] not null default '{}'
);

-- ───────────── Leistung ─────────────
create table public.tests (
  id          bigint generated always as identity primary key,
  athlete_id  uuid not null references public.people(id) on delete cascade,
  exercise_id bigint references public.exercises(id),
  test_type   text not null,             -- '1RM', 'Sprint 30 m', ...
  date        date not null,
  value       numeric not null,
  unit        text not null default 'kg',
  context     text not null default 'Test' check (context in ('Test','Training','Wettkampf')),
  confirmed   boolean not null default false,
  created_by  uuid references public.people(id)
);

create table public.results (
  id          bigint generated always as identity primary key,
  athlete_id  uuid not null references public.people(id) on delete cascade,
  date        date not null,
  competition text not null,
  discipline  text not null,
  implement   text,                      -- Gerätegewicht
  attempts    numeric[],                 -- null = ungültig
  best        numeric,
  place       int,
  confirmed   boolean not null default false
);

create table public.comments (
  id         bigint generated always as identity primary key,
  ref_table  text not null,
  ref_id     bigint not null,
  author_id  uuid not null references public.people(id),
  body       text not null,
  created_at timestamptz not null default now()
);

-- ───────────── Zugriffsregeln ─────────────
alter table public.people           enable row level security;
alter table public.exercises        enable row level security;
alter table public.calendar_entries enable row level security;
alter table public.units            enable row level security;
alter table public.plan_lines       enable row level security;
alter table public.deviations       enable row level security;
alter table public.rules            enable row level security;
alter table public.diary_entries    enable row level security;
alter table public.diary_items      enable row level security;
alter table public.tests            enable row level security;
alter table public.results          enable row level security;
alter table public.comments         enable row level security;

-- Personen: volle Daten sieht nur die Person selbst und der Trainer; Namen für alle Angemeldeten über die Funktion people_names()
create policy people_read  on public.people for select to authenticated using (id = auth.uid() or public.is_trainer());
-- Namensliste: siehe Funktion people_names() in 002_people_names_absichern.sql
create policy people_write on public.people for all    to authenticated using (public.is_planer()) with check (public.is_planer());

-- Katalog und Kalender: lesen alle, schreiben Planer
create policy ex_read  on public.exercises for select to authenticated using (true);
create policy ex_write on public.exercises for all    to authenticated using (public.is_planer()) with check (public.is_planer());
create policy cal_read  on public.calendar_entries for select to authenticated using (true);
create policy cal_write on public.calendar_entries for all    to authenticated using (public.is_planer()) with check (public.is_planer());

-- Plan: Trainer sehen alles; Athletinnen nur freigegebene Einheiten bis heute (keine künftigen)
create policy units_read on public.units for select to authenticated
  using (public.is_trainer() or (released and date <= current_date));
create policy units_write on public.units for all to authenticated using (public.is_planer()) with check (public.is_planer());

create policy lines_read on public.plan_lines for select to authenticated
  using (public.is_trainer() or exists (select 1 from public.units u where u.id = unit_id and u.released and u.date <= current_date));
create policy lines_planer on public.plan_lines for all to authenticated using (public.is_planer()) with check (public.is_planer());
-- Co-Trainer dürfen nur ergänzen (neue Zeilen mit eigenem Namen), nicht ändern
create policy lines_cotrainer_insert on public.plan_lines for insert to authenticated
  with check (public.my_role() = 'cotrainer' and author_id = auth.uid());

-- Abweichungen und Regeln: nur Trainer
create policy dev_trainer on public.deviations for all to authenticated using (public.is_trainer()) with check (public.is_trainer() and author_id = auth.uid());
create policy dev_own_read on public.deviations for select to authenticated using (athlete_id = auth.uid());
create policy rules_planer on public.rules for all to authenticated using (public.is_planer()) with check (public.is_planer());

-- Tagebuch: nur die Athletin selbst und die Trainer (Befinden ist privat)
create policy diary_own on public.diary_entries for all to authenticated
  using (athlete_id = auth.uid() or public.is_trainer()) with check (athlete_id = auth.uid());
create policy diary_items_own on public.diary_items for all to authenticated
  using (exists (select 1 from public.diary_entries d where d.id = diary_id and (d.athlete_id = auth.uid() or public.is_trainer())))
  with check (exists (select 1 from public.diary_entries d where d.id = diary_id and d.athlete_id = auth.uid()));

-- Tests und Ergebnisse: für die Gruppe sichtbar; eintragen selbst, bestätigen Trainer
create policy tests_read on public.tests for select to authenticated using (true);
create policy tests_insert on public.tests for insert to authenticated with check (athlete_id = auth.uid() or public.is_trainer());
create policy tests_update on public.tests for update to authenticated using (public.is_trainer());
create policy results_read on public.results for select to authenticated using (true);
create policy results_insert on public.results for insert to authenticated with check (athlete_id = auth.uid() or public.is_trainer());
create policy results_update on public.results for update to authenticated using (public.is_trainer() or (athlete_id = auth.uid() and not confirmed));

-- Kommentare: Trainer sehen alle; Athletinnen eigene und Kommentare zu ihrem eigenen Tagebuch oder zu Planzeilen
create policy comments_read on public.comments for select to authenticated
  using (public.is_trainer() or author_id = auth.uid()
         or (ref_table = 'diary_entries' and exists (select 1 from public.diary_entries d where d.id = ref_id and d.athlete_id = auth.uid()))
         or (ref_table = 'plan_lines' and exists (select 1 from public.plan_lines l join public.units u on u.id = l.unit_id where l.id = ref_id and u.released and u.date <= current_date)));
create policy comments_insert on public.comments for insert to authenticated with check (author_id = auth.uid());
