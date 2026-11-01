-- 011 · Belastungsskala 0–10 ab KW 45/2026 (02.11.2026); ältere Einträge behalten die Skala 1–5
alter table public.diary_entries add column if not exists scale smallint not null default 5 check (scale in (5, 10));

alter table public.diary_entries drop constraint if exists diary_entries_day_rating_check;
alter table public.diary_entries add constraint diary_entries_day_rating_check check (day_rating between 0 and 10);
alter table public.diary_items drop constraint if exists diary_items_rating_check;
alter table public.diary_items add constraint diary_items_rating_check check (rating between 0 and 10);
