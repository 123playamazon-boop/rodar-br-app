-- ============================================================
--  RODAR BR — schema do banco (Supabase / Postgres)
--  Cole isto no Supabase: Project > SQL Editor > New query > Run
-- ============================================================

-- Uma linha por usuário, guardando todo o estado do app (guia + dashboard)
create table if not exists public.app_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Liga a segurança por linha (cada aluno só enxerga os próprios dados)
alter table public.app_state enable row level security;

-- Políticas: o usuário só lê/grava a linha dele
drop policy if exists "app_state_select_own" on public.app_state;
create policy "app_state_select_own"
  on public.app_state for select
  using (auth.uid() = user_id);

drop policy if exists "app_state_insert_own" on public.app_state;
create policy "app_state_insert_own"
  on public.app_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "app_state_update_own" on public.app_state;
create policy "app_state_update_own"
  on public.app_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Mantém updated_at sempre atual
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_app_state_touch on public.app_state;
create trigger trg_app_state_touch
  before update on public.app_state
  for each row execute function public.touch_updated_at();
