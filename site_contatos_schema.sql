create table public.site_contatos (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  email text not null,
  telefone text,
  mensagem text not null,
  lida boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.site_contatos enable row level security;

-- Qualquer visitante do site (anônimo) pode enviar uma mensagem pelo formulário.
create policy "site_contatos_insert_public" on public.site_contatos
  for insert to anon, authenticated with check (true);

-- Só usuários logados no painel podem ler/gerenciar as mensagens recebidas.
create policy "site_contatos_select_authenticated" on public.site_contatos
  for select to authenticated using (true);

create policy "site_contatos_update_authenticated" on public.site_contatos
  for update to authenticated using (true) with check (true);

create policy "site_contatos_delete_authenticated" on public.site_contatos
  for delete to authenticated using (true);
