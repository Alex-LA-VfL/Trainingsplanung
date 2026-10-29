-- 005 · Einwilligung in der App bestätigen
alter table public.people add column if not exists consent_app_at timestamptz;

create or replace function public.accept_consent()
returns void
language sql security definer set search_path = public as
$$ update public.people set consent_app_at = now() where id = auth.uid() and active $$;

revoke all on function public.accept_consent() from public, anon;
grant execute on function public.accept_consent() to authenticated;
