-- 014 · Trainingsfreie Tage: „frei“ in der Zeile Termine erzeugt einen freien Tag, den die Athletinnen sehen
alter table public.units add column if not exists free boolean not null default false;
alter table public.units add column if not exists day_note text;
