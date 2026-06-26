create table public.site_clientes (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  logo_url text,
  ordem integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.site_clientes enable row level security;

create policy "site_clientes_select_public" on public.site_clientes
  for select to anon, authenticated using (true);

create policy "site_clientes_write_authenticated" on public.site_clientes
  for all to authenticated using (true) with check (true);
