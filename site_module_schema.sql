-- Módulo "Site": cases e artigos exibidos no site público (SiteNewmark)
-- Diferente das demais tabelas deste projeto, estas usam RLS porque serão
-- lidas pelo site público com a anon key, sem login.

create table public.site_cases (
  id uuid default gen_random_uuid() primary key,
  categoria text not null,
  descricao text not null,
  ordem integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.site_artigos (
  id uuid default gen_random_uuid() primary key,
  titulo text not null,
  texto text not null,
  imagem_url text,
  ordem integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.site_cases enable row level security;
alter table public.site_artigos enable row level security;

-- Leitura pública (site institucional, sem login)
create policy "site_cases_select_public" on public.site_cases
  for select to anon, authenticated using (true);

create policy "site_artigos_select_public" on public.site_artigos
  for select to anon, authenticated using (true);

-- Escrita apenas por usuários logados no painel
create policy "site_cases_write_authenticated" on public.site_cases
  for all to authenticated using (true) with check (true);

create policy "site_artigos_write_authenticated" on public.site_artigos
  for all to authenticated using (true) with check (true);

-- Adicionado depois: imagem nos cases (mesmo padrão dos artigos)
alter table public.site_cases add column imagem_url text;

-- Adicionado depois: resumo em tópicos na página de detalhe do artigo
alter table public.site_artigos add column resumo text;
