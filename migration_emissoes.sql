-- Migration: Controle de Emissões de NFs e Boletos
-- Execute este SQL no Supabase SQL Editor

ALTER TABLE public.parcelas
  ADD COLUMN IF NOT EXISTS boleto_numero text,
  ADD COLUMN IF NOT EXISTS data_emissao_boleto date,
  ADD COLUMN IF NOT EXISTS nf_arquivo_url text,
  ADD COLUMN IF NOT EXISTS boleto_arquivo_url text,
  ADD COLUMN IF NOT EXISTS email_enviado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_enviado_em timestamp with time zone;

-- Mensagem padrão de cobrança por contrato
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS mensagem_padrao text;
