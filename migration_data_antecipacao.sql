-- Permite "forçar" a data considerada nas análises de faturamento/recebimento
-- (cronograma, comparativo trimestral/mensal, variável) quando o pagamento real
-- (data_pagamento) caiu num mês diferente do que deve contar para a competência
-- de análise. Fica desacoplado de data_pagamento, que continua guardando a data
-- real do pagamento.

alter table public.parcelas
  add column data_antecipacao date;

comment on column public.parcelas.data_antecipacao is
  'Data opcional que substitui data_pagamento apenas para fins de agrupamento nas análises de recebimento (cronograma, trimestral, mensal, variável). Null = usa data_pagamento normalmente.';
