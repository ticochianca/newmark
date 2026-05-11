-- Tabela de Perfis de Usuário (estendendo a autenticação do Supabase)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  nome text not null,
  perfil text check (perfil in ('Administrador', 'Colaborador')) not null,
  ativo boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Clientes
create table public.clientes (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  cnpj text unique not null,
  email_cobranca text not null,
  status text check (status in ('Prospect', 'Ativo', 'Inativo')) not null,
  observacoes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Contratos
create table public.contratos (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid references public.clientes on delete cascade not null,
  titulo text not null,
  data_inicio date not null,
  data_termino date,
  valor_total numeric(12, 2) not null,
  tipo_cobranca text not null,
  tem_prospeccao boolean not null default false,
  responsavel_prospeccao_id uuid references public.profiles,
  valor_prospeccao numeric(12, 2),
  status_prospeccao text check (status_prospeccao in ('Pendente', 'Pago')),
  data_pag_prospeccao date,
  status text check (status in ('Em andamento', 'Concluído', 'Cancelado', 'Pausado')) not null,
  observacoes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Atendentes do Contrato (Distribuição)
create table public.contrato_atendentes (
  id uuid default gen_random_uuid() primary key,
  contrato_id uuid references public.contratos on delete cascade not null,
  usuario_id uuid references public.profiles not null,
  percentual numeric(5, 2) not null check (percentual > 0 and percentual <= 100),
  data_inicio date not null,
  data_fim date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Parcelas
create table public.parcelas (
  id uuid default gen_random_uuid() primary key,
  contrato_id uuid references public.contratos on delete cascade not null,
  numero integer not null,
  tipo text not null,
  descricao text,
  valor numeric(12, 2) not null,
  data_vencimento date not null,
  nf_numero text,
  data_emissao_nf date,
  data_pagamento date,
  status text check (status in ('Pendente', 'NF Emitida', 'Paga', 'Em atraso')) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Desabilitar RLS (Row Level Security) inicial para facilitar o desenvolvimento
-- Em produção, configurar políticas adequadas.
alter table public.profiles disable row level security;
alter table public.clientes disable row level security;
alter table public.contratos disable row level security;
alter table public.contrato_atendentes disable row level security;
alter table public.parcelas disable row level security;
