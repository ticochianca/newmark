"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getPersonColor } from '@/lib/personColors';

export default function ParcelasModule() {
  const currentYear = new Date().getFullYear();
  const [anoSelecionado, setAnoSelecionado] = useState(currentYear);
  const [parcelasAgrupadas, setParcelasAgrupadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [hoveredParcela, setHoveredParcela] = useState(null);
  const [mostrarAlocacao, setMostrarAlocacao] = useState(false);
  const [anosDisponiveis, setAnosDisponiveis] = useState([]);
  const [viewMode, setViewMode] = useState('cronograma'); // 'cronograma' | 'tabela' | 'atrasadas' | 'trimestral'
  const [filtroCliente, setFiltroCliente] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [atrasadas, setAtrasadas] = useState([]);
  const [loadingAtrasadas, setLoadingAtrasadas] = useState(false);
  const [atrasadasCount, setAtrasadasCount] = useState(0);
  const [recebidoPago, setRecebidoPago] = useState([]);
  const [loadingTrimestral, setLoadingTrimestral] = useState(false);
  const [trimDe, setTrimDe] = useState('');
  const [trimAte, setTrimAte] = useState('');

  const tableWrapperRef = useRef(null);

  // Action Modal State
  const [modalState, setModalState] = useState({ isOpen: false, parcela: null, realId: null, mode: 'pagar', data: '', nfNumero: '', boletoVencimento: '', valorPontual: '', valorAjuste: '', obsAjuste: '', forcarAntecipacao: false, dataAntecipacao: '' });

  const fetchParcelas = async () => {
    setLoading(true);
    const start = dataInicio || `${anoSelecionado}-01-01`;
    const end = dataFim || `${anoSelecionado}-12-31`;

    const { data, error } = await supabase
      .from('parcelas')
      .select('*, contratos(id, titulo, cobranca_mesmo_mes, clientes(nome, apelido), contrato_atendentes(*, profiles(nome)))')
      .or(`and(data_vencimento.gte.${start},data_vencimento.lte.${end}),and(data_original.gte.${start},data_original.lte.${end})`)
      .order('data_vencimento', { ascending: true });
      
    if (error) {
      console.error('Erro ao buscar parcelas:', error);
    } else {
      const grouped = {};
      data.forEach(p => {
        const cId = p.contrato_id;
        if (!grouped[cId]) {
          grouped[cId] = {
            contrato: p.contratos,
            meses: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [], 11: [], 12: [] }
          };
        }
        
        // data_antecipacao, quando preenchida, substitui data_pagamento só para fins de agrupamento/análise
        const dataRecebimento = p.data_antecipacao || p.data_pagamento;
        const isPaidInDiffMonth = p.status === 'Paga' && dataRecebimento && p.data_vencimento.substring(0,7) !== dataRecebimento.substring(0,7);
        const activeDate = (p.status === 'Paga' && dataRecebimento) ? dataRecebimento : p.data_vencimento;
        
        const monthActive = parseInt(activeDate.split('-')[1], 10);
        const yearActive = parseInt(activeDate.split('-')[0], 10);
        
        if (yearActive === anoSelecionado) {
          grouped[cId].meses[monthActive].push(p);
        }

        if (p.data_original && p.data_original !== p.data_vencimento) {
          const monthOrig = parseInt(p.data_original.split('-')[1], 10);
          const yearOrig = parseInt(p.data_original.split('-')[0], 10);
          if (yearOrig === anoSelecionado && monthOrig !== monthActive) {
            grouped[cId].meses[monthOrig].push({
              ...p,
              isGhost: true,
              ghostType: 'reprogramada',
              id: `ghost-${p.id}`
            });
          }
        }

        if (isPaidInDiffMonth) {
          const monthVenc = parseInt(p.data_vencimento.split('-')[1], 10);
          const yearVenc = parseInt(p.data_vencimento.split('-')[0], 10);
          if (yearVenc === anoSelecionado && monthVenc !== monthActive) {
            grouped[cId].meses[monthVenc].push({
              ...p,
              isGhost: true,
              ghostType: 'paga_diferente',
              id: `ghost-paid-${p.id}`
            });
          }
        }
      });
      
      const sortedArray = Object.values(grouped).sort((a, b) => {
        const nameA = a.contrato?.clientes?.apelido || a.contrato?.clientes?.nome || '';
        const nameB = b.contrato?.clientes?.apelido || b.contrato?.clientes?.nome || '';
        return nameA.localeCompare(nameB);
      });

      setParcelasAgrupadas(sortedArray);
    }
    setLoading(false);
  };

  // Parcelas em atraso: status ainda aberto (não Paga/Reprogramada/Congelada — mesma
  // definição usada em getStatusDisplay) e vencimento no passado, independente do
  // Ano Base selecionado — para não esconder atrasos de anos anteriores.
  const fetchAtrasadas = async () => {
    setLoadingAtrasadas(true);
    const hoje = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('parcelas')
      .select('*, contratos(id, titulo, cobranca_mesmo_mes, clientes(nome, apelido), contrato_atendentes(*, profiles(nome)))')
      .not('status', 'in', '(Paga,Reprogramada,Congelada)')
      .lt('data_vencimento', hoje)
      .order('data_vencimento', { ascending: true });

    if (error) {
      console.error('Erro ao buscar parcelas atrasadas:', error);
    } else {
      setAtrasadas(data || []);
      setAtrasadasCount((data || []).length);
    }
    setLoadingAtrasadas(false);
  };

  // Recebimentos (parcelas Pagas) de todo o histórico, para comparar totais por trimestre.
  // data_antecipacao, quando preenchida, substitui data_pagamento só para fins de agrupamento.
  const fetchRecebidoPago = async () => {
    setLoadingTrimestral(true);
    const { data, error } = await supabase
      .from('parcelas')
      .select('valor, data_pagamento, data_antecipacao, contratos(clientes(nome, apelido))')
      .eq('status', 'Paga')
      .not('data_pagamento', 'is', null)
      .order('data_pagamento', { ascending: true });

    if (error) {
      console.error('Erro ao buscar recebimentos:', error);
    } else {
      setRecebidoPago((data || []).map(p => ({ ...p, _data: p.data_antecipacao || p.data_pagamento })));
    }
    setLoadingTrimestral(false);
  };

  // Refresca a view atual e, se estivermos na tela de Atrasadas/Trimestral, também aquela lista
  const refetchAll = () => {
    fetchParcelas();
    if (viewMode === 'atrasadas') fetchAtrasadas();
    if (viewMode === 'trimestral' || viewMode === 'mensal') fetchRecebidoPago();
  };

  useEffect(() => {
    fetchParcelas();
  }, [anoSelecionado, dataInicio, dataFim]);

  // Badge com a contagem de atrasadas, carregado uma vez ao abrir o módulo
  useEffect(() => {
    const fetchCount = async () => {
      const hoje = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('parcelas')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '(Paga,Reprogramada,Congelada)')
        .lt('data_vencimento', hoje);
      setAtrasadasCount(count || 0);
    };
    fetchCount();
  }, []);

  useEffect(() => {
    if (viewMode === 'atrasadas') fetchAtrasadas();
    if (viewMode === 'trimestral' || viewMode === 'mensal') fetchRecebidoPago();
  }, [viewMode]);

  useEffect(() => {
    const fetchAnos = async () => {
      const { data } = await supabase
        .from('parcelas')
        .select('data_vencimento, data_pagamento, data_original')
        .order('data_vencimento', { ascending: true });

      if (data) {
        const yearsSet = new Set();
        data.forEach(p => {
          if (p.data_vencimento) yearsSet.add(parseInt(p.data_vencimento.split('-')[0], 10));
          if (p.data_pagamento) yearsSet.add(parseInt(p.data_pagamento.split('-')[0], 10));
          if (p.data_original) yearsSet.add(parseInt(p.data_original.split('-')[0], 10));
        });
        const sortedYears = Array.from(yearsSet).sort((a, b) => a - b);
        setAnosDisponiveis(sortedYears);
      }
    };
    fetchAnos();
  }, []);

  const formatInitials = (nome) => {
    if (!nome) return '';
    const parts = nome.trim().split(' ').filter(n => n.length > 0);
    if (parts.length === 0) return '';
    const first = parts[0][0].toUpperCase();
    const last = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
    return `${first}${last}`;
  };

  const getActiveAllocations = (parcela) => {
    if (!parcela.contratos || !parcela.contratos.contrato_atendentes) return [];
    
    const isMesmoMes = parcela.contratos?.cobranca_mesmo_mes;
    const dataBase = parcela.data_original || parcela.data_vencimento;
    const dateObj = new Date(dataBase);
    
    if (!isMesmoMes) {
      dateObj.setUTCMonth(dateObj.getUTCMonth() - 1);
    }
    
    const pDate = dateObj.toISOString().split('T')[0];
    
    return parcela.contratos.contrato_atendentes.filter(r => {
      const activeStart = !r.data_inicio || pDate >= r.data_inicio;
      const activeEnd = !r.data_fim || pDate <= r.data_fim;
      return activeStart && activeEnd;
    });
  };

  // --- SVG Connections Logic ---
  const calculateConnections = () => {
    if (!tableWrapperRef.current) return;
    
    const newConnections = [];
    const ghosts = tableWrapperRef.current.querySelectorAll('.ghost-node');
    
    ghosts.forEach(ghostNode => {
      const realId = ghostNode.getAttribute('data-real-id');
      const ghostType = ghostNode.getAttribute('data-ghost-type');
      const realNode = tableWrapperRef.current.querySelector(`.real-node[data-id="${realId}"]`);
      
      if (realNode) {
         const containerRect = tableWrapperRef.current.getBoundingClientRect();
         const ghostRect = ghostNode.getBoundingClientRect();
         const realRect = realNode.getBoundingClientRect();
         const trRect = ghostNode.closest('tr').getBoundingClientRect();
         
         const startX = ghostRect.left + (ghostRect.width / 2) - containerRect.left;
         const startY = ghostRect.bottom - containerRect.top;
         const endX = realRect.left + (realRect.width / 2) - containerRect.left;
         const endY = realRect.bottom - containerRect.top;
         const rowBottom = trRect.bottom - containerRect.top - 6; 
         
         newConnections.push({
            id: realId + '-' + ghostType,
            startX,
            startY,
            endX,
            endY,
            rowBottom,
            color: ghostType === 'paga_diferente' ? '#10b981' : '#f59e0b'
         });
      }
    });
    
    setConnections(newConnections);
  };

  useEffect(() => {
    const timeoutId = setTimeout(calculateConnections, 100);
    window.addEventListener('resize', calculateConnections);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateConnections);
    };
  }, [parcelasAgrupadas, mostrarAlocacao]);


  const openModal = (p, defaultMode = null) => {
    const isGhost = p.isGhost;
    const realId = isGhost ? p.id.replace('ghost-paid-', '').replace('ghost-', '') : p.id;
    const isCongelada = p.status === 'Congelada';

    setModalState({
      isOpen: true,
      parcela: p,
      realId: realId,
      mode: defaultMode || (isCongelada ? 'emitir_pontual' : (p.status === 'Paga' ? 'desfazer_pagamento' : 'pagar')),
      data: p.status === 'Paga' ? (p.data_pagamento || '') : new Date().toISOString().split('T')[0],
      nfNumero: p.nf_numero || '',
      boletoVencimento: p.data_vencimento || '',
      valorPontual: p.valor != null ? p.valor.toString() : '',
      valorAjuste: p.valor != null ? p.valor.toString() : '',
      obsAjuste: '',
      forcarAntecipacao: !!p.data_antecipacao,
      dataAntecipacao: p.data_antecipacao || '',
    });
  };

  const handlePagarRapido = async (e, p) => {
    e.stopPropagation();
    const hoje = new Date().toISOString().split('T')[0];
    const { error } = await supabase
      .from('parcelas')
      .update({ status: 'Paga', data_pagamento: hoje })
      .eq('id', p.id);
    if (!error) { refetchAll(); setHoveredParcela(null); }
    else alert('Erro: ' + error.message);
  };

  const handleDesfazerRapido = async (e, p) => {
    e.stopPropagation();
    const { error } = await supabase
      .from('parcelas')
      .update({ status: 'Pendente', data_pagamento: null })
      .eq('id', p.id);
    if (!error) { refetchAll(); setHoveredParcela(null); }
    else alert('Erro: ' + error.message);
  };

  const handleAdiarRapido = async (e, p) => {
    e.stopPropagation();
    const dateObj = new Date(p.data_vencimento + 'T12:00:00');
    dateObj.setMonth(dateObj.getMonth() + 1);
    const novaData = dateObj.toISOString().split('T')[0];
    
    const hist = [...(p.historico_reprogramacao || []), {
      data_antiga: p.data_vencimento,
      data_nova: novaData,
      data_alteracao: new Date().toISOString()
    }];

    const { error } = await supabase
      .from('parcelas')
      .update({ data_vencimento: novaData, historico_reprogramacao: hist })
      .eq('id', p.id);
    if (!error) { refetchAll(); setHoveredParcela(null); }
    else alert('Erro: ' + error.message);
  };

  const handleActionSubmit = async (e) => {
    e.preventDefault();
    const { parcela, realId, mode, data: inputData, nfNumero, boletoVencimento, valorAjuste, obsAjuste, forcarAntecipacao, dataAntecipacao } = modalState;

    const nfUpdate = { nf_numero: nfNumero || null };
    const antecipacaoUpdate = { data_antecipacao: forcarAntecipacao && dataAntecipacao ? dataAntecipacao : null };

    // Valor adjustment: track if value changed from current
    const novoValor = parseFloat(valorAjuste) || parcela.valor;
    const valorChanged = Math.abs(novoValor - parcela.valor) > 0.001;
    const valorUpdate = valorChanged ? { valor: novoValor } : {};
    const buildHistoricoValor = () => {
      if (!valorChanged) return {};
      const hist = [...(parcela.historico_valor || []), {
        data_alteracao: new Date().toISOString(),
        valor_antigo: parcela.valor,
        valor_novo: novoValor,
        obs: obsAjuste.trim() || null,
      }];
      return { historico_valor: hist };
    };

    // Boleto vencimento changed from planned → register as reprogramação
    const boletoChanged = boletoVencimento && boletoVencimento !== parcela.data_vencimento;

    if (mode === 'pagar') {
      const hist = boletoChanged ? [...(parcela.historico_reprogramacao || []), {
        data_antiga: parcela.data_vencimento,
        data_nova: boletoVencimento,
        data_alteracao: new Date().toISOString()
      }] : parcela.historico_reprogramacao;

      const { error } = await supabase
        .from('parcelas')
        .update({
          status: 'Paga',
          data_pagamento: inputData,
          data_vencimento: boletoVencimento || parcela.data_vencimento,
          historico_reprogramacao: hist,
          ...nfUpdate,
          ...valorUpdate,
          ...buildHistoricoValor(),
          ...antecipacaoUpdate,
        })
        .eq('id', realId);

      if (error) alert('Erro: ' + error.message);
      else { setModalState({ isOpen: false, parcela: null }); refetchAll(); }
    }
    else if (mode === 'desfazer_pagamento') {
      if(!window.confirm("Deseja realmente desfazer este pagamento? A parcela voltará a ficar pendente.")) return;
      const { error } = await supabase
        .from('parcelas')
        .update({ status: 'Pendente', data_pagamento: null, data_antecipacao: null, ...nfUpdate })
        .eq('id', realId);

      if (error) alert('Erro: ' + error.message);
      else { setModalState({ isOpen: false, parcela: null }); refetchAll(); }
    }
    else if (mode === 'emitir_pontual') {
      const novoValor = parseFloat(modalState.valorPontual) || parcela.valor;
      const { error } = await supabase.from('parcelas')
        .update({
          status: 'Pendente',
          valor: novoValor,
          data_vencimento: modalState.boletoVencimento || parcela.data_vencimento,
        })
        .eq('id', realId);
      if (error) alert('Erro: ' + error.message);
      else { setModalState({ isOpen: false, parcela: null }); refetchAll(); }
    }
    else if (mode === 'reprogramar') {
      const hist = parcela.historico_reprogramacao || [];
      const newHist = [...hist, {
        data_antiga: parcela.data_vencimento,
        data_nova: inputData,
        data_alteracao: new Date().toISOString()
      }];

      const { error } = await supabase
        .from('parcelas')
        .update({
          status: 'Reprogramada',
          data_vencimento: inputData,
          historico_reprogramacao: newHist,
          ...nfUpdate,
          ...valorUpdate,
          ...buildHistoricoValor(),
          ...antecipacaoUpdate,
        })
        .eq('id', realId);

      if (error) alert('Erro: ' + error.message);
      else { setModalState({ isOpen: false, parcela: null }); refetchAll(); }
    }
    else if (mode === 'ajustar_valor') {
      if (!valorChanged) { alert('Nenhuma alteração de valor detectada.'); return; }
      const { error } = await supabase
        .from('parcelas')
        .update({ ...valorUpdate, ...buildHistoricoValor(), ...antecipacaoUpdate })
        .eq('id', realId);
      if (error) alert('Erro: ' + error.message);
      else { setModalState({ isOpen: false, parcela: null }); refetchAll(); }
    }
  };

  const handleDeleteHistory = async (indexToRemove) => {
    if (!window.confirm("Deseja desfazer esta reprogramação?")) return;
    
    const { parcela, realId } = modalState;
    const hist = [...parcela.historico_reprogramacao];
    
    const itemToRemove = hist[indexToRemove];
    const isLastItem = indexToRemove === hist.length - 1;
    
    let newDataVencimento = parcela.data_vencimento;
    let newStatus = parcela.status;
    
    if (isLastItem) {
       newDataVencimento = itemToRemove.data_antiga;
       if (hist.length === 1) {
          newStatus = 'Pendente'; 
       }
    }
    
    hist.splice(indexToRemove, 1);
    
    const { error } = await supabase
      .from('parcelas')
      .update({
         historico_reprogramacao: hist,
         data_vencimento: newDataVencimento,
         status: newStatus
      })
      .eq('id', realId);
      
    if (error) {
      alert("Erro: " + error.message);
    } else {
      setModalState({ isOpen: false, parcela: null });
      refetchAll();
    }
  };

  const handleDeleteParcela = async () => {
    const { realId, parcela } = modalState;
    const label = parcela?.contratos?.titulo || 'esta parcela';
    if (!window.confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('parcelas').delete().eq('id', realId);
    if (error) alert('Erro: ' + error.message);
    else { setModalState({ isOpen: false, parcela: null }); refetchAll(); }
  };

  const getStatusDisplay = (p) => {
    if (p.status === 'Paga' || p.status === 'Reprogramada' || p.status === 'Congelada') return p.status;

    const dataVenc = new Date(p.data_vencimento);
    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    return dataVenc < hoje ? 'Em atraso' : p.status;
  };

  const formatDayMonth = (dateString) => {
    if (!dateString) return '';
    const [_, month, day] = dateString.split('-');
    return `${day}/${month}`;
  };

  const getVisualStyles = (status, p) => {
    switch(status) {
      case 'Paga':
        return { color: '#10b981', bg: '#ecfdf5', text: `Pago: ${formatDayMonth(p.data_pagamento)}` };
      case 'Em atraso':
        return { color: '#ef4444', bg: '#fef2f2', text: `Venceu: ${formatDayMonth(p.data_vencimento)}` };
      case 'Reprogramada':
        return { color: '#f59e0b', bg: '#fffbeb', text: `Para: ${formatDayMonth(p.data_vencimento)}` };
      case 'Congelada':
        return { color: '#94a3b8', bg: '#f1f5f9', text: `❄ ${formatDayMonth(p.data_vencimento)}` };
      default:
        return { color: '#94a3b8', bg: '#ffffff', text: `Para: ${formatDayMonth(p.data_vencimento)}` };
    }
  };

  const getMesPrestacao = (parcela) => {
    const isMesmoMes = parcela.contratos?.cobranca_mesmo_mes;
    const dataBase = parcela.data_original || parcela.data_vencimento;
    const dateObj = new Date(dataBase);
    
    if (!isMesmoMes) {
      dateObj.setUTCMonth(dateObj.getUTCMonth() - 1);
    }
    
    const mes = dateObj.toLocaleString('pt-BR', { month: 'long', timeZone: 'UTC' });
    const ano = dateObj.getUTCFullYear();
    return `${mes.charAt(0).toUpperCase() + mes.slice(1)}/${ano}`;
  };

  const mesesHeaders = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // Quando há filtro de período (De/Até), esconde do cronograma os meses fora do intervalo
  const mesesVisiveis = [1,2,3,4,5,6,7,8,9,10,11,12].filter(m => {
    if (!dataInicio && !dataFim) return true;
    const primeiroDia = `${anoSelecionado}-${String(m).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anoSelecionado, m, 0).toISOString().split('T')[0];
    if (dataInicio && ultimoDia < dataInicio) return false;
    if (dataFim && primeiroDia > dataFim) return false;
    return true;
  });

  const dataFiltrada = parcelasAgrupadas.filter(g => {
    if (!filtroCliente) return true;
    const nome = (g.contrato?.clientes?.nome || '').toLowerCase();
    const apelido = (g.contrato?.clientes?.apelido || '').toLowerCase();
    const termo = filtroCliente.toLowerCase();
    return nome.includes(termo) || apelido.includes(termo);
  });

  const getDiasAtraso = (dataVencimento) => {
    const venc = new Date(dataVencimento + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.floor((hoje - venc) / 86400000);
  };

  const atrasadasFiltradas = atrasadas.filter(p => {
    if (!filtroCliente) return true;
    const nome = (p.contratos?.clientes?.nome || '').toLowerCase();
    const apelido = (p.contratos?.clientes?.apelido || '').toLowerCase();
    const termo = filtroCliente.toLowerCase();
    return nome.includes(termo) || apelido.includes(termo);
  });

  const totalAtrasado = atrasadasFiltradas.reduce((s, p) => s + Number(p.valor || 0), 0);

  // ─── Comparativo Trimestral (recebimentos pagos, por cliente) ────────────
  const getQuarterKey = (dateStr) => {
    const [y, m] = dateStr.split('-').map(Number);
    return `${y}-Q${Math.ceil(m / 3)}`;
  };
  const quarterLabel = (key) => {
    const [y, q] = key.split('-Q');
    return `T${q}/${y.slice(2)}`;
  };

  const fmtR$ = (v) => `R$ ${Math.round(v || 0).toLocaleString('pt-BR')}`;

  // Variação da célula vs. a coluna (trimestre) anterior visível na tabela
  const getVariacao = (atual, anterior) => {
    if (atual == null || !anterior) return null;
    const pct = ((atual - anterior) / anterior) * 100;
    if (Math.abs(pct) < 0.5) return { dir: 'flat', pct };
    return { dir: pct > 0 ? 'up' : 'down', pct };
  };

  const recebidoFiltrado = recebidoPago.filter(p => {
    if (filtroCliente) {
      const nome = (p.contratos?.clientes?.nome || '').toLowerCase();
      const apelido = (p.contratos?.clientes?.apelido || '').toLowerCase();
      const termo = filtroCliente.toLowerCase();
      if (!nome.includes(termo) && !apelido.includes(termo)) return false;
    }
    if (trimDe && p._data < trimDe) return false;
    if (trimAte && p._data > trimAte) return false;
    return true;
  });

  const trimestres = Array.from(new Set(recebidoFiltrado.map(p => getQuarterKey(p._data)))).sort();

  const clientesTrimestre = {}; // nome do cliente → { trimestreKey: totalRecebido }
  recebidoFiltrado.forEach(p => {
    const nome = p.contratos?.clientes?.apelido || p.contratos?.clientes?.nome || 'Sem cliente';
    const qk = getQuarterKey(p._data);
    if (!clientesTrimestre[nome]) clientesTrimestre[nome] = {};
    clientesTrimestre[nome][qk] = (clientesTrimestre[nome][qk] || 0) + Number(p.valor || 0);
  });
  const clientesOrdenados = Object.keys(clientesTrimestre).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const totaisTrimestre = {}; // trimestreKey → total geral recebido
  recebidoFiltrado.forEach(p => {
    const qk = getQuarterKey(p._data);
    totaisTrimestre[qk] = (totaisTrimestre[qk] || 0) + Number(p.valor || 0);
  });

  // ─── Comparativo Mensal (mesma base de recebidoFiltrado, agrupado por mês) ─
  const getMonthKey = (dateStr) => dateStr.slice(0, 7); // YYYY-MM
  const monthLabel = (key) => {
    const [y, m] = key.split('-');
    const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    const mes = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    return `${mes.charAt(0).toUpperCase() + mes.slice(1)}/${y.slice(2)}`;
  };

  const meses = Array.from(new Set(recebidoFiltrado.map(p => getMonthKey(p._data)))).sort();

  const clientesMes = {}; // nome do cliente → { mesKey: totalRecebido }
  recebidoFiltrado.forEach(p => {
    const nome = p.contratos?.clientes?.apelido || p.contratos?.clientes?.nome || 'Sem cliente';
    const mk = getMonthKey(p._data);
    if (!clientesMes[nome]) clientesMes[nome] = {};
    clientesMes[nome][mk] = (clientesMes[nome][mk] || 0) + Number(p.valor || 0);
  });
  const clientesMesOrdenados = Object.keys(clientesMes).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const totaisMes = {}; // mesKey → total geral recebido
  recebidoFiltrado.forEach(p => {
    const mk = getMonthKey(p._data);
    totaisMes[mk] = (totaisMes[mk] || 0) + Number(p.valor || 0);
  });

  const isPivotView = viewMode === 'atrasadas' || viewMode === 'trimestral' || viewMode === 'mensal';

  return (
    <section className="content-area active">
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
        <h2 style={{marginRight: '16px', color: 'var(--secondary)', fontSize: '18px'}}>Cronograma de Parcelas</h2>
        <div className="btn-group" style={{ display: 'flex', marginRight: '16px' }}>
          <button
            className={`btn ${viewMode === 'cronograma' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '6px 0 0 6px', borderRight: 'none', padding: '6px 12px', fontSize: '14px' }}
            onClick={() => setViewMode('cronograma')}
          >
            Cronograma
          </button>
          <button
            className={`btn ${viewMode === 'tabela' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '0', borderRight: 'none', padding: '6px 12px', fontSize: '14px' }}
            onClick={() => setViewMode('tabela')}
          >
            Tabela
          </button>
          <button
            className={`btn ${viewMode === 'atrasadas' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '0', borderRight: 'none', padding: '6px 12px', fontSize: '14px' }}
            onClick={() => setViewMode('atrasadas')}
          >
            Atrasadas
            {atrasadasCount > 0 && (
              <span style={{
                marginLeft: '6px', background: viewMode === 'atrasadas' ? 'rgba(255,255,255,0.25)' : '#ef4444',
                color: '#fff', borderRadius: '10px', fontSize: '10px', fontWeight: 700, padding: '1px 6px',
              }}>
                {atrasadasCount}
              </span>
            )}
          </button>
          <button
            className={`btn ${viewMode === 'trimestral' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '0', borderRight: 'none', padding: '6px 12px', fontSize: '14px' }}
            onClick={() => setViewMode('trimestral')}
          >
            Trimestral
          </button>
          <button
            className={`btn ${viewMode === 'mensal' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '0 6px 6px 0', padding: '6px 12px', fontSize: '14px' }}
            onClick={() => setViewMode('mensal')}
          >
            Mensal
          </button>
        </div>

        <button
          className={`btn ${mostrarAlocacao ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '14px', padding: '6px 12px' }}
          onClick={() => setMostrarAlocacao(!mostrarAlocacao)}
        >
          {mostrarAlocacao ? 'Omitir Alocação' : 'Mostrar Alocação'}
        </button>

        {!isPivotView && (
          <button
            className="btn btn-secondary"
            style={{ fontSize: '14px', padding: '6px 12px' }}
            onClick={() => {
              const params = new URLSearchParams();
              if (dataInicio) params.set('de', dataInicio);
              if (dataFim) params.set('ate', dataFim);
              if (filtroCliente) params.set('cliente', filtroCliente);
              if (mostrarAlocacao) params.set('alocacao', '1');
              window.open(`/relatorio/parcelas?${params.toString()}`, '_blank');
            }}
          >
            🖨 Imprimir
          </button>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Filtrar cliente..."
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            style={{ width: '150px' }}
          />
          {!isPivotView && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>De:</span>
              <input type="date" className="form-control" style={{ width: '120px', padding: '2px 4px', fontSize: '12px' }} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Até:</span>
              <input type="date" className="form-control" style={{ width: '120px', padding: '2px 4px', fontSize: '12px' }} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              {(dataInicio || dataFim || filtroCliente) && (
                <button
                  className="btn btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => { setDataInicio(''); setDataFim(''); setFiltroCliente(''); }}
                >
                  Limpar
                </button>
              )}
            </div>
          )}
        </div>
        {!isPivotView && (
          <>
            <label style={{fontWeight: 600, color: 'var(--secondary)', marginLeft: '16px'}}>Ano Base:</label>
            <select
              className="form-control"
              style={{ width: '120px' }}
              value={anoSelecionado}
              onChange={(e) => setAnoSelecionado(parseInt(e.target.value, 10))}
            >
              {(anosDisponiveis.length > 0 ? anosDisponiveis : [currentYear - 1, currentYear, currentYear, currentYear + 1, currentYear + 2]).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {viewMode === 'atrasadas' ? (
        <div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' }}>Parcelas em atraso</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>{atrasadasFiltradas.length}</div>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' }}>Total em atraso</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>R$ {totalAtrasado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div className="table-container" style={{ overflowX: 'auto', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--secondary)' }}>Cliente / Contrato</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--secondary)' }}>Competência</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--secondary)' }}>Vencimento</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--secondary)' }}>Dias em atraso</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--secondary)' }}>Valor</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--secondary)' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {loadingAtrasadas ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>Carregando...</td></tr>
                ) : atrasadasFiltradas.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>🎉 Nenhuma parcela em atraso.</td></tr>
                ) : (
                  atrasadasFiltradas.map(p => {
                    const dias = getDiasAtraso(p.data_vencimento);
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover-row">
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--secondary)' }}>{p.contratos?.clientes?.apelido || p.contratos?.clientes?.nome}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.contratos?.titulo}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{getMesPrestacao(p)}</td>
                        <td style={{ padding: '12px 16px' }}>{new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                            {dias} {dias === 1 ? 'dia' : 'dias'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handlePagarRapido({ stopPropagation: () => {} }, p)}>Pagar</button>
                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => openModal(p)}>Editar</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'trimestral' ? (
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', backgroundColor: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', width: 'fit-content' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Período:</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>De:</span>
            <input type="date" className="form-control" style={{ width: '130px', padding: '2px 4px', fontSize: '12px' }} value={trimDe} onChange={(e) => setTrimDe(e.target.value)} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Até:</span>
            <input type="date" className="form-control" style={{ width: '130px', padding: '2px 4px', fontSize: '12px' }} value={trimAte} onChange={(e) => setTrimAte(e.target.value)} />
            {(trimDe || trimAte) && (
              <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => { setTrimDe(''); setTrimAte(''); }}>Limpar</button>
            )}
            <button
              className="btn btn-secondary"
              style={{ fontSize: '13px', padding: '4px 12px', marginLeft: '8px' }}
              onClick={() => {
                const params = new URLSearchParams();
                if (trimDe) params.set('de', trimDe);
                if (trimAte) params.set('ate', trimAte);
                if (filtroCliente) params.set('cliente', filtroCliente);
                window.open(`/relatorio/trimestral?${params.toString()}`, '_blank');
              }}
            >
              🖨 Imprimir
            </button>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '12px 20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#065f46', textTransform: 'uppercase' }}>Total recebido no período</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>
                {fmtR$(Object.values(totaisTrimestre).reduce((s, v) => s + v, 0))}
              </div>
            </div>
            {trimestres.length >= 2 && (() => {
              const atual = totaisTrimestre[trimestres[trimestres.length - 1]] || 0;
              const anterior = totaisTrimestre[trimestres[trimestres.length - 2]] || 0;
              const variacao = anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
              const subiu = variacao != null && variacao >= 0;
              return (
                <div style={{ background: subiu ? '#ecfdf5' : '#fef2f2', border: `1px solid ${subiu ? '#a7f3d0' : '#fecaca'}`, borderRadius: '8px', padding: '12px 20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: subiu ? '#065f46' : '#991b1b', textTransform: 'uppercase' }}>
                    {quarterLabel(trimestres[trimestres.length - 1])} vs {quarterLabel(trimestres[trimestres.length - 2])}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: subiu ? '#059669' : '#dc2626' }}>
                    {variacao == null ? '—' : `${subiu ? '▲' : '▼'} ${Math.abs(variacao).toFixed(1)}%`}
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="table-container" style={{ overflowX: 'auto', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--secondary)', position: 'sticky', left: 0, backgroundColor: '#f8fafc' }}>Cliente</th>
                  {trimestres.map(qk => (
                    <th key={qk} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--secondary)', whiteSpace: 'nowrap' }}>{quarterLabel(qk)}</th>
                  ))}
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--secondary)', borderLeft: '2px solid var(--border)', whiteSpace: 'nowrap' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {loadingTrimestral ? (
                  <tr><td colSpan={trimestres.length + 2} style={{ textAlign: 'center', padding: '40px' }}>Carregando...</td></tr>
                ) : clientesOrdenados.length === 0 ? (
                  <tr><td colSpan={trimestres.length + 2} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Nenhum recebimento encontrado.</td></tr>
                ) : (
                  clientesOrdenados.map(nome => {
                    const porTrimestre = clientesTrimestre[nome];
                    const totalCliente = Object.values(porTrimestre).reduce((s, v) => s + v, 0);
                    return (
                      <tr key={nome} style={{ borderBottom: '1px solid var(--border)' }} className="hover-row">
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--secondary)', position: 'sticky', left: 0, backgroundColor: '#fff', whiteSpace: 'nowrap' }}>{nome}</td>
                        {trimestres.map((qk, idx) => {
                          const valor = porTrimestre[qk];
                          const anteriorQk = idx > 0 ? trimestres[idx - 1] : null;
                          const v = anteriorQk ? getVariacao(valor, porTrimestre[anteriorQk]) : null;
                          return (
                            <td key={qk} style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {valor != null ? (
                                <>
                                  <div>{fmtR$(valor)}</div>
                                  {v && v.dir !== 'flat' && (
                                    <div style={{ fontSize: '10px', fontWeight: 700, color: v.dir === 'up' ? '#059669' : '#dc2626' }}>
                                      {v.dir === 'up' ? '▲' : '▼'} {Math.abs(v.pct).toFixed(0)}%
                                    </div>
                                  )}
                                </>
                              ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                          );
                        })}
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, borderLeft: '2px solid var(--border)', whiteSpace: 'nowrap' }}>
                          {fmtR$(totalCliente)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {clientesOrdenados.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: '#0f172a' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#fff', position: 'sticky', left: 0, backgroundColor: '#0f172a', whiteSpace: 'nowrap' }}>TOTAL</td>
                    {trimestres.map((qk, idx) => {
                      const valor = totaisTrimestre[qk] || 0;
                      const anteriorQk = idx > 0 ? trimestres[idx - 1] : null;
                      const v = anteriorQk ? getVariacao(valor, totaisTrimestre[anteriorQk]) : null;
                      return (
                        <td key={qk} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                          <div>{fmtR$(valor)}</div>
                          {v && v.dir !== 'flat' && (
                            <div style={{ fontSize: '10px', fontWeight: 700, color: v.dir === 'up' ? '#4ade80' : '#f87171' }}>
                              {v.dir === 'up' ? '▲' : '▼'} {Math.abs(v.pct).toFixed(0)}%
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#fff', borderLeft: '2px solid #334155', whiteSpace: 'nowrap' }}>
                      {fmtR$(Object.values(totaisTrimestre).reduce((s, v) => s + v, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : viewMode === 'mensal' ? (
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', backgroundColor: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', width: 'fit-content' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Período:</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>De:</span>
            <input type="date" className="form-control" style={{ width: '130px', padding: '2px 4px', fontSize: '12px' }} value={trimDe} onChange={(e) => setTrimDe(e.target.value)} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Até:</span>
            <input type="date" className="form-control" style={{ width: '130px', padding: '2px 4px', fontSize: '12px' }} value={trimAte} onChange={(e) => setTrimAte(e.target.value)} />
            {(trimDe || trimAte) && (
              <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => { setTrimDe(''); setTrimAte(''); }}>Limpar</button>
            )}
            <button
              className="btn btn-secondary"
              style={{ fontSize: '13px', padding: '4px 12px', marginLeft: '8px' }}
              onClick={() => {
                const params = new URLSearchParams();
                if (trimDe) params.set('de', trimDe);
                if (trimAte) params.set('ate', trimAte);
                if (filtroCliente) params.set('cliente', filtroCliente);
                window.open(`/relatorio/mensal?${params.toString()}`, '_blank');
              }}
            >
              🖨 Imprimir
            </button>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '12px 20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#065f46', textTransform: 'uppercase' }}>Total recebido no período</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>
                {fmtR$(Object.values(totaisMes).reduce((s, v) => s + v, 0))}
              </div>
            </div>
            {meses.length >= 2 && (() => {
              const atual = totaisMes[meses[meses.length - 1]] || 0;
              const anterior = totaisMes[meses[meses.length - 2]] || 0;
              const variacao = anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
              const subiu = variacao != null && variacao >= 0;
              return (
                <div style={{ background: subiu ? '#ecfdf5' : '#fef2f2', border: `1px solid ${subiu ? '#a7f3d0' : '#fecaca'}`, borderRadius: '8px', padding: '12px 20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: subiu ? '#065f46' : '#991b1b', textTransform: 'uppercase' }}>
                    {monthLabel(meses[meses.length - 1])} vs {monthLabel(meses[meses.length - 2])}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: subiu ? '#059669' : '#dc2626' }}>
                    {variacao == null ? '—' : `${subiu ? '▲' : '▼'} ${Math.abs(variacao).toFixed(1)}%`}
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="table-container" style={{ overflowX: 'auto', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--secondary)', position: 'sticky', left: 0, backgroundColor: '#f8fafc' }}>Cliente</th>
                  {meses.map(mk => (
                    <th key={mk} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--secondary)', whiteSpace: 'nowrap' }}>{monthLabel(mk)}</th>
                  ))}
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--secondary)', borderLeft: '2px solid var(--border)', whiteSpace: 'nowrap' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {loadingTrimestral ? (
                  <tr><td colSpan={meses.length + 2} style={{ textAlign: 'center', padding: '40px' }}>Carregando...</td></tr>
                ) : clientesMesOrdenados.length === 0 ? (
                  <tr><td colSpan={meses.length + 2} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Nenhum recebimento encontrado.</td></tr>
                ) : (
                  clientesMesOrdenados.map(nome => {
                    const porMes = clientesMes[nome];
                    const totalCliente = Object.values(porMes).reduce((s, v) => s + v, 0);
                    return (
                      <tr key={nome} style={{ borderBottom: '1px solid var(--border)' }} className="hover-row">
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--secondary)', position: 'sticky', left: 0, backgroundColor: '#fff', whiteSpace: 'nowrap' }}>{nome}</td>
                        {meses.map((mk, idx) => {
                          const valor = porMes[mk];
                          const anteriorMk = idx > 0 ? meses[idx - 1] : null;
                          const v = anteriorMk ? getVariacao(valor, porMes[anteriorMk]) : null;
                          return (
                            <td key={mk} style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {valor != null ? (
                                <>
                                  <div>{fmtR$(valor)}</div>
                                  {v && v.dir !== 'flat' && (
                                    <div style={{ fontSize: '10px', fontWeight: 700, color: v.dir === 'up' ? '#059669' : '#dc2626' }}>
                                      {v.dir === 'up' ? '▲' : '▼'} {Math.abs(v.pct).toFixed(0)}%
                                    </div>
                                  )}
                                </>
                              ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                          );
                        })}
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, borderLeft: '2px solid var(--border)', whiteSpace: 'nowrap' }}>
                          {fmtR$(totalCliente)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {clientesMesOrdenados.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: '#0f172a' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#fff', position: 'sticky', left: 0, backgroundColor: '#0f172a', whiteSpace: 'nowrap' }}>TOTAL</td>
                    {meses.map((mk, idx) => {
                      const valor = totaisMes[mk] || 0;
                      const anteriorMk = idx > 0 ? meses[idx - 1] : null;
                      const v = anteriorMk ? getVariacao(valor, totaisMes[anteriorMk]) : null;
                      return (
                        <td key={mk} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                          <div>{fmtR$(valor)}</div>
                          {v && v.dir !== 'flat' && (
                            <div style={{ fontSize: '10px', fontWeight: 700, color: v.dir === 'up' ? '#4ade80' : '#f87171' }}>
                              {v.dir === 'up' ? '▲' : '▼'} {Math.abs(v.pct).toFixed(0)}%
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#fff', borderLeft: '2px solid #334155', whiteSpace: 'nowrap' }}>
                      {fmtR$(Object.values(totaisMes).reduce((s, v) => s + v, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : viewMode === 'tabela' ? (
        <div className="table-container" style={{ overflowX: 'auto', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--secondary)' }}>Cliente / Contrato</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--secondary)' }}>Competência</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--secondary)' }}>Vencimento Orig.</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--secondary)' }}>Vencimento Atual</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--secondary)' }}>Pagamento</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--secondary)' }}>Valor</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--secondary)' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--secondary)' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {dataFiltrada.flatMap(g => 
                [1,2,3,4,5,6,7,8,9,10,11,12].flatMap(m => 
                  g.meses[m].filter(p => !p.isGhost).map(p => {
                    const status = getStatusDisplay(p);
                    const visual = getVisualStyles(status, p);
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s' }} className="hover-row">
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--secondary)' }}>{g.contrato?.clientes?.apelido || g.contrato?.clientes?.nome}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{g.contrato?.titulo}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{getMesPrestacao(p)}</td>
                        <td style={{ padding: '12px 16px' }}>{p.data_original ? new Date(p.data_original + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                        <td style={{ padding: '12px 16px' }}>{new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td style={{ padding: '12px 16px' }}>{p.data_pagamento ? new Date(p.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>R$ {p.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ 
                            padding: '4px 8px', 
                            borderRadius: '12px', 
                            fontSize: '11px', 
                            fontWeight: 600,
                            backgroundColor: visual.bg,
                            color: visual.color,
                            border: `1px solid ${visual.color}33`
                          }}>
                            {status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            {p.status !== 'Paga' && (
                              <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handlePagarRapido({stopPropagation:()=>{}}, p)}>Pagar</button>
                            )}
                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => openModal(p)}>Editar</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-container" style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: '20px' }}>
          <div style={{ position: 'relative', display: 'inline-block', minWidth: '100%' }} ref={tableWrapperRef}>
          
          {/* SVG Overlay */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
            {connections.map(c => {
              const isBackward = c.endX < c.startX;
              const r = 8; 
              
              let pathD = '';
              if (isBackward) {
                pathD = `
                  M ${c.startX} ${c.startY + 2}
                  L ${c.startX} ${c.rowBottom - r}
                  Q ${c.startX} ${c.rowBottom}, ${c.startX - r} ${c.rowBottom}
                  L ${c.endX + r} ${c.rowBottom}
                  Q ${c.endX} ${c.rowBottom}, ${c.endX} ${c.rowBottom - r}
                  L ${c.endX} ${c.endY + 2}
                `;
              } else {
                pathD = `
                  M ${c.startX} ${c.startY + 2}
                  L ${c.startX} ${c.rowBottom - r}
                  Q ${c.startX} ${c.rowBottom}, ${c.startX + r} ${c.rowBottom}
                  L ${c.endX - r} ${c.rowBottom}
                  Q ${c.endX} ${c.rowBottom}, ${c.endX} ${c.rowBottom - r}
                  L ${c.endX} ${c.endY + 2}
                `;
              }
              
              return (
                <path
                  key={c.id}
                  d={pathD.replace(/\s+/g, ' ').trim()}
                  fill="none"
                  stroke={c.color || '#f59e0b'}
                  strokeWidth="2"
                  strokeDasharray="4,4"
                  style={{ opacity: 0.7 }}
                />
              );
            })}
          </svg>

          <table style={{ minWidth: '1200px' }}>
            <thead>
              <tr>
                <th style={{width: '250px', position: 'sticky', left: 0, backgroundColor: '#f8fafc', zIndex: 11}}>Cliente / Contrato</th>
                {mesesVisiveis.map((m) => (
                  <th key={m} style={{textAlign: 'center', minWidth: '100px'}}>{mesesHeaders[m - 1]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={mesesVisiveis.length + 1} style={{textAlign: 'center', padding: '40px'}}>Carregando calendário...</td></tr>
              ) : parcelasAgrupadas.length === 0 ? (
                <tr><td colSpan={mesesVisiveis.length + 1} style={{textAlign: 'center', padding: '40px'}}>Nenhuma parcela encontrada para este ano.</td></tr>
              ) : (
                parcelasAgrupadas.map((group, idx) => (
                  <tr key={idx}>
                    <td style={{position: 'sticky', left: 0, backgroundColor: '#fff', borderRight: '1px solid var(--border)', zIndex: 11}}>
                      <strong style={{color: 'var(--secondary)', display: 'block'}}>{group.contrato?.clientes?.apelido || group.contrato?.clientes?.nome}</strong>
                      <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>{group.contrato?.titulo}</span>
                    </td>
                    {mesesVisiveis.map(month => {
                      // Sort items to put ghosts first, native items, migrated items, and rescheduled items last
                      const sortedItems = [...group.meses[month]].sort((a, b) => {
                        if (a.isGhost && !b.isGhost) return -1;
                        if (!a.isGhost && b.isGhost) return 1;
                        
                        const getMonth = (d) => parseInt(d.split('-')[1], 10);
                        
                        const aIsMigrated = !a.isGhost && a.status === 'Paga' && a.data_pagamento && getMonth(a.data_pagamento) === month && getMonth(a.data_vencimento) !== month;
                        const bIsMigrated = !b.isGhost && b.status === 'Paga' && b.data_pagamento && getMonth(b.data_pagamento) === month && getMonth(b.data_vencimento) !== month;

                        if (!aIsMigrated && bIsMigrated) return -1;
                        if (aIsMigrated && !bIsMigrated) return 1;
                        
                        const aResched = !a.isGhost && a.data_original && a.data_original !== a.data_vencimento;
                        const bResched = !b.isGhost && b.data_original && b.data_original !== b.data_vencimento;
                        
                        if (aResched && !bResched) return 1;
                        if (!aResched && bResched) return -1;
                        
                        return 0;
                      });

                      return (
                        <td key={month} style={{textAlign: 'center', padding: '12px 8px 16px 8px', verticalAlign: 'top', position: 'relative'}}>
                          {sortedItems.length === 0 ? (
                            <span style={{color: 'var(--border)'}}>-</span>
                          ) : (
                            <div style={{display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center'}}>
                              {sortedItems.map(p => {
                                if (p.isGhost) {
                                  const realId = p.id.replace('ghost-paid-', '').replace('ghost-', '');
                                  const isPaidGhost = p.ghostType === 'paga_diferente';
                                  const color = isPaidGhost ? '#10b981' : '#94a3b8';
                                  const text = isPaidGhost ? 'Planejado' : 'Reprogramada';
                                  
                                  return (
                                    <div 
                                      key={p.id} 
                                      className="ghost-node"
                                      data-real-id={realId}
                                      data-ghost-type={p.ghostType}
                                      style={{
                                        width: '100%',
                                        border: `2px dashed ${color}`,
                                        backgroundColor: '#f8fafc',
                                        borderRadius: '4px', 
                                        padding: '4px',
                                        opacity: 0.8,
                                        cursor: 'pointer',
                                        position: 'relative',
                                        zIndex: 1
                                      }}
                                      onClick={() => openModal(p)}
                                    >
                                      <div style={{fontStyle: 'italic', color: color, fontSize: '12px'}}>
                                        <span style={{textDecoration: 'line-through'}}>{p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                      </div>
                                      <div style={{fontSize: '10px', color: color, fontStyle: 'italic'}}>
                                        {text}
                                      </div>
                                    </div>
                                  );
                                }

                                const status = getStatusDisplay(p);
                                const style = getVisualStyles(status, p);
                                const isCongelada = status === 'Congelada';
                                return (
                                  <div
                                    key={p.id}
                                    className="real-node group"
                                    data-id={p.id}
                                    onMouseEnter={() => setHoveredParcela(p.id)}
                                    onMouseLeave={() => setHoveredParcela(null)}
                                    style={{
                                      width: '100%',
                                      border: isCongelada ? '1px dashed #cbd5e1' : '1px solid var(--border)',
                                      borderLeft: `3px solid ${style.color}`,
                                      backgroundColor: style.bg,
                                      borderRadius: '4px',
                                      padding: '4px',
                                      cursor: 'pointer',
                                      opacity: isCongelada ? 0.55 : 1,
                                      boxShadow: isCongelada ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                      position: 'relative',
                                      zIndex: hoveredParcela === p.id ? 10 : 1
                                    }}
                                    onClick={() => openModal(p)}
                                  >
                                    {/* Popover de Ações Rápidas */}
                                    {hoveredParcela === p.id && (
                                      <div 
                                        style={{
                                          position: 'absolute',
                                          bottom: '100%',
                                          left: '50%',
                                          transform: 'translateX(-50%)',
                                          paddingBottom: '8px', // Ponte invisível para não perder o hover
                                          zIndex: 20
                                        }}
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <div style={{
                                          backgroundColor: '#fff',
                                          border: '1px solid var(--border)',
                                          borderRadius: '6px',
                                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                          padding: '4px',
                                          display: 'flex',
                                          gap: '4px',
                                        }}>
                                          {p.status !== 'Paga' && p.status !== 'Congelada' && (
                                            <button 
                                              className="btn btn-primary" 
                                              style={{fontSize: '10px', padding: '2px 8px', minWidth: 'auto', whiteSpace: 'nowrap'}} 
                                              onClick={(e) => handlePagarRapido(e, p)}
                                              title="Pagar Hoje"
                                            >
                                              Pagar Hoje
                                            </button>
                                          )}
                                          {p.status !== 'Paga' && p.status !== 'Congelada' && (
                                            <button 
                                              className="btn btn-secondary" 
                                              style={{fontSize: '10px', padding: '2px 8px', minWidth: 'auto', whiteSpace: 'nowrap'}} 
                                              onClick={(e) => handleAdiarRapido(e, p)}
                                              title="Adiar para o mês seguinte"
                                            >
                                              +1 Mês
                                            </button>
                                          )}
                                          {p.status === 'Paga' && (
                                            <button 
                                              className="btn btn-secondary" 
                                              style={{fontSize: '10px', padding: '2px 8px', minWidth: 'auto', whiteSpace: 'nowrap', color: 'var(--danger)'}} 
                                              onClick={(e) => handleDesfazerRapido(e, p)}
                                            >
                                              Desfazer
                                            </button>
                                          )}
                                          <button 
                                            className="btn btn-secondary" 
                                            style={{fontSize: '10px', padding: '2px 8px', minWidth: 'auto', whiteSpace: 'nowrap'}} 
                                            onClick={(e) => { e.stopPropagation(); openModal(p, 'ajustar_valor'); setHoveredParcela(null); }}
                                          >
                                            Detalhes
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                    <div style={{fontWeight: 700, color: isCongelada ? '#94a3b8' : 'var(--secondary)', fontSize: '12px'}}>
                                      {p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </div>
                                    <div style={{fontWeight: 600, color: style.color, fontSize: '10px'}}>
                                      {style.text}
                                    </div>
                                    {mostrarAlocacao && getActiveAllocations(p).length > 0 && (
                                      <div style={{fontSize: '9.5px', marginTop: '3px', lineHeight: 1.4, display: 'flex', flexDirection: 'column', gap: '2px'}}>
                                        {getActiveAllocations(p).map(a => {
                                          const inits = formatInitials(a.profiles?.nome);
                                          const color = getPersonColor(a.profiles?.nome || inits);
                                          return (
                                            <span key={a.id} style={{backgroundColor: color.bg, color: color.text, border: `1px solid ${color.border}`, borderRadius: '4px', padding: '1px 5px', fontWeight: 600}}>
                                              {inits} {a.percentual}%
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
            {parcelasAgrupadas.length > 0 && !loading && (
              <tfoot>
                {/* LINHA TOTAL PROJETADO */}
                <tr style={{backgroundColor: '#f8fafc', fontWeight: 'bold'}}>
                  <td style={{position: 'sticky', left: 0, backgroundColor: '#f8fafc', borderRight: '1px solid var(--border)', zIndex: 11, textAlign: 'right', paddingRight: '16px'}}>
                    <span style={{color: 'var(--secondary)'}}>Total Projetado:</span>
                    <div style={{fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'normal'}}>(Realizado + Pendentes)</div>
                  </td>
                  {mesesVisiveis.map(month => {
                    const projetadoNodes = [];
                    parcelasAgrupadas.forEach(group => {
                      group.meses[month].forEach(p => {
                        if (!p.isGhost && p.status !== 'Congelada') projetadoNodes.push(p);
                      });
                    });

                    const total = projetadoNodes.reduce((sum, p) => sum + Number(p.valor), 0);
                    
                    const personTotals = {};
                    let sumAllocated = 0;
                    if (mostrarAlocacao && total > 0) {
                      projetadoNodes.forEach(p => {
                        const allocs = getActiveAllocations(p);
                        allocs.forEach(a => {
                          const val = (Number(p.valor) * Number(a.percentual)) / 100;
                          const inits = formatInitials(a.profiles?.nome);
                          if (!personTotals[inits]) personTotals[inits] = 0;
                          personTotals[inits] += val;
                          sumAllocated += val;
                        });
                      });
                    }
                    const notAllocated = total - sumAllocated;

                    return (
                      <td key={month} style={{textAlign: 'center', padding: '16px 8px', color: 'var(--secondary)', borderTop: '2px solid var(--border)', verticalAlign: 'top'}}>
                        <div style={{fontWeight: 'bold'}}>
                          {total > 0 ? total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                        </div>
                        {mostrarAlocacao && total > 0 && (
                          <div style={{marginTop: '8px', fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center', borderTop: '1px dashed var(--border)', paddingTop: '6px'}}>
                            {Object.entries(personTotals).sort((a,b) => b[1] - a[1]).map(([inits, val]) => {
                              const color = getPersonColor(inits);
                              return (
                                <span key={inits} style={{fontWeight: 600, backgroundColor: color.bg, color: color.text, border: `1px solid ${color.border}`, borderRadius: '4px', padding: '2px 6px', fontSize: '10px', width: '100%', textAlign: 'center'}}>
                                  {inits}: {val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span style={{fontStyle: 'italic', fontWeight: 'normal', opacity: 0.8}}>({((val / total) * 100).toFixed(0)}%)</span>
                                </span>
                              );
                            })}
                            {notAllocated > 0.05 && (
                              <span key="na" style={{fontWeight: 600, backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', width: '100%', textAlign: 'center'}}>
                                N/A: {notAllocated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span style={{fontStyle: 'italic', fontWeight: 'normal'}}>({((notAllocated / total) * 100).toFixed(0)}%)</span>
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* LINHA TOTAL RECEBIDO */}
                <tr style={{backgroundColor: '#ecfdf5', fontWeight: 'bold'}}>
                  <td style={{position: 'sticky', left: 0, backgroundColor: '#ecfdf5', borderRight: '1px solid #a7f3d0', borderBottom: '1px solid #a7f3d0', zIndex: 11, textAlign: 'right', paddingRight: '16px'}}>
                    <span style={{color: '#047857'}}>Total Recebido:</span>
                    <div style={{fontSize: '10px', color: '#059669', fontWeight: 'normal'}}>(Pagas Neste Mês)</div>
                  </td>
                  {mesesVisiveis.map(month => {
                    const recebidoNodes = [];
                    parcelasAgrupadas.forEach(group => {
                      group.meses[month].forEach(p => {
                        if (!p.isGhost && p.status === 'Paga') recebidoNodes.push(p);
                      });
                    });

                    const total = recebidoNodes.reduce((sum, p) => sum + Number(p.valor), 0);
                    
                    const personTotals = {};
                    let sumAllocated = 0;
                    if (mostrarAlocacao && total > 0) {
                      recebidoNodes.forEach(p => {
                        const allocs = getActiveAllocations(p);
                        allocs.forEach(a => {
                          const val = (Number(p.valor) * Number(a.percentual)) / 100;
                          const inits = formatInitials(a.profiles?.nome);
                          if (!personTotals[inits]) personTotals[inits] = 0;
                          personTotals[inits] += val;
                          sumAllocated += val;
                        });
                      });
                    }
                    const notAllocated = total - sumAllocated;

                    return (
                      <td key={month} style={{textAlign: 'center', padding: '16px 8px', color: '#047857', borderTop: '2px solid #a7f3d0', borderBottom: '1px solid #a7f3d0', verticalAlign: 'top'}}>
                        <div style={{fontWeight: 'bold'}}>
                          {total > 0 ? total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                        </div>
                        {mostrarAlocacao && total > 0 && (
                          <div style={{marginTop: '8px', fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center', borderTop: '1px dashed #a7f3d0', paddingTop: '6px'}}>
                            {Object.entries(personTotals).sort((a,b) => b[1] - a[1]).map(([inits, val]) => {
                              const color = getPersonColor(inits);
                              return (
                                <span key={inits} style={{fontWeight: 600, backgroundColor: color.bg, color: color.text, border: `1px solid ${color.border}`, borderRadius: '4px', padding: '2px 6px', fontSize: '10px', width: '100%', textAlign: 'center'}}>
                                  {inits}: {val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span style={{fontStyle: 'italic', fontWeight: 'normal', opacity: 0.8}}>({((val / total) * 100).toFixed(0)}%)</span>
                                </span>
                              );
                            })}
                            {notAllocated > 0.05 && (
                              <span key="na" style={{fontWeight: 600, backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', width: '100%', textAlign: 'center'}}>
                                N/A: {notAllocated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span style={{fontStyle: 'italic', fontWeight: 'normal'}}>({((notAllocated / total) * 100).toFixed(0)}%)</span>
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )}

    {/* Action Modal */}
      <div className={`modal-overlay ${modalState.isOpen ? 'active' : ''}`}>
        <div className="modal" style={{maxWidth: '400px'}}>
          <div className="modal-header">
            <h2>{modalState.mode === 'emitir_pontual' ? '❄ Emitir Parcela Pontualmente' : 'Gerenciar Parcela'}</h2>
            <button className="close-modal" onClick={() => setModalState({isOpen: false, parcela: null})}>&times;</button>
          </div>
          <div className="modal-body">
            {modalState.parcela && (
              <form id="form-action" onSubmit={handleActionSubmit}>
                <div style={{marginBottom: '20px', padding: '12px', backgroundColor: 'var(--bg-dark)', borderRadius: '8px'}}>
                  <p style={{margin: 0, fontSize: '14px', color: 'var(--text-main)'}}>
                    <strong>Valor padrão:</strong> R$ {modalState.parcela.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                  </p>
                  <p style={{margin: '4px 0 0 0', fontSize: '13px', color: 'var(--secondary)', fontStyle: 'italic'}}>
                    <strong>Competência:</strong> {getMesPrestacao(modalState.parcela)}
                  </p>
                </div>

                {modalState.mode === 'emitir_pontual' ? (
                  <>
                    <div style={{marginBottom: '16px', padding: '10px 14px', backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '8px', fontSize: '12px', color: '#0369a1', lineHeight: 1.5}}>
                      O contrato permanece congelado. Apenas esta parcela será reativada como Pendente.
                    </div>
                    <div className="form-group">
                      <label>Valor da emissão (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={modalState.valorPontual}
                        onChange={e => setModalState({ ...modalState, valorPontual: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Vencimento</label>
                      <input
                        type="date"
                        className="form-control"
                        value={modalState.boletoVencimento}
                        onChange={e => setModalState({ ...modalState, boletoVencimento: e.target.value })}
                        required
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {/* Valor ajuste */}
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Valor da parcela
                        {parseFloat(modalState.valorAjuste) !== modalState.parcela.valor && modalState.valorAjuste !== '' && (
                          <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>⚠ diferente do contrato</span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={modalState.valorAjuste}
                        onChange={e => setModalState({ ...modalState, valorAjuste: e.target.value })}
                      />
                    </div>
                    {parseFloat(modalState.valorAjuste) !== modalState.parcela.valor && modalState.valorAjuste !== '' && (
                      <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Motivo do ajuste
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span>
                        </label>
                        <textarea
                          className="form-control"
                          rows={2}
                          placeholder="Ex: Acordo comercial — desconto pontual conforme alinhado em reunião"
                          value={modalState.obsAjuste}
                          onChange={e => setModalState({ ...modalState, obsAjuste: e.target.value })}
                          style={{ resize: 'vertical', fontSize: '13px' }}
                        />
                      </div>
                    )}

                    {/* NF number */}
                    {modalState.mode !== 'ajustar_valor' && (
                    <div className="form-group">
                      <label>Nº da NF</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Ex: 12345"
                        value={modalState.nfNumero}
                        onChange={e => setModalState({ ...modalState, nfNumero: e.target.value })}
                      />
                    </div>
                    )}

                    {/* Boleto due date confirmation */}
                    {modalState.mode !== 'ajustar_valor' && (
                      <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          Vencimento do Boleto
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                            previsto: {new Date(modalState.parcela.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                          {modalState.boletoVencimento && modalState.boletoVencimento !== modalState.parcela.data_vencimento && (
                            <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>⚠ diferente do previsto</span>
                          )}
                        </label>
                        <input
                          type="date"
                          className="form-control"
                          value={modalState.boletoVencimento}
                          onChange={e => setModalState({ ...modalState, boletoVencimento: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label>Ação Desejada</label>
                      <select
                        className="form-control"
                        value={modalState.mode}
                        onChange={(e) => {
                          const newMode = e.target.value;
                          setModalState({
                            ...modalState,
                            mode: newMode,
                            data: newMode === 'pagar' ? new Date().toISOString().split('T')[0] : modalState.parcela.data_vencimento
                          });
                        }}
                        disabled={modalState.parcela.status === 'Paga'}
                      >
                        {modalState.parcela.status === 'Paga' ? (
                          <option value="desfazer_pagamento">Desfazer Pagamento</option>
                        ) : (
                          <>
                            <option value="pagar">Registrar Pagamento</option>
                            <option value="reprogramar">Reprogramar Vencimento</option>
                            <option value="ajustar_valor">Ajustar Valor Pontual</option>
                          </>
                        )}
                      </select>
                    </div>

                    {modalState.mode !== 'ajustar_valor' && (
                      <div className="form-group">
                        <label>
                          {modalState.mode === 'pagar' ? 'Data do Pagamento' :
                           modalState.mode === 'desfazer_pagamento' ? 'Pago em' : 'Nova Data de Vencimento'}
                        </label>
                        <input
                          type="date"
                          className="form-control"
                          value={modalState.data}
                          onChange={(e) => setModalState({...modalState, data: e.target.value})}
                          required
                          disabled={modalState.mode === 'desfazer_pagamento'}
                        />
                      </div>
                    )}

                    {(modalState.mode === 'pagar' || modalState.mode === 'desfazer_pagamento') && (
                      <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={modalState.forcarAntecipacao}
                            onChange={(e) => setModalState({
                              ...modalState,
                              forcarAntecipacao: e.target.checked,
                              dataAntecipacao: e.target.checked ? (modalState.dataAntecipacao || modalState.data) : '',
                            })}
                          />
                          Forçar antecipação
                        </label>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                          Considera outra data nas análises de recebimento (cronograma, trimestral, mensal, variável), sem alterar a data real do pagamento.
                        </span>
                        {modalState.forcarAntecipacao && (
                          <input
                            type="date"
                            className="form-control"
                            style={{ marginTop: '8px' }}
                            value={modalState.dataAntecipacao}
                            onChange={(e) => setModalState({ ...modalState, dataAntecipacao: e.target.value })}
                            required
                          />
                        )}
                      </div>
                    )}

                    {modalState.parcela.historico_reprogramacao && modalState.parcela.historico_reprogramacao.length > 0 && (
                      <div style={{marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px'}}>
                        <h4 style={{fontSize: '13px', color: 'var(--secondary)', marginBottom: '12px'}}>Histórico de Reprogramação</h4>
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                          <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                            <span style={{display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--border)', marginRight: '8px'}}></span>
                            Vencimento Original: <strong>{new Date(modalState.parcela.data_original).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong>
                          </div>
                          <div style={{marginLeft: '3px', borderLeft: '2px solid var(--border)', paddingLeft: '11px', marginTop: '4px', marginBottom: '4px'}}>
                            {modalState.parcela.historico_reprogramacao.map((h, i) => (
                              <div key={i} style={{fontSize: '12px', color: 'var(--text-main)', marginBottom: '8px', position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                <div>
                                  <span style={{position: 'absolute', left: '-16px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--warning)'}}></span>
                                  Em {new Date(h.data_alteracao).toLocaleDateString('pt-BR')} foi p/: <strong>{new Date(h.data_nova).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteHistory(i)}
                                  style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0 4px', lineHeight: 1}}
                                  title="Remover esta reprogramação"
                                >
                                  &times;
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </form>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModalState({isOpen: false, parcela: null})}>Cancelar</button>
            <button
              type="button"
              onClick={handleDeleteParcela}
              style={{ marginRight: 'auto', background: 'none', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer' }}
            >
              Excluir parcela
            </button>
            <button type="submit" form="form-action" className="btn btn-primary">
              {modalState.mode === 'emitir_pontual' ? 'Emitir Parcela' : modalState.mode === 'ajustar_valor' ? 'Salvar Valor' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
