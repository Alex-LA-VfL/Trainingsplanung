-- 007 · Profilregeln (U16/U18/U20) und Geschlecht für Gerätegewichte
alter table public.people add column if not exists sex text check (sex in ('w','m'));

create table if not exists public.profiles (
  code          text primary key,            -- z. B. U16
  volume_factor numeric not null default 1,  -- 0.8 = Wiederholungen bei Kraft und Sprüngen auf 80 %
  implements    jsonb not null default '{}', -- {"Kugel":{"w":"3 kg","m":"4 kg"}, …}
  blocked       text[] not null default '{}',-- Übungen, die für dieses Profil entfallen
  note          text
);
alter table public.profiles enable row level security;
create policy profiles_read  on public.profiles for select to authenticated using (true);
create policy profiles_write on public.profiles for all    to authenticated using (public.is_planer()) with check (public.is_planer());

insert into public.profiles (code, volume_factor, implements) values
 ('U16', 0.8, '{"Kugel":{"w":"3 kg","m":"4 kg"},"Diskus":{"w":"1 kg","m":"1 kg"},"Speer":{"w":"500 g","m":"600 g"},"Hammer":{"w":"3 kg","m":"4 kg"}}'),
 ('U18', 0.9, '{"Kugel":{"w":"3 kg","m":"5 kg"},"Diskus":{"w":"1 kg","m":"1,5 kg"},"Speer":{"w":"500 g","m":"700 g"},"Hammer":{"w":"3 kg","m":"5 kg"}}'),
 ('U20', 1.0, '{"Kugel":{"w":"4 kg","m":"6 kg"},"Diskus":{"w":"1 kg","m":"1,75 kg"},"Speer":{"w":"600 g","m":"800 g"},"Hammer":{"w":"4 kg","m":"6 kg"}}')
on conflict (code) do nothing;
