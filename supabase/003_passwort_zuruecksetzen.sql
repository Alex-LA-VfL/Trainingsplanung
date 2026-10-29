-- 003 · Passwort zurücksetzen ohne Mailversand
-- Der Planer setzt einer Athletin oder einem Co-Trainer ein vorläufiges Passwort.
-- Das Konto (und damit alle Tagebucheinträge) bleibt erhalten.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.reset_password(target uuid, new_password text)
returns void
language plpgsql security definer set search_path = public, extensions, auth as
$$
begin
  if not public.is_planer() then
    raise exception 'Nur der Planer darf Passwörter zurücksetzen';
  end if;
  if length(coalesce(new_password, '')) < 8 then
    raise exception 'Das Passwort braucht mindestens 8 Zeichen';
  end if;
  if not exists (select 1 from public.people where id = target and role in ('athletin', 'cotrainer')) then
    raise exception 'Diese Person ist nicht freigeschaltet';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = target;
end
$$;

revoke all on function public.reset_password(uuid, text) from public, anon;
grant execute on function public.reset_password(uuid, text) to authenticated;
