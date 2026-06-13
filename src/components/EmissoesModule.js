"use client";
// v1.1 - 2026-05-15 11:16

import { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '@/lib/supabase';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const FOOTER_COBRANCA = `\n\nO boleto já emitido permanece válido por até 30 dias após o vencimento original. Após esse prazo, utilize um dos meios abaixo:\nPix: financeiro@newmark.com.br\nBanco Inter | Agência: 001 | Conta: 23970426-6`;

export default function EmissoesModule() {
  const today = new Date();
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [ano, setAno] = useState(today.getFullYear());
  const [incluirAtrasadas, setIncluirAtrasadas] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('pendentes');
  const [parcelas, setParcelas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Individual modal state
  const [modal, setModal] = useState({ open: false, parcela: null });
  const [formNF, setFormNF] = useState({ numero: '', file: null });
  const [formBoleto, setFormBoleto] = useState({ vencimento: '', file: null });
  const [parsingNF, setParsingNF] = useState(false);
  const [parsingBoleto, setParsingBoleto] = useState(false);
  const [parseResultNF, setParseResultNF] = useState(null);
  const [parseResultBoleto, setParseResultBoleto] = useState(null);
  const [validacao, setValidacao] = useState(null); // { itens: [...], temAviso: bool }
  const [saving, setSaving] = useState(false);
  const [loadingModal, setLoadingModal] = useState(false);
  const [mensagemPadrao, setMensagemPadrao] = useState(null);
  const [modalRetencao, setModalRetencao] = useState(0);
  const [parcelasAtrasadas, setParcelasAtrasadas] = useState([]);
  const [incluirCobranca, setIncluirCobranca] = useState(false);
  const [cobrancaSelecionadas, setCobrancaSelecionadas] = useState([]);

  // Bulk upload state
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkType, setBulkType] = useState('nf');
  const [bulkProcessando, setBulkProcessando] = useState(false);
  const [bulkResultados, setBulkResultados] = useState([]);
  const [bulkSalvando, setBulkSalvando] = useState(false);
  const [bulkTodasParcelas, setBulkTodasParcelas] = useState([]);

  // Export Lote Inter
  const [exportModal, setExportModal] = useState(false);
  const [exportSelecionadas, setExportSelecionadas] = useState([]);
  const [exportando, setExportando] = useState(false);
  // Ajustar lançamentos state
  const [ajustarModal, setAjustarModal] = useState(false);
  const [ajustarParcelas, setAjustarParcelas] = useState([]);
  const [ajustarDisponiveis, setAjustarDisponiveis] = useState([]);
  const [ajustarLoading, setAjustarLoading] = useState(false);

  // Consolidated email modal state
  const [emailModal, setEmailModal] = useState({ open: false, cliente: null, parcelas: [] });
  const [emailParcelasIncluidas, setEmailParcelasIncluidas] = useState([]);
  const [emailAtrasadas, setEmailAtrasadas] = useState([]);
  const [emailAtrasadasIncluidas, setEmailAtrasadasIncluidas] = useState([]);
  const [emailMensagensContratos, setEmailMensagensContratos] = useState({});
  const [emailMensagem, setEmailMensagem] = useState('');
  const [emailMensagemModificada, setEmailMensagemModificada] = useState(false);
  const [loadingEmailModal, setLoadingEmailModal] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    fetch('/api/emissoes/setup', { method: 'POST' });
  }, []);

  useEffect(() => {
    fetchParcelas();
  }, [mes, ano, incluirAtrasadas]);

  const fetchParcelas = async () => {
    setLoading(true);
    const mesStr = String(mes).padStart(2, '0');
    const start = `${ano}-${mesStr}-01`;
    const daysInMonth = new Date(ano, mes, 0).getDate();
    const end = `${ano}-${mesStr}-${String(daysInMonth).padStart(2, '0')}`;
    const sel = '*, contratos(id, titulo, cliente_id, cobranca_mesmo_mes, congelado, congelado_desde, descricao_nf, clientes(id, nome, apelido, email_cobranca, cnpj))';

    const [{ data: monthData, error: err1 }, { data: overdueData, error: err2 }] = await Promise.all([
      supabase.from('parcelas').select(sel)
        .gte('data_vencimento', start).lte('data_vencimento', end)
        .order('data_vencimento', { ascending: true }),
      incluirAtrasadas
        ? supabase.from('parcelas').select(sel)
            .lt('data_vencimento', start).not('status', 'eq', 'Paga')
            .order('data_vencimento', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (err1) console.error('Erro (mês):', err1.message);
    if (err2) console.error('Erro (atrasadas):', err2.message);

    setParcelas([...(overdueData || []), ...(monthData || [])]);
    setLoading(false);
  };

  // ─── helpers ──────────────────────────────────────────────────────────────

  const getMesPrestacao = (p) => {
    const isMesmoMes = p.contratos?.cobranca_mesmo_mes;
    const dataBase = p.data_original || p.data_vencimento;
    if (!dataBase) return '';
    const d = new Date(dataBase + 'T12:00:00');
    if (!isMesmoMes) d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toLocaleString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
      .replace('. de ', '/').replace('.', '');
  };

  const getMesPrestacaoLong = (p) => {
    const isMesmoMes = p.contratos?.cobranca_mesmo_mes;
    const dataBase = p.data_original || p.data_vencimento;
    if (!dataBase) return '';
    const d = new Date(dataBase + 'T12:00:00');
    if (!isMesmoMes) d.setUTCMonth(d.getUTCMonth() - 1);
    const m = d.toLocaleString('pt-BR', { month: 'long', timeZone: 'UTC' });
    return `${m.charAt(0).toUpperCase() + m.slice(1)} de ${d.getUTCFullYear()}`;
  };

  // Individual modal: uses form state for live preview
  const resolveMessage = (template, p) => {
    if (!template || !p) return null;
    const cliente = p.contratos?.clientes;
    const nfNum = formNF.numero || p.nf_numero || '';
    const boletoNum = formBoleto.numero || p.boleto_numero || '';
    return template
      .replace(/\{cliente\}/gi, cliente?.apelido || cliente?.nome || '')
      .replace(/\{contrato\}/gi, p.contratos?.titulo || '')
      .replace(/\{valor\}/gi, `R$ ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
      .replace(/\{vencimento\}/gi, p.data_vencimento ? new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '')
      .replace(/\{competencia\}/gi, getMesPrestacaoLong(p))
      .replace(/\{nf\}/gi, nfNum || '[nº da NF]')
      .replace(/\{boleto\}/gi, boletoNum || '[nº do boleto]');
  };

  // Consolidated email: uses only stored DB values
  const isParcelaCongelada = (p) => {
    if (!p.contratos?.congelado) return false;
    const desde = p.contratos?.congelado_desde;
    if (!desde) return true;
    
    // Calcula a competência da parcela (usando a mesma lógica de getMesPrestacao)
    const isMesmoMes = p.contratos?.cobranca_mesmo_mes;
    const dataBase = p.data_original || p.data_vencimento;
    if (!dataBase) return false;
    const dComp = new Date(dataBase + 'T12:00:00');
    if (!isMesmoMes) dComp.setUTCMonth(dComp.getUTCMonth() - 1);
    
    const dDesde = new Date(desde + 'T12:00:00');
    // Considera apenas mês/ano para o congelamento
    const compKey = dComp.getUTCFullYear() * 100 + dComp.getUTCMonth();
    const desdeKey = dDesde.getUTCFullYear() * 100 + dDesde.getUTCMonth();
    
    return compKey >= desdeKey;
  };

  const resolveTemplate = (template, p) => {
    if (!template || !p) return null;
    const cliente = p.contratos?.clientes;
    return template
      .replace(/\{cliente\}/gi, cliente?.apelido || cliente?.nome || '')
      .replace(/\{contrato\}/gi, p.contratos?.titulo || '')
      .replace(/\{valor\}/gi, `R$ ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
      .replace(/\{vencimento\}/gi, p.data_vencimento ? new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '')
      .replace(/\{competencia\}/gi, getMesPrestacaoLong(p))
      .replace(/\{nf\}/gi, p.nf_numero || '[nº da NF]')
      .replace(/\{boleto\}/gi, p.boleto_numero || '[nº do boleto]');
  };

  const isOverdue = (p) => {
    if (p.status === 'Paga') return false;
    if (isParcelaCongelada(p)) return false;
    return new Date(p.data_vencimento + 'T12:00:00') < today;
  };

  const resolveDescricaoNF = (p, numeroParcela, totalParcelas) => {
    const tmpl = p.contratos?.descricao_nf;
    if (!tmpl) return null;
    return tmpl
      .replace(/\[competência\]/gi, getMesPrestacaoLong(p))
      .replace(/\[competencia\]/gi, getMesPrestacaoLong(p))
      .replace(/\[numero_parcela\]/gi, numeroParcela != null ? String(numeroParcela) : '?')
      .replace(/\[total_parcelas\]/gi, totalParcelas != null ? String(totalParcelas) : '?')
      .replace(/\[valor\]/gi, `R$ ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  };

  const getNFStatus = (p) => p.nf_numero
    ? { label: 'Emitida', color: '#10b981', bg: '#ecfdf5' }
    : { label: 'Pendente', color: '#ef4444', bg: '#fef2f2' };

  const getBoletoStatus = (p) => p.boleto_arquivo_url
    ? { label: 'Emitido', color: '#10b981', bg: '#ecfdf5' }
    : { label: 'Pendente', color: '#ef4444', bg: '#fef2f2' };

  // ─── Individual modal ─────────────────────────────────────────────────────

  const openModal = async (p) => {
    setModal({ open: true, parcela: p });
    setFormNF({ numero: p.nf_numero || '', file: null });
    setFormBoleto({ vencimento: p.data_vencimento || '', file: null });
    setIncluirCobranca(false);
    setCobrancaSelecionadas([]);
    setParcelasAtrasadas([]);
    setMensagemPadrao(null);
    setLoadingModal(true);

    const clienteId = p.contratos?.cliente_id;

    const { data: contratoData } = await supabase
      .from('contratos')
      .select('mensagem_padrao, percentual_retencao')
      .eq('id', p.contrato_id)
      .maybeSingle();

    setMensagemPadrao(contratoData?.mensagem_padrao || null);
    setModalRetencao(contratoData?.percentual_retencao || 0);

    if (clienteId) {
      const hojStr = today.toISOString().split('T')[0];
      const { data: clientContratos } = await supabase
        .from('contratos')
        .select('id, titulo')
        .eq('cliente_id', clienteId);

      if (clientContratos && clientContratos.length > 0) {
        const contratoIds = clientContratos.map(c => c.id);
        const { data: atrasadas } = await supabase
          .from('parcelas')
          .select('*, contratos(titulo, cobranca_mesmo_mes)')
          .in('contrato_id', contratoIds)
          .not('status', 'eq', 'Paga')
          .lt('data_vencimento', hojStr)
          .neq('id', p.id)
          .order('data_vencimento', { ascending: true });

        setParcelasAtrasadas(atrasadas || []);
      }
    }

    setLoadingModal(false);
  };

  const closeModal = () => {
    setModal({ open: false, parcela: null });
    setParcelasAtrasadas([]);
    setMensagemPadrao(null);
    setModalRetencao(0);
    setParseResultNF(null);
    setParseResultBoleto(null);
    setValidacao(null);
  };

  const handleToggleCobranca = (val) => {
    setIncluirCobranca(val);
    setCobrancaSelecionadas(val ? parcelasAtrasadas.map(p => p.id) : []);
  };

  const toggleCobrancaItem = (id) => {
    setCobrancaSelecionadas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const p = modal.parcela;
    let nfUrl = p.nf_arquivo_url;
    let boletoUrl = p.boleto_arquivo_url;

    if (formNF.file) {
      const fd = new FormData();
      fd.append('file', formNF.file);
      fd.append('parcelaId', p.id);
      fd.append('tipo', 'nf');
      const res = await fetch('/api/emissoes/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) { alert('Erro no upload da NF: ' + json.error); setSaving(false); return; }
      nfUrl = json.url;
    }

    if (formBoleto.file) {
      const fd = new FormData();
      fd.append('file', formBoleto.file);
      fd.append('parcelaId', p.id);
      fd.append('tipo', 'boleto');
      const res = await fetch('/api/emissoes/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) { alert('Erro no upload do boleto: ' + json.error); setSaving(false); return; }
      boletoUrl = json.url;
    }

    let newStatus = p.status;
    if (formNF.numero && !['NF Emitida', 'Paga'].includes(p.status)) newStatus = 'NF Emitida';
    if (!formNF.numero && p.status === 'NF Emitida') newStatus = 'Pendente';

    const { error } = await supabase.from('parcelas').update({
      nf_numero: formNF.numero || null,
      nf_arquivo_url: nfUrl,
      boleto_arquivo_url: boletoUrl,
      data_vencimento: formBoleto.vencimento || p.data_vencimento,
      status: newStatus,
    }).eq('id', p.id);

    if (error) alert('Erro: ' + error.message);
    else { closeModal(); fetchParcelas(); }
    setSaving(false);
  };

  const parseFile = async (file, tipo) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tipo', tipo);
    const res = await fetch('/api/emissoes/parse', { method: 'POST', body: fd });
    return res.json();
  };

  // ─── Upload em Lote ───────────────────────────────────────────────────────

  const openBulkModal = (tipo = 'nf') => { setBulkType(tipo); setBulkModal(true); setBulkResultados([]); };

  const handleAbrirExportModal = () => {
    // Pegar todas as parcelas "pendentes" ou "atrasadas" 
    const pendentes = parcelasFiltradas.filter(p => p.status !== 'Paga' && !isParcelaCongelada(p));
    setExportSelecionadas(pendentes.map(p => p.id));
    setExportModal(true);
  };

  const handleGerarExportInter = async () => {
    if (!exportSelecionadas.length) {
      alert('Selecione pelo menos uma parcela.');
      return;
    }
    setExportando(true);
    try {
      const res = await fetch('/api/emissoes/export-inter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcela_ids: exportSelecionadas })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro ao gerar arquivo');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cobranca_Lote_Inter_${new Date().getTime()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportModal(false);
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setExportando(false);
    }
  };

  const handleImportarParcelas = async (file) => {
    if (!file) return;
    setImportando(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/emissoes/import-parcelas', { method: 'POST', body: fd });
    const json = await res.json();
    setImportando(false);
    if (json.error) { alert('Erro: ' + json.error); return; }
    alert(`✅ ${json.atualizadas} parcela(s) atualizada(s)!${json.erros?.length ? '\n\nErros:\n' + json.erros.join('\n') : ''}`);
    fetchParcelas();
  };

  const runConferencias = (parsed, parcela, bulkType) => {
    if (!parcela) return { conferencias: [], status: 'confirmar' };
    const confs = [];
    
    // Valor
    const vParsed = parseFloat((parsed.valor || '').replace(/\./g, '').replace(',', '.'));
    const vParc = Number(parcela.valor);
    if (vParsed > 0) {
      confs.push({ label: 'Valor', ok: Math.abs(vParsed - vParc) < 0.01, parsed: vParsed, expected: vParc });
    }

    // Vencimento (Boleto)
    if (bulkType === 'boleto' && parsed.vencimento) {
      confs.push({ label: 'Vencimento', ok: parsed.vencimento === parcela.data_vencimento, parsed: parsed.vencimento, expected: parcela.data_vencimento });
    }

    // NF vs Documento (Boleto)
    if (bulkType === 'boleto' && parsed.numeroDocumento && parcela.nf_numero) {
      const nB = (parsed.numeroDocumento || '').replace(/\D/g, '');
      const nP = (parcela.nf_numero || '').replace(/\D/g, '');
      confs.push({ label: 'Nº NF', ok: nB === nP, parsed: parsed.numeroDocumento, expected: parcela.nf_numero });
    }

    const todasOk = confs.every(c => c.ok);
    return { conferencias: confs, status: todasOk ? 'pronto' : 'confirmar' };
  };

  const handleBulkFileChange = async (files) => {
    if (!files || files.length === 0) return;
    setBulkProcessando(true);
    setBulkResultados([]);

    let query = supabase
      .from('parcelas')
      .select('*, contratos(id, titulo, cliente_id, cobranca_mesmo_mes, clientes(id, nome, apelido, cnpj))')
      .not('status', 'eq', 'Paga');

    if (bulkType === 'nf') {
      query = query.is('nf_numero', null);
    } else {
      query = query.is('boleto_arquivo_url', null);
    }

    const { data: todasParcelas } = await query;

    setBulkTodasParcelas(todasParcelas || []);
    const resultados = [];
    for (const file of Array.from(files)) {
      const parsed = await parseFile(file, bulkType);
      const cnpjDigits = (parsed.cnpj || '').replace(/\D/g, '');

      let parcelasDoCliente = [];
      if (bulkType === 'nf' && cnpjDigits.length >= 8) {
        parcelasDoCliente = (todasParcelas || []).filter(p => {
          const pCnpj = (p.contratos?.clientes?.cnpj || '').replace(/\D/g, '');
          return pCnpj && pCnpj.startsWith(cnpjDigits.slice(0, 8));
        });
      }
      // fallback: nome do cliente ou pagador com scoring por palavras
      const nomeBusca = bulkType === 'nf' ? parsed.cliente : parsed.pagador;
      if (parcelasDoCliente.length === 0 && nomeBusca) {
        const normNome = s => (s || '').toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const STOP = new Set(['ltda','eireli','eireili','epp','mei','soc','com','ltd','dos','das','des','del','sua','cia','spa']);
        const palavras = s => normNome(s).split(' ').filter(w => w.length > 2 && !STOP.has(w));
        const scoreNome = (pdf, dbNome, dbApelido) => {
          const pw = palavras(pdf);
          if (!pw.length) return 0;
          const dw = [...palavras(dbNome), ...palavras(dbApelido)];
          return pw.filter(w => dw.some(d => d.includes(w) || w.includes(d))).length / pw.length;
        };

        const scored = (todasParcelas || [])
          .map(p => ({ p, score: scoreNome(nomeBusca, p.contratos?.clientes?.nome, p.contratos?.clientes?.apelido) }))
          .filter(({ score }) => score >= 0.35)
          .sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          const bestClienteId = scored[0].p.contratos?.clientes?.id;
          parcelasDoCliente = scored.filter(({ p }) => p.contratos?.clientes?.id === bestClienteId).map(({ p }) => p);
        }
      }

      const clienteMatch = parcelasDoCliente[0]?.contratos?.clientes || null;

      // Tenta casar por valor
      const parsedValor = parseFloat((parsed.valor || '').replace(/\./g, '').replace(',', '.'));
      let parcelaSugerida = parsedValor > 0
        ? parcelasDoCliente.find(p => Math.abs(Number(p.valor) - parsedValor) < 0.01)
        : null;

      // Para boleto: casar pelo número do documento (NF)
      if (bulkType === 'boleto' && parsed.numeroDocumento) {
        const matchPorNF = (todasParcelas || []).find(p => p.nf_numero === parsed.numeroDocumento);
        if (matchPorNF) parcelaSugerida = matchPorNF;
      }

      // Fallback: parcela mais próxima por data de vencimento
      if (!parcelaSugerida && parcelasDoCliente.length > 0) {
        parcelaSugerida = [...parcelasDoCliente].sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento))[0];
      }

      resultados.push({
        file,
        filename: file.name,
        parsed,
        clienteMatch,
        parcelasDoCliente,
        parcelaSelecionada: parcelaSugerida || null,
        status: !clienteMatch ? 'nao_encontrado' : !parcelaSugerida ? 'confirmar' : 'pronto',
        salvo: false,
        erro: null,
        conferencias: [],
      });
    }

    // Pós-processamento para adicionar conferências
    const resultadosComConferencias = resultados.map(r => {
      const { conferencias, status } = runConferencias(r.parsed, r.parcelaSelecionada, bulkType);
      return { 
        ...r, 
        conferencias,
        status: (r.status === 'nao_encontrado') ? 'nao_encontrado' : status 
      };
    });

    setBulkResultados(resultadosComConferencias);
    setBulkProcessando(false);
  };

  const handleBulkParcelaChange = (index, parcelaId) => {
    setBulkResultados(prev => prev.map((r, i) => {
      if (i !== index) return r;
      const parcela = r.parcelasDoCliente.find(p => p.id === parcelaId) || null;
      const { conferencias, status } = runConferencias(r.parsed, parcela, bulkType);
      return { ...r, parcelaSelecionada: parcela, conferencias, status };
    }));
  };

  const handleBulkClienteChange = (index, clienteId) => {
    setBulkResultados(prev => prev.map((r, i) => {
      if (i !== index) return r;
      const parcelasDoCliente = bulkTodasParcelas.filter(p => p.contratos?.clientes?.id === clienteId);
      const clienteMatch = parcelasDoCliente[0]?.contratos?.clientes || null;
      const parsedValor = parseFloat((r.parsed.valor || '').replace(/\./g, '').replace(',', '.'));
      let parcelaSugerida = parsedValor > 0
        ? parcelasDoCliente.find(p => Math.abs(Number(p.valor) - parsedValor) < 0.01)
        : null;

      if (bulkType === 'boleto' && r.parsed.numeroDocumento) {
        const matchPorNF = parcelasDoCliente.find(p => p.nf_numero === r.parsed.numeroDocumento);
        if (matchPorNF) parcelaSugerida = matchPorNF;
      }

      // Fallback: parcela mais próxima por data de vencimento
      if (!parcelaSugerida && parcelasDoCliente.length > 0) {
        parcelaSugerida = [...parcelasDoCliente].sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento))[0];
      }

      const { conferencias, status } = runConferencias(r.parsed, parcelaSugerida, bulkType);

      return {
        ...r,
        clienteMatch,
        parcelasDoCliente,
        parcelaSelecionada: parcelaSugerida || null,
        conferencias,
        status: !clienteMatch ? 'nao_encontrado' : status,
      };
    }));
  };

  const handleResolverInconsistencia = async (index, confIndex) => {
    const item = bulkResultados[index];
    const conf = item.conferencias[confIndex];
    if (conf.ok) return;

    if (conf.label === 'Valor') {
      const resp = window.confirm(
        `Divergência de valor para ${item.clienteMatch?.apelido || item.clienteMatch?.nome}!\n\n` +
        `Arquivo: R$ ${conf.parsed?.toLocaleString('pt-BR')}\n` +
        `Sistema: R$ ${conf.expected?.toLocaleString('pt-BR')}\n\n` +
        `Clique em OK se for RETENÇÃO DE IMPOSTO (o sistema aceitará o arquivo sem alterar o valor da parcela).\n\n` +
        `Clique em CANCELAR para escolher ATUALIZAR o valor da parcela no sistema.`
      );

      if (resp) {
        // Opção 1: Retenção
        setBulkResultados(prev => prev.map((r, i) => {
          if (i !== index) return r;
          const novasConfs = r.conferencias.map((c, ci) => ci === confIndex ? { ...c, ok: true, obs: '(Retenção)' } : c);
          const todasOk = novasConfs.every(c => c.ok);
          return { ...r, conferencias: novasConfs, status: todasOk ? 'pronto' : 'confirmar' };
        }));
        return;
      } else {
        // Opção 2: Atualizar valor da parcela
        if (window.confirm(`Deseja ATUALIZAR permanentemente o valor desta parcela no sistema para R$ ${conf.parsed?.toLocaleString('pt-BR')}?`)) {
          const { error } = await supabase.from('parcelas').update({ valor: conf.parsed }).eq('id', item.parcelaSelecionada.id);
          if (error) {
            alert("Erro: " + error.message);
          } else {
            setBulkResultados(prev => prev.map((r, i) => {
              if (i !== index) return r;
              const novaParcela = { ...r.parcelaSelecionada, valor: conf.parsed };
              const { conferencias, status } = runConferencias(r.parsed, novaParcela, bulkType);
              return { ...r, parcelaSelecionada: novaParcela, conferencias, status };
            }));
            fetchData();
          }
        }
        return;
      }
    }

    // Outros casos (Vencimento, Nº NF)
    if (!window.confirm(`Deseja atualizar o campo "${conf.label}" da parcela para "${conf.parsed}"?`)) return;

    const updates = {};
    if (conf.label === 'Vencimento') updates.data_vencimento = conf.parsed;
    if (conf.label === 'Nº NF') updates.nf_numero = conf.parsed;

    const { error } = await supabase
      .from('parcelas')
      .update(updates)
      .eq('id', item.parcelaSelecionada.id);

    if (error) {
      alert("Erro ao atualizar parcela: " + error.message);
    } else {
      setBulkResultados(prev => prev.map((r, i) => {
        if (i !== index) return r;
        const novaParcela = { ...r.parcelaSelecionada, ...updates };
        const { conferencias, status } = runConferencias(r.parsed, novaParcela, bulkType);
        return { ...r, parcelaSelecionada: novaParcela, conferencias, status };
      }));
      fetchData();
    }
  };

  const handleBulkRemove = (index) => {
    setBulkResultados(prev => prev.filter((_, i) => i !== index));
  };

  const handleBulkSalvar = async () => {
    setBulkSalvando(true);
    const prontos = bulkResultados.filter(r => r.status === 'pronto' && r.parcelaSelecionada);
    const novosResultados = [...bulkResultados];

    for (const item of prontos) {
      const idx = novosResultados.indexOf(item);
      try {
        const fd = new FormData();
        fd.append('file', item.file);
        fd.append('parcelaId', item.parcelaSelecionada.id);
        fd.append('tipo', bulkType);
        const res = await fetch('/api/emissoes/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        if (bulkType === 'nf') {
          const novoStatus = ['NF Emitida', 'Paga'].includes(item.parcelaSelecionada.status)
            ? item.parcelaSelecionada.status : 'NF Emitida';
          await supabase.from('parcelas').update({
            nf_numero: item.parsed.numero || null,
            nf_arquivo_url: json.url,
            status: novoStatus,
          }).eq('id', item.parcelaSelecionada.id);
        } else {
          await supabase.from('parcelas').update({
            boleto_numero: item.parsed.numeroDocumento || null,
            boleto_arquivo_url: json.url,
          }).eq('id', item.parcelaSelecionada.id);
        }

        if (item.clienteMatch?.id) {
          await salvarEnderecoCliente(item.parsed, { contratos: { cliente_id: item.clienteMatch.id } });
        }
        novosResultados[idx] = { ...item, salvo: true, status: 'salvo' };
      } catch (e) {
        novosResultados[idx] = { ...item, erro: e.message, status: 'erro' };
      }
      setBulkResultados([...novosResultados]);
    }
    setBulkSalvando(false);
    fetchParcelas();
  };

  // ─── Ajustar Lançamentos ──────────────────────────────────────────────────

  const openAjustarModal = async () => {
    setAjustarModal(true);
    setAjustarLoading(true);
    const sel = 'id, valor, data_vencimento, data_original, status, nf_numero, nf_arquivo_url, contratos(id, titulo, cliente_id, cobranca_mesmo_mes, clientes(id, nome, apelido))';
    const [{ data: lancadas }, { data: disponiveis }] = await Promise.all([
      supabase.from('parcelas').select(sel).not('nf_numero', 'is', null).order('data_vencimento', { ascending: false }).limit(150),
      supabase.from('parcelas').select(sel).is('nf_numero', null).not('status', 'eq', 'Paga'),
    ]);
    setAjustarDisponiveis(disponiveis || []);
    setAjustarParcelas((lancadas || []).map(p => ({ ...p, moverAtivo: false, moverSelecionada: '', salvando: false })));
    setAjustarLoading(false);
  };

  const handleAjustarAtivarMover = (idx) => {
    setAjustarParcelas(prev => prev.map((r, i) => {
      if (i !== idx) return { ...r, moverAtivo: false };
      const clienteId = r.contratos?.clientes?.id;
      const opcoes = ajustarDisponiveis.filter(d => d.contratos?.clientes?.id === clienteId);
      return { ...r, moverAtivo: !r.moverAtivo, moverSelecionada: '', _opcoes: opcoes };
    }));
  };

  const handleAjustarConfirmarMover = async (idx) => {
    const row = ajustarParcelas[idx];
    if (!row.moverSelecionada) return;
    setAjustarParcelas(prev => prev.map((r, i) => i === idx ? { ...r, salvando: true } : r));
    await supabase.from('parcelas').update({ nf_numero: row.nf_numero, nf_arquivo_url: row.nf_arquivo_url, status: 'NF Emitida' }).eq('id', row.moverSelecionada);
    await supabase.from('parcelas').update({ nf_numero: null, nf_arquivo_url: null, status: 'Pendente' }).eq('id', row.id);
    setAjustarParcelas(prev => prev.filter((_, i) => i !== idx));
    setAjustarDisponiveis(prev => prev.filter(d => d.id !== row.moverSelecionada));
    fetchParcelas();
  };

  const handleAjustarRemover = async (idx) => {
    const row = ajustarParcelas[idx];
    setAjustarParcelas(prev => prev.map((r, i) => i === idx ? { ...r, salvando: true } : r));
    await supabase.from('parcelas').update({ nf_numero: null, nf_arquivo_url: null, status: 'Pendente' }).eq('id', row.id);
    setAjustarParcelas(prev => prev.filter((_, i) => i !== idx));
    fetchParcelas();
  };

  // ─── Email ────────────────────────────────────────────────────────────────

  const salvarEnderecoCliente = async (result, parcela) => {
    const clienteId = parcela?.contratos?.cliente_id;
    if (!clienteId || !result.cidade) return;
    const { data: cli } = await supabase.from('clientes').select('cidade').eq('id', clienteId).single();
    if (cli?.cidade) return; // já tem endereço, não sobrescreve
    await supabase.from('clientes').update({
      endereco: result.endereco || null,
      numero_endereco: result.numero || null,
      complemento_endereco: result.complemento || null,
      bairro: result.bairro || null,
      cidade: result.cidade || null,
      estado: result.estado || null,
      cep: result.cep || null,
      telefone: result.telefone || null,
    }).eq('id', clienteId);
  };

  const handleNFFileChange = async (file) => {
    setFormNF(prev => ({ ...prev, file }));
    if (!file) return;
    setParsingNF(true);
    setParseResultNF(null);
    const result = await parseFile(file, 'nf');
    setParsingNF(false);
    if (result.error) { setParseResultNF({ erro: result.error }); return; }
    if (result.numero) setFormNF(prev => ({ ...prev, numero: result.numero }));
    setParseResultNF(result);
    salvarEnderecoCliente(result, modal.parcela);
  };

  const handleBoletoFileChange = async (file) => {
    setFormBoleto(prev => ({ ...prev, file }));
    if (!file) return;
    setParsingBoleto(true);
    setParseResultBoleto(null);
    const result = await parseFile(file, 'boleto');
    setParsingBoleto(false);
    if (result.error) { setParseResultBoleto({ erro: result.error }); return; }
    if (result.vencimento) setFormBoleto(prev => ({ ...prev, vencimento: result.vencimento }));
    setParseResultBoleto(result);
  };

  const cruzarDados = (rNF, rBol, parcela) => {
    const itens = [];
    const normalize = (s) => (s || '').toLowerCase().replace(/[.\-\/\s]+/g, '');

    // 1. Número NFS-e vs Nº Documento boleto
    if (rNF.numero && rBol.numeroDocumento) {
      const ok = normalize(rNF.numero) === normalize(rBol.numeroDocumento);
      itens.push({ label: 'Nº NFS-e × Nº Documento boleto', ok, nf: rNF.numero, boleto: rBol.numeroDocumento });
    } else {
      itens.push({ label: 'Nº NFS-e × Nº Documento boleto', ok: null, nf: rNF.numero, boleto: rBol.numeroDocumento });
    }

    // 2. Nome empresarial vs Pagador
    if (rNF.cliente && rBol.pagador) {
      const ok = normalize(rNF.cliente).includes(normalize(rBol.pagador).substring(0, 8))
        || normalize(rBol.pagador).includes(normalize(rNF.cliente).substring(0, 8));
      itens.push({ label: 'Cliente NF × Pagador boleto', ok, nf: rNF.cliente, boleto: rBol.pagador });
    } else {
      itens.push({ label: 'Cliente NF × Pagador boleto', ok: null, nf: rNF.cliente, boleto: rBol.pagador });
    }

    // 3. Mês da descrição vs competência da parcela
    if (rNF.descricao && parcela) {
      const MESES_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
      const m = rNF.descricao.match(/(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[^\s\/\d\-]*[\s\/\-]?(\d{2,4})/i);
      if (m) {
        const mesDesc = MESES_PT.findIndex(x => rNF.descricao.toLowerCase().includes(x)) + 1;
        const anoDesc = m[1].length === 2 ? 2000 + parseInt(m[1]) : parseInt(m[1]);
        const compParcela = getMesPrestacaoLong(parcela); // "Março de 2026"
        const mesParc = MESES_PT.findIndex(x => compParcela.toLowerCase().includes(x)) + 1;
        const anoParc = parseInt(compParcela.split(' ').pop());
        const ok = mesDesc === mesParc && anoDesc === anoParc;
        itens.push({ label: 'Competência (descrição NF × parcela)', ok, nf: `mês ${mesDesc}/${anoDesc}`, boleto: compParcela });
      } else {
        itens.push({ label: 'Competência (descrição NF × parcela)', ok: null, nf: rNF.descricao?.substring(0, 60), boleto: getMesPrestacaoLong(parcela) });
      }
    }

    // 4. Valor NF vs valor parcela
    if (rNF.valor && parcela) {
      const parseValor = (s) => parseFloat((s || '').replace(/\./g, '').replace(',', '.'));
      const vNF = parseValor(rNF.valor);
      const vParc = Number(parcela.valor);
      const ok = Math.abs(vNF - vParc) < 0.01;
      itens.push({
        label: 'Valor NF × valor parcela',
        ok,
        nf: `R$ ${rNF.valor}`,
        boleto: `R$ ${vParc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      });
    }

    // Valor boleto vs valor NF (se ambos disponíveis), tolerando retenção na fonte
    if (rNF.valor && rBol.valor) {
      const parseValor = (s) => parseFloat((s || '').replace(/\./g, '').replace(',', '.'));
      const vNF = parseValor(rNF.valor);
      const vBol = parseValor(rBol.valor);
      const retencao = modalRetencao || 0;
      if (retencao > 0) {
        const vLiquido = vNF * (1 - retencao / 100);
        const ok = Math.abs(vBol - vLiquido) < 0.02;
        itens.push({
          label: `Valor boleto × líquido NF (${retencao}% retenção)`,
          ok,
          nf: `R$ ${rNF.valor} → líquido R$ ${vLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          boleto: `R$ ${rBol.valor}`,
        });
      } else {
        const ok = Math.abs(vNF - vBol) < 0.01;
        itens.push({ label: 'Valor NF × valor boleto', ok, nf: `R$ ${rNF.valor}`, boleto: `R$ ${rBol.valor}` });
      }
    }

    return { itens, temAviso: itens.some(i => i.ok === false) };
  };

  // Recebe até 2 arquivos, classifica cada um pelo conteúdo e preenche os campos certos
  const handleCombinedUpload = async (files) => {
    if (!files || files.length === 0) return;
    setParsingNF(true);
    setParsingBoleto(true);
    setParseResultNF(null);
    setParseResultBoleto(null);

    const results = await Promise.all(
      Array.from(files).slice(0, 2).map(async (file) => {
        // Parse as both types in parallel and classify by what we find
        const [rNF, rBol] = await Promise.all([
          parseFile(file, 'nf'),
          parseFile(file, 'boleto'),
        ]);
        // Score: NF wins if it has numero; Boleto wins if it has pagador
        const nfScore = (rNF.numero ? 2 : 0) + (rNF.cliente ? 1 : 0) + (rNF.descricao ? 1 : 0);
        const bolScore = (rBol.pagador ? 2 : 0) + (rBol.vencimento ? 1 : 0) + (rBol.numeroDocumento ? 1 : 0);
        return { file, tipo: nfScore >= bolScore ? 'nf' : 'boleto', rNF, rBol };
      })
    );

    // If both scored same type, keep first classification and flip the second
    if (results.length === 2 && results[0].tipo === results[1].tipo) {
      results[1].tipo = results[0].tipo === 'nf' ? 'boleto' : 'nf';
    }

    let finalNF = null, finalBol = null;

    results.forEach(({ file, tipo, rNF, rBol }) => {
      if (tipo === 'nf') {
        setFormNF(prev => ({ ...prev, file, numero: rNF.numero || prev.numero }));
        setParseResultNF(rNF.error ? { erro: rNF.error } : rNF);
        salvarEnderecoCliente(rNF, modal.parcela);
        finalNF = rNF;
      } else {
        setFormBoleto(prev => ({ ...prev, file, vencimento: rBol.vencimento || prev.vencimento }));
        setParseResultBoleto(rBol.error ? { erro: rBol.error } : rBol);
        finalBol = rBol;
      }
    });

    // Cross-validation when both files were processed
    if (finalNF && finalBol && modal.parcela) {
      setValidacao(cruzarDados(finalNF, finalBol, modal.parcela));
    }

    setParsingNF(false);
    setParsingBoleto(false);
  };

  const handleRemoverArquivo = async (tipo, pArg = null) => {
    const parcela = pArg || modal.parcela;
    if (!parcela) return;
    const label = tipo === 'nf' ? 'a Nota Fiscal' : 'o Boleto';
    if (!window.confirm(`Tem certeza que deseja remover ${label} desta parcela?`)) return;

    const updates = tipo === 'nf' 
      ? { nf_arquivo_url: null }
      : { boleto_arquivo_url: null };

    const { error } = await supabase
      .from('parcelas')
      .update(updates)
      .eq('id', parcela.id);

    if (error) {
      alert("Erro ao remover: " + error.message);
    } else {
      if (modal.parcela?.id === parcela.id) {
        setModal(prev => ({
          ...prev,
          parcela: { ...prev.parcela, ...updates }
        }));
      }
      fetchData();
    }
  };

  // ─── Consolidated email modal ─────────────────────────────────────────────

  const openEmailModal = async (grupo) => {
    const { cliente, parcelas: gParcelas } = grupo;
    setEmailModal({ open: true, cliente, parcelas: gParcelas });
    // Pre-select parcelas that have at least an NF number or file
    setEmailParcelasIncluidas(gParcelas.filter(p => p.nf_numero || p.nf_arquivo_url).map(p => p.id));
    setEmailAtrasadas([]);
    setEmailAtrasadasIncluidas([]);
    setEmailMensagensContratos({});
    setEmailMensagem('');
    setEmailMensagemModificada(false);
    setLoadingEmailModal(true);

    const clienteId = cliente?.id;
    const groupIds = new Set(gParcelas.map(p => p.id));

    const [{ data: clientContratos }, { data: atrasadasRaw }] = await Promise.all([
      supabase.from('contratos').select('id, mensagem_padrao').eq('cliente_id', clienteId),
      supabase.from('parcelas')
        .select('*, contratos(id, titulo, cobranca_mesmo_mes)')
        .in('contrato_id', gParcelas.map(p => p.contrato_id))
        .not('status', 'eq', 'Paga')
        .lt('data_vencimento', today.toISOString().split('T')[0])
        .order('data_vencimento', { ascending: true }),
    ]);

    const mensagens = {};
    (clientContratos || []).forEach(c => { mensagens[c.id] = c.mensagem_padrao || null; });
    setEmailMensagensContratos(mensagens);

    // Exclude parcelas that are already in the group (already shown in period section)
    const atrasadas = (atrasadasRaw || []).filter(p => !groupIds.has(p.id));
    setEmailAtrasadas(atrasadas);
    setEmailAtrasadasIncluidas(atrasadas.map(p => p.id)); // Auto-seleciona todas as atrasadas

    setLoadingEmailModal(false);
  };

  const closeEmailModal = () => {
    setEmailModal({ open: false, cliente: null, parcelas: [] });
    setEmailAtrasadas([]);
    setEmailMensagensContratos({});
  };

  const toggleEmailParcela = (id) => {
    setEmailParcelasIncluidas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setEmailMensagemModificada(false);
  };

  const toggleEmailAtrasada = (id) => {
    setEmailAtrasadasIncluidas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setEmailMensagemModificada(false);
  };

  // ─── derived render values ─────────────────────────────────────────────────

  const parcelasFiltradas = parcelas.filter(p => {
    // Se a parcela está congelada, só mostramos se o filtro for 'todos'
    if (isParcelaCongelada(p) && filtroStatus !== 'todos') return false;

    switch (filtroStatus) {
      case 'pendentes': return p.status !== 'Paga';
      case 'sem_nf':    return !p.nf_numero && p.status !== 'Paga';
      case 'nf_ok':     return p.nf_numero && !p.boleto_numero && p.status !== 'Paga';
      default:          return true;
    }
  });

  const countSemNF = parcelas.filter(p => !p.nf_numero && p.status !== 'Paga' && !isParcelaCongelada(p)).length;
  const countNFok  = parcelas.filter(p => p.nf_numero && !p.boleto_numero && p.status !== 'Paga' && !isParcelaCongelada(p)).length;

  const anosDisponiveis = [];
  for (let y = today.getFullYear() - 2; y <= today.getFullYear() + 2; y++) anosDisponiveis.push(y);

  // Individual modal preview
  const modalParcela = modal.parcela;
  const msgPrincipal = mensagemPadrao && modalParcela ? resolveMessage(mensagemPadrao, modalParcela) : null;

  const atrasadasParaCobranca = cobrancaSelecionadas
    .map(id => parcelasAtrasadas.find(p => p.id === id))
    .filter(Boolean);

  let previewCompleto = null;
  if (msgPrincipal || (incluirCobranca && atrasadasParaCobranca.length > 0)) {
    const parts = [];
    if (msgPrincipal) parts.push(msgPrincipal);
    if (incluirCobranca && atrasadasParaCobranca.length > 0) {
      const itens = atrasadasParaCobranca.map(p => {
        const comp  = getMesPrestacaoLong(p);
        const valor = `R$ ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        const venc  = p.data_vencimento ? new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '';
        return `• ${p.contratos?.titulo || 'Contrato'} — ref. aos serviços prestados em ${comp} — ${valor} (venc. ${venc})`;
      }).join('\n');
      parts.push(`⚠️ Identificamos parcela(s) em atraso:\n${itens}${FOOTER_COBRANCA}`);
    }
    previewCompleto = parts.join('\n\n---\n\n');
  }

  // "Por Cliente" grouped view
  const parcelasGroupedByCliente = useMemo(() => {
    const groups = {};
    parcelas.filter(p => p.status !== 'Paga' && !isParcelaCongelada(p)).forEach(p => {
      const cId = p.contratos?.cliente_id;
      if (!cId) return;
      if (!groups[cId]) groups[cId] = { cliente: p.contratos?.clientes, parcelas: [] };
      groups[cId].parcelas.push(p);
    });
    return Object.values(groups).sort((a, b) =>
      (a.cliente?.apelido || a.cliente?.nome || '').localeCompare(b.cliente?.apelido || b.cliente?.nome || '')
    );
  }, [parcelas]);

  // Auto-generated consolidated message (recalculated when selections or templates change)
  const mensagemAutoGerada = useMemo(() => {
    if (loadingEmailModal || !emailModal.open) return '';

    const parcelasDoEmail = emailModal.parcelas.filter(p => emailParcelasIncluidas.includes(p.id));
    const parts = [];

    const fmtValor = (p) => `R$ ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const fmtVenc  = (p) => p.data_vencimento ? new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '';

    // Separa parcelas do grupo em atuais e atrasadas
    const parcelasAtuais   = parcelasDoEmail.filter(p => !isOverdue(p));
    const atrasadasDoGrupo = parcelasDoEmail.filter(p => isOverdue(p));
    // Atrasadas externas (de outros contratos/períodos) selecionadas manualmente
    const atrasadasExternas = emailAtrasadas.filter(p => emailAtrasadasIncluidas.includes(p.id));
    const todasAtrasadas = [...atrasadasDoGrupo, ...atrasadasExternas];

    if (parcelasAtuais.length === 1) {
      // Parcela atual única: usa o template inteiro resolvido normalmente
      const p = parcelasAtuais[0];
      const template = emailMensagensContratos[p.contrato_id];
      if (template) {
        const resolved = resolveTemplate(template, p);
        if (resolved) parts.push(resolved);
      } else {
        parts.push(`${p.contratos?.titulo || 'Contrato'} — ${getMesPrestacaoLong(p)} — ${fmtValor(p)} (venc. ${fmtVenc(p)})`);
      }
    } else if (parcelasAtuais.length > 1) {
      // Múltiplas parcelas atuais: formato fixo com lista
      const bullets = parcelasAtuais.map(p => {
        const nfPart = p.nf_numero ? `NF ${p.nf_numero} — ` : '';
        return `• ${nfPart}${p.contratos?.titulo || 'Contrato'} — ref. aos serviços prestados em ${getMesPrestacaoLong(p)} — ${fmtValor(p)} (venc. ${fmtVenc(p)})`;
      }).join('\n');
      parts.push(`Prezados,\n\nSeguem as NFs:\n${bullets}`);
    }

    if (todasAtrasadas.length > 0) {
      const itens = todasAtrasadas.map(p => {
        const nfPart = p.nf_numero ? `NF ${p.nf_numero} — ` : '';
        return `• ${nfPart}${p.contratos?.titulo || 'Contrato'} — ref. aos serviços prestados em ${getMesPrestacaoLong(p)} — ${fmtValor(p)} (venc. ${fmtVenc(p)})`;
      }).join('\n');
      parts.push(`⚠️ Identificamos parcela(s) em atraso:\n${itens}${FOOTER_COBRANCA}`);
    }

    return parts.join('\n\n---\n\n');
  }, [emailParcelasIncluidas, emailAtrasadasIncluidas, emailMensagensContratos, emailAtrasadas, emailModal.open, loadingEmailModal, emailModal.parcelas]);

  // Attachments for selected parcelas
  const emailAnexos = useMemo(() => {
    const anexos = [];
    const allSelected = [
      ...emailModal.parcelas.filter(p => emailParcelasIncluidas.includes(p.id)),
      ...emailAtrasadas.filter(p => emailAtrasadasIncluidas.includes(p.id)),
    ];
    allSelected.forEach(p => {
      if (p.nf_arquivo_url) anexos.push({ label: `Newmark - NF ${p.nf_numero || ''}`, url: p.nf_arquivo_url });
      if (p.boleto_arquivo_url) anexos.push({ label: `Newmark - NF ${p.nf_numero || ''} - Boleto`, url: p.boleto_arquivo_url });
    });
    return anexos;
  }, [emailParcelasIncluidas, emailAtrasadasIncluidas, emailModal.parcelas, emailAtrasadas]);

  // ─── envio de e-mail ──────────────────────────────────────────────────────

  const handleEnviarEmailIndividual = async () => {
    const p = modal.parcela;
    const cliente = p.contratos?.clientes;
    const para = cliente?.email_cobranca;
    if (!para) { alert('Este cliente não tem e-mail de cobrança cadastrado.'); return; }
    if (!previewCompleto) { alert('Nenhuma mensagem para enviar. Configure a mensagem padrão no contrato.'); return; }

    const assunto = `Cobrança — ${cliente?.apelido || cliente?.nome} — ${getMesPrestacaoLong(p)}`;
    const anexos = [];
    if (p.nf_arquivo_url) anexos.push({ label: `Newmark - NF ${p.nf_numero || ''}`, url: p.nf_arquivo_url });
    if (p.boleto_arquivo_url) anexos.push({ label: `Newmark - NF ${p.nf_numero || ''} - Boleto`, url: p.boleto_arquivo_url });

    setEnviandoEmail(true);
    const res = await fetch('/api/emissoes/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ para, assunto, mensagem: previewCompleto, anexos, parcelaIds: [p.id] }),
    });
    const json = await res.json();
    setEnviandoEmail(false);

    if (json.error) { alert('Erro ao enviar: ' + json.error); return; }
    alert(`E-mail enviado para ${para}!`);
    closeModal();
    fetchParcelas();
  };

  const handleEnviarEmailConsolidado = async () => {
    const cliente = emailModal.cliente;
    const para = cliente?.email_cobranca;
    if (!para) { alert('Este cliente não tem e-mail de cobrança cadastrado.'); return; }

    const mensagem = emailMensagemModificada ? emailMensagem : mensagemAutoGerada;
    if (!mensagem.trim()) { alert('Mensagem vazia. Selecione ao menos uma parcela.'); return; }

    const assunto = `Cobrança — ${cliente?.apelido || cliente?.nome} — ${MESES[mes - 1]}/${ano}`;
    const parcelaIds = [...emailParcelasIncluidas, ...emailAtrasadasIncluidas];

    setEnviandoEmail(true);
    const res = await fetch('/api/emissoes/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ para, assunto, mensagem, anexos: emailAnexos, parcelaIds }),
    });
    const json = await res.json();
    setEnviandoEmail(false);

    if (json.error) { alert('Erro ao enviar: ' + json.error); return; }
    alert(`E-mail enviado para ${para}!`);
    closeEmailModal();
    fetchParcelas();
  };

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <section className="content-area active">

      {/* Header */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ marginRight: 'auto', color: 'var(--secondary)', fontSize: '18px' }}>Controle de Emissões</h2>
        <button className="btn btn-secondary" style={{ fontSize: '13px', backgroundColor: '#f97316', borderColor: '#ea580c', color: '#fff' }} onClick={handleAbrirExportModal}>
          ⬇ Exportar Lote Inter (Excel)
        </button>
        <label className="btn btn-secondary" style={{ fontSize: '13px', cursor: 'pointer', marginBottom: 0 }}>
          {importando ? 'Importando...' : '⬆ Importar Preenchido'}
          <input type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={e => { handleImportarParcelas(e.target.files[0]); e.target.value = ''; }} disabled={importando} />
        </label>
        <button className="btn btn-secondary" style={{ fontSize: '13px' }} onClick={() => openBulkModal('nf')}>
          ⬆ Upload NFs em Lote
        </button>
        <button className="btn btn-secondary" style={{ fontSize: '13px' }} onClick={() => openBulkModal('boleto')}>
          ⬆ Upload Boletos em Lote
        </button>
        <button className="btn btn-secondary" style={{ fontSize: '13px' }} onClick={openAjustarModal}>
          ✏️ Ajustar Lançamentos
        </button>
        {countSemNF > 0 && (
          <span style={{ backgroundColor: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '12px', padding: '2px 12px', fontSize: '12px', fontWeight: 600 }}>
            {countSemNF} sem NF
          </span>
        )}
        {countNFok > 0 && (
          <span style={{ backgroundColor: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: '12px', padding: '2px 12px', fontSize: '12px', fontWeight: 600 }}>
            {countNFok} sem boleto
          </span>
        )}
      </div>

      {/* Filtros + toggle de visão */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="form-control" style={{ width: '150px' }} value={mes} onChange={e => setMes(Number(e.target.value))}>
          {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select className="form-control" style={{ width: '90px' }} value={ano} onChange={e => setAno(Number(e.target.value))}>
          {anosDisponiveis.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={incluirAtrasadas} onChange={e => setIncluirAtrasadas(e.target.checked)} />
          Incluir em atraso
        </label>
        <select className="form-control" style={{ width: '200px' }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="pendentes">Todos pendentes</option>
          <option value="sem_nf">Sem NF</option>
          <option value="nf_ok">NF ok, sem boleto</option>
          <option value="todos">Todos (incl. pagos)</option>
        </select>
      </div>

      {/* ── Tabela Unificada (Agrupada por Cliente) ───────────────────────────────────────────────── */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Cliente / Parcela</th>
              <th style={{ textAlign: 'center' }}>Competência</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
              <th style={{ textAlign: 'center' }}>Vencimento</th>
              <th style={{ textAlign: 'center' }}>Nota Fiscal</th>
              <th style={{ textAlign: 'center' }}>Boleto</th>
              <th style={{ textAlign: 'center' }}>E-mail</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>Carregando...</td></tr>
            ) : parcelasFiltradas.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Nenhuma parcela encontrada para este período.</td></tr>
            ) : (() => {
              // Agrupa parcelas filtradas
              const grouped = {};
              parcelasFiltradas.forEach(p => {
                const cId = p.contratos?.cliente_id;
                if (!cId) return;
                if (!grouped[cId]) grouped[cId] = { cliente: p.contratos?.clientes, parcelas: [] };
                grouped[cId].parcelas.push(p);
              });
              const groupedArray = Object.values(grouped).sort((a, b) =>
                (a.cliente?.apelido || a.cliente?.nome || '').localeCompare(b.cliente?.apelido || b.cliente?.nome || '')
              );

              // Índice sequencial de cada parcela dentro do seu contrato (por vencimento)
              const parcelaIndexMap = (() => {
                const byContrato = {};
                parcelasFiltradas.forEach(p => {
                  const cid = p.contratos?.id;
                  if (cid) { if (!byContrato[cid]) byContrato[cid] = []; byContrato[cid].push(p); }
                });
                const map = {};
                Object.values(byContrato).forEach(ps => {
                  const sorted = [...ps].sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));
                  sorted.forEach((p, i) => { map[p.id] = { numeroParcela: i + 1, totalParcelas: sorted.length }; });
                });
                return map;
              })();

              return groupedArray.map(grupo => {
                const { cliente, parcelas: gParcelas } = grupo;
                return (
                  <Fragment key={cliente?.id || Math.random()}>
                    {/* Linha do Cliente (Header) */}
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                      <td colSpan="7" style={{ padding: '6px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ color: 'var(--secondary)', fontSize: '13px' }}>{cliente?.apelido || cliente?.nome}</strong>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({gParcelas.length})</span>
                          {gParcelas.some(p => isOverdue(p)) && (
                            <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: 700, backgroundColor: '#fef2f2', padding: '1px 5px', borderRadius: '4px' }}>EM ATRASO</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', padding: '4px 16px' }}>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '10px', padding: '2px 8px', whiteSpace: 'nowrap' }}
                          onClick={() => openEmailModal({ cliente, parcelas: parcelasGroupedByCliente.find(g => g.cliente?.id === cliente?.id)?.parcelas || gParcelas })}
                        >
                          ✉ E-mail Geral
                        </button>
                      </td>
                    </tr>
                    {/* Linhas das Parcelas */}
                    {gParcelas.map(p => {
                      const nfSt = getNFStatus(p);
                      const bolSt = getBoletoStatus(p);
                      const overdue = isOverdue(p);
                      const { numeroParcela, totalParcelas } = parcelaIndexMap[p.id] || {};
                      const descricaoNF = resolveDescricaoNF(p, numeroParcela, totalParcelas);
                      return (
                        <tr key={p.id} style={{ opacity: p.status === 'Paga' ? 0.55 : 1 }}>
                          <td style={{ padding: '6px 8px 6px 24px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: 'var(--border)' }}>└</span>
                              {p.contratos?.titulo}
                            </span>
                            {descricaoNF && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', marginLeft: '16px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', flex: 1 }}>{descricaoNF}</span>
                                <button
                                  title="Copiar descrição"
                                  onClick={() => navigator.clipboard.writeText(descricaoNF)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}
                                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                  onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                                >
                                  ⎘
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{getMesPrestacao(p)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '12px' }}>
                            R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '12px' }}>{new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                            {overdue && <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: 700 }}>EM ATRASO</div>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '10px', fontWeight: 600, color: nfSt.color, backgroundColor: nfSt.bg, border: `1px solid ${nfSt.color}40`, borderRadius: '4px', padding: '0px 6px' }}>{nfSt.label}</span>
                              {p.nf_numero && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>#{p.nf_numero}</span>}
                              {p.nf_arquivo_url && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <a href={p.nf_arquivo_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', color: 'var(--secondary)', textDecoration: 'underline' }}>PDF</a>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoverArquivo('nf', p); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }} title="Remover">&times;</button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '10px', fontWeight: 600, color: bolSt.color, backgroundColor: bolSt.bg, border: `1px solid ${bolSt.color}40`, borderRadius: '4px', padding: '0px 6px' }}>{bolSt.label}</span>
                              {p.boleto_arquivo_url && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <a href={p.boleto_arquivo_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', color: 'var(--secondary)', textDecoration: 'underline' }}>PDF</a>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoverArquivo('boleto', p); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }} title="Remover">&times;</button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {p.email_enviado
                              ? <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#10b981', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '4px', padding: '2px 8px', lineHeight: 1.3 }}>
                                  <span>Enviado</span>
                                  {p.email_enviado_em && (
                                    <span style={{ fontWeight: 400, color: '#6ee7b7', fontSize: '10px' }}>
                                      {new Date(p.email_enviado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' })}
                                    </span>
                                  )}
                                </span>
                              : <span style={{ fontSize: '11px', color: '#94a3b8', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1px 8px' }}>—</span>
                            }
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px 16px' }}>
                            <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '2px 8px', whiteSpace: 'nowrap' }} onClick={() => openModal(p)}>
                              Gerenciar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {/* ── Modal Individual ─────────────────────────────────────────────────── */}
      <div className={`modal-overlay ${modal.open ? 'active' : ''}`}>
        <div className="modal" style={{ maxWidth: '640px' }}>
          <div className="modal-header">
            <h2>Gerenciar Emissão</h2>
            <button className="close-modal" onClick={closeModal}>&times;</button>
          </div>

          <div className="modal-body">
            {modalParcela && (() => {
              const p = modalParcela;
              const cliente = p.contratos?.clientes;
              return (
                <>
                  <div style={{ marginBottom: '18px', padding: '12px 14px', backgroundColor: 'var(--bg-dark)', borderRadius: '8px', fontSize: '13px' }}>
                    <strong style={{ color: 'var(--secondary)', display: 'block', marginBottom: '5px', fontSize: '14px' }}>
                      {cliente?.apelido || cliente?.nome} — {p.contratos?.titulo}
                    </strong>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', color: 'var(--text-main)' }}>
                      <span><strong>Valor:</strong> R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <span><strong>Vencimento:</strong> {new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                      <span><strong>Competência:</strong> {getMesPrestacaoLong(p)}</span>
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <strong>E-mail de cobrança:</strong> {cliente?.email_cobranca || '—'}
                    </div>
                    {modalRetencao > 0 && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: '#0369a1', backgroundColor: '#e0f2fe', borderRadius: '4px', padding: '4px 8px', display: 'inline-block' }}>
                        💧 Retenção na fonte: {modalRetencao}% — Boleto esperado: R$ {(Number(p.valor) * (1 - modalRetencao / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>

                  {/* Upload combinado */}
                  <div style={{ marginBottom: '16px', padding: '12px 14px', border: '2px dashed var(--secondary)', borderRadius: '8px', backgroundColor: '#f8faff' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--secondary)', display: 'block', marginBottom: '6px' }}>
                      Carregar NF + Boleto de uma vez
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.xml"
                      multiple
                      className="form-control"
                      style={{ padding: '4px', fontSize: '12px', cursor: 'pointer' }}
                      onChange={e => handleCombinedUpload(e.target.files)}
                    />
                    {(parsingNF || parsingBoleto) && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--secondary)' }}>
                        Lendo arquivos e identificando NF e boleto...
                      </div>
                    )}
                    <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Selecione os 2 arquivos juntos — o sistema detecta qual é a NF e qual é o boleto automaticamente.
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    {/* NF */}
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--secondary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: p.nf_numero ? '#10b981' : '#ef4444', display: 'inline-block', flexShrink: 0 }} />
                        Nota Fiscal
                      </h4>
                      <div className="form-group">
                        <label style={{ fontSize: '12px' }}>Número</label>
                        <input type="text" className="form-control" placeholder="Ex: 12345" value={formNF.numero} onChange={e => setFormNF(prev => ({ ...prev, numero: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '12px' }}>Arquivo {parsingNF && <span style={{ color: 'var(--secondary)', fontWeight: 400 }}>— lendo PDF...</span>}</label>
                        <input type="file" accept=".pdf,.xml" className="form-control" style={{ padding: '4px', fontSize: '12px', cursor: 'pointer' }} onChange={e => handleNFFileChange(e.target.files[0] || null)} />
                      </div>
                      {p.nf_arquivo_url && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                          <a href={p.nf_arquivo_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--secondary)', textDecoration: 'underline' }}>
                            → Ver arquivo atual
                          </a>
                          <button 
                            type="button" 
                            onClick={() => handleRemoverArquivo('nf')}
                            style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                            title="Remover Nota Fiscal"
                          >
                            &times; Remover
                          </button>
                        </div>
                      )}
                      {parseResultNF && !parseResultNF.erro && (
                        <div style={{ marginTop: '10px', padding: '8px 10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '11px', lineHeight: 1.6 }}>
                          {parseResultNF.numero   && <div><strong>NFS-e nº:</strong> {parseResultNF.numero}</div>}
                          {parseResultNF.cliente  && <div><strong>Cliente:</strong> {parseResultNF.cliente}</div>}
                          {parseResultNF.descricao && <div><strong>Serviço:</strong> {parseResultNF.descricao.substring(0, 150)}{parseResultNF.descricao.length > 150 ? '…' : ''}</div>}
                          {parseResultNF.valor    && <div><strong>Valor:</strong> {parseResultNF.valor}</div>}
                          {!parseResultNF.numero && !parseResultNF.cliente && !parseResultNF.descricao && (
                            <div style={{ color: '#d97706' }}>Nenhum campo reconhecido.</div>
                          )}
                          {parseResultNF._debug && (
                            <details style={{ marginTop: '6px' }}>
                              <summary style={{ cursor: 'pointer', color: '#92400e', fontWeight: 600 }}>Ver texto extraído do PDF ({parseResultNF._debug.length} linhas)</summary>
                              <pre style={{ marginTop: '6px', fontSize: '10px', color: '#374151', backgroundColor: '#fefce8', border: '1px solid #fde68a', borderRadius: '4px', padding: '8px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '200px', overflowY: 'auto' }}>
                                {parseResultNF._debug.map((l, i) => `${i + 1}: ${l}`).join('\n')}
                              </pre>
                            </details>
                          )}
                        </div>
                      )}
                      {parseResultNF?.erro && (
                        <div style={{ marginTop: '8px', fontSize: '11px', color: '#dc2626' }}>Não foi possível ler o PDF: {parseResultNF.erro}</div>
                      )}
                    </div>

                    {/* Boleto */}
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--secondary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: p.boleto_arquivo_url ? '#10b981' : '#ef4444', display: 'inline-block', flexShrink: 0 }} />
                        Boleto
                      </h4>
                      <div className="form-group">
                        <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          Vencimento
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                            previsto: {new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                          {formBoleto.vencimento && formBoleto.vencimento !== p.data_vencimento && (
                            <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>⚠ diferente</span>
                          )}
                        </label>
                        <input type="date" className="form-control" value={formBoleto.vencimento} onChange={e => setFormBoleto(prev => ({ ...prev, vencimento: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '12px' }}>Arquivo {parsingBoleto && <span style={{ color: 'var(--secondary)', fontWeight: 400 }}>— lendo PDF...</span>}</label>
                        <input type="file" accept=".pdf" className="form-control" style={{ padding: '4px', fontSize: '12px', cursor: 'pointer' }} onChange={e => handleBoletoFileChange(e.target.files[0] || null)} />
                      </div>
                      {p.boleto_arquivo_url && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                          <a href={p.boleto_arquivo_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--secondary)', textDecoration: 'underline' }}>
                            → Ver arquivo atual
                          </a>
                          <button 
                            type="button" 
                            onClick={() => handleRemoverArquivo('boleto')}
                            style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                            title="Remover Boleto"
                          >
                            &times; Remover
                          </button>
                        </div>
                      )}
                      {parseResultBoleto && !parseResultBoleto.erro && (
                        <div style={{ marginTop: '10px', padding: '8px 10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '11px', lineHeight: 1.6 }}>
                          {parseResultBoleto.pagador && <div><strong>Pagador:</strong> {parseResultBoleto.pagador}</div>}
                          {parseResultBoleto.numeroDocumento && <div><strong>Nº Documento:</strong> {parseResultBoleto.numeroDocumento}</div>}
                          {parseResultBoleto.vencimento && <div><strong>Vencimento:</strong> {new Date(parseResultBoleto.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</div>}
                        </div>
                      )}
                      {parseResultBoleto?.erro && (
                        <div style={{ marginTop: '8px', fontSize: '11px', color: '#dc2626' }}>Não foi possível ler o PDF: {parseResultBoleto.erro}</div>
                      )}
                    </div>
                  </div>

                  {/* Validação cruzada */}
                  {validacao && (
                    <div style={{ marginBottom: '16px', padding: '14px', backgroundColor: validacao.temAviso ? '#fffbeb' : '#f0fdf4', border: `1px solid ${validacao.temAviso ? '#fde68a' : '#bbf7d0'}`, borderRadius: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: validacao.temAviso ? '#92400e' : '#166534', marginBottom: '10px' }}>
                        {validacao.temAviso ? '⚠️ Atenção: divergências encontradas' : '✅ Dados cruzados e conferidos'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {validacao.itens.map((item, i) => (
                          <div key={i} style={{ fontSize: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <span style={{ flexShrink: 0, fontSize: '13px' }}>
                              {item.ok === true ? '✅' : item.ok === false ? '❌' : '⚪'}
                            </span>
                            <div>
                              <span style={{ fontWeight: 600, color: 'var(--secondary)' }}>{item.label}</span>
                              {item.ok !== true && (
                                <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                                  NF: <strong>{item.nf || '—'}</strong> · Ref: <strong>{item.boleto || '—'}</strong>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {validacao.temAviso && (
                        <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#92400e', fontStyle: 'italic' }}>
                          Revise os dados acima antes de salvar. Você pode ajustar os campos manualmente ou avançar mesmo assim.
                        </p>
                      )}
                    </div>
                  )}

                  <button className="btn btn-primary" style={{ width: '100%', marginBottom: '20px' }} onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : validacao?.temAviso ? 'Avançar mesmo assim' : 'Salvar NF e Boleto'}
                  </button>

                  {!loadingModal && parcelasAtrasadas.length > 0 && (
                    <div style={{ marginBottom: '16px', padding: '14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', flex: 1 }}>
                          ⚠️ {parcelasAtrasadas.length} parcela(s) em atraso deste cliente
                        </span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#dc2626', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={incluirCobranca} onChange={e => handleToggleCobranca(e.target.checked)} />
                          Incluir na mensagem
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {parcelasAtrasadas.map(pa => (
                          <div key={pa.id} style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px',
                            backgroundColor: incluirCobranca && cobrancaSelecionadas.includes(pa.id) ? '#fff1f2' : '#fff',
                            border: '1px solid ' + (incluirCobranca && cobrancaSelecionadas.includes(pa.id) ? '#fecaca' : '#fee2e2'),
                            borderRadius: '6px', opacity: incluirCobranca ? 1 : 0.65,
                          }}>
                            {incluirCobranca && (
                              <input type="checkbox" checked={cobrancaSelecionadas.includes(pa.id)} onChange={() => toggleCobrancaItem(pa.id)} />
                            )}
                            <div style={{ flex: 1, fontSize: '12px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--secondary)' }}>{pa.contratos?.titulo}</span>
                              <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>ref. {getMesPrestacaoLong(pa)}</span>
                            </div>
                            <span style={{ fontWeight: 700, color: '#dc2626', fontSize: '12px', whiteSpace: 'nowrap' }}>
                              R$ {Number(pa.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              venc. {new Date(pa.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        ))}
                      </div>
                      {incluirCobranca && (
                        <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#b91c1c', fontStyle: 'italic', lineHeight: 1.5 }}>
                          A mensagem incluirá: aviso das parcelas selecionadas, validade do boleto anterior (30 dias), Pix e dados bancários do Banco Inter.
                        </p>
                      )}
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--secondary)', margin: 0 }}>Prévia do E-mail</h4>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Para: {cliente?.email_cobranca || '—'}</span>
                    </div>
                    {loadingModal ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Carregando prévia...</div>
                    ) : previewCompleto ? (
                      <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', fontSize: '13px', color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: 1.75, fontFamily: 'inherit' }}>
                        {previewCompleto}
                      </div>
                    ) : (
                      <div style={{ backgroundColor: '#f8fafc', border: '1px dashed var(--border)', borderRadius: '8px', padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                        Nenhuma mensagem padrão cadastrada para este contrato.
                        <br />
                        <span style={{ fontSize: '11px' }}>Configure em Contratos → editar → Mensagem Padrão de Cobrança.</span>
                      </div>
                    )}
                    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '12px' }}
                        disabled={enviandoEmail || !previewCompleto}
                        onClick={handleEnviarEmailIndividual}
                      >
                        {enviandoEmail ? 'Enviando...' : '✉ Enviar por E-mail'}
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={closeModal}>Fechar</button>
          </div>
        </div>
      </div>

      {/* ── Modal Upload em Lote ─────────────────────────────────────────────── */}
      <div className={`modal-overlay ${bulkModal ? 'active' : ''}`}>
        <div className="modal" style={{ width: '92vw', maxWidth: '1100px' }}>
          <div className="modal-header">
            <h2>Upload de {bulkType === 'nf' ? 'NFs' : 'Boletos'} em Lote</h2>
            <button className="close-modal" onClick={() => setBulkModal(false)}>&times;</button>
          </div>
          <div className="modal-body">
            {/* Seletor de arquivos */}
            <div style={{ marginBottom: '20px', padding: '16px', border: '2px dashed var(--secondary)', borderRadius: '8px', backgroundColor: '#f8faff' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--secondary)', display: 'block', marginBottom: '8px' }}>
                Selecione {bulkType === 'nf' ? 'todas as NFs' : 'todos os boletos'} de uma vez
              </label>
              <input
                type="file"
                accept=".pdf"
                multiple
                className="form-control"
                style={{ padding: '4px', fontSize: '12px', cursor: 'pointer' }}
                onChange={e => handleBulkFileChange(e.target.files)}
                disabled={bulkProcessando || bulkSalvando}
              />
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                O sistema lê o CNPJ de cada NF, localiza o cliente e sugere a parcela correspondente pelo valor.
              </p>
            </div>

            {/* Processando */}
            {bulkProcessando && (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--secondary)', fontSize: '13px' }}>
                Lendo arquivos e cruzando com o cadastro...
              </div>
            )}

            {/* Tabela de resultados */}
            {bulkResultados.length > 0 && !bulkProcessando && (
              <>
                <div style={{ marginBottom: '10px', display: 'flex', gap: '12px', fontSize: '12px' }}>
                  <span style={{ color: '#10b981' }}>✅ {bulkResultados.filter(r => r.status === 'pronto').length} prontos</span>
                  <span style={{ color: '#d97706' }}>⚠️ {bulkResultados.filter(r => r.status === 'confirmar').length} precisam de confirmação</span>
                  <span style={{ color: '#ef4444' }}>❌ {bulkResultados.filter(r => r.status === 'nao_encontrado').length} não localizados</span>
                  {bulkResultados.filter(r => r.status === 'salvo').length > 0 && (
                    <span style={{ color: '#10b981', fontWeight: 700 }}>💾 {bulkResultados.filter(r => r.status === 'salvo').length} salvos</span>
                  )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-dark)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Arquivo</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Cliente</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Parcela</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>{bulkType === 'nf' ? 'NF Nº' : 'Boleto Nº'}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Valor</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '8px 6px', width: '32px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResultados.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', backgroundColor: r.status === 'salvo' ? '#f0fdf4' : r.status === 'erro' ? '#fef2f2' : 'transparent' }}>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.filename}
                          </td>
                          <td style={{ padding: '6px 10px', minWidth: '160px' }}>
                            {r.status === 'salvo' ? (
                              <span style={{ fontWeight: 600, color: 'var(--secondary)' }}>{r.clienteMatch?.apelido || r.clienteMatch?.nome}</span>
                            ) : (
                              <select
                                className="form-control"
                                style={{ fontSize: '11px', padding: '3px 6px', fontWeight: r.clienteMatch ? 600 : 400, color: r.clienteMatch ? 'var(--secondary)' : '#ef4444', borderColor: r.clienteMatch ? undefined : '#ef4444' }}
                                value={r.clienteMatch?.id || ''}
                                onChange={e => handleBulkClienteChange(i, e.target.value)}
                                disabled={bulkSalvando}
                              >
                                <option value="">— Selecionar cliente —</option>
                                {[...new Map(bulkTodasParcelas.map(p => [p.contratos?.clientes?.id, p.contratos?.clientes]).filter(([id]) => id)).values()]
                                  .sort((a, b) => (a.apelido || a.nome).localeCompare(b.apelido || b.nome))
                                  .map(c => (
                                    <option key={c.id} value={c.id}>{c.apelido || c.nome}</option>
                                  ))}
                              </select>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', minWidth: '200px' }}>
                            {r.status === 'salvo' ? (
                              <span style={{ color: '#10b981' }}>{r.parcelaSelecionada?.contratos?.titulo} — {getMesPrestacao(r.parcelaSelecionada)}</span>
                            ) : r.parcelasDoCliente.length === 0 ? (
                              <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>
                            ) : (
                              <select
                                className="form-control"
                                style={{ fontSize: '11px', padding: '3px 6px' }}
                                value={r.parcelaSelecionada?.id || ''}
                                onChange={e => handleBulkParcelaChange(i, e.target.value)}
                                disabled={bulkSalvando}
                              >
                                <option value="">Selecionar parcela...</option>
                                {[...r.parcelasDoCliente].sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento)).map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.contratos?.titulo} — {getMesPrestacao(p)} — R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>
                            {bulkType === 'nf' ? (r.parsed.numero || '—') : (r.parsed.numeroDocumento || '—')}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {r.parsed.valor ? `R$ ${r.parsed.valor}` : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            {r.status === 'pronto'        && <span style={{ color: '#10b981', fontWeight: 700 }}>✅</span>}
                            {r.status === 'confirmar'     && (
                              <span style={{ color: '#d97706', fontWeight: 700 }} title={r.conferencias?.some(c => !c.ok) ? "Inconsistências detectadas" : "Selecione a parcela"}>⚠️</span>
                            )}
                            {r.status === 'nao_encontrado'&& <span style={{ color: '#ef4444', fontWeight: 700 }}>❌</span>}
                            {r.status === 'salvo'         && <span style={{ color: '#10b981', fontWeight: 700 }}>💾</span>}
                            {r.status === 'erro'          && <span style={{ color: '#ef4444', fontSize: '11px' }}>{r.erro}</span>}

                            {/* Detalhes das inconsistências */}
                            {r.conferencias?.filter(c => !c.ok).map((c, ci) => {
                              const confIndex = r.conferencias.indexOf(c);
                              return (
                                <div 
                                  key={ci} 
                                  onClick={() => handleResolverInconsistencia(i, confIndex)}
                                  style={{ fontSize: '9px', color: '#ef4444', marginTop: '2px', lineHeight: '1.1', cursor: 'pointer', textDecoration: 'underline dotted' }}
                                  title={`Clique para atualizar a parcela com "${c.parsed}"`}
                                >
                                  {c.label}: {c.label === 'Valor' ? `${c.parsed?.toLocaleString('pt-BR')} vs ${c.expected?.toLocaleString('pt-BR')}` : `${c.parsed} vs ${c.expected}`}
                                </div>
                              );
                            })}
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            {r.status !== 'salvo' && (
                              <button
                                onClick={() => handleBulkRemove(i)}
                                disabled={bulkSalvando}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', lineHeight: 1, padding: '2px 4px' }}
                                title="Remover"
                              >×</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setBulkModal(false)}>Fechar</button>
            {bulkResultados.filter(r => r.status === 'pronto').length > 0 && (
              <button
                className="btn btn-primary"
                onClick={handleBulkSalvar}
                disabled={bulkSalvando}
              >
                {bulkSalvando ? 'Salvando...' : `Salvar ${bulkResultados.filter(r => r.status === 'pronto').length} arquivo(s)`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal Ajustar Lançamentos ────────────────────────────────────────── */}
      <div className={`modal-overlay ${ajustarModal ? 'active' : ''}`}>
        <div className="modal" style={{ width: '92vw', maxWidth: '1100px' }}>
          <div className="modal-header">
            <h2>Ajustar Lançamentos</h2>
            <button className="close-modal" onClick={() => setAjustarModal(false)}>&times;</button>
          </div>
          <div className="modal-body">
            {ajustarLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>Carregando...</div>
            ) : ajustarParcelas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>Nenhum lançamento encontrado.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-dark)', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>NF Nº</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Cliente</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Parcela</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>Competência</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Valor</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ajustarParcelas.map((row, i) => (
                      <Fragment key={row.id}>
                        <tr style={{ borderBottom: row.moverAtivo ? 'none' : '1px solid var(--border)', opacity: row.salvando ? 0.5 : 1 }}>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600 }}>{row.nf_numero || '—'}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--secondary)' }}>{row.contratos?.clientes?.apelido || row.contratos?.clientes?.nome || '—'}</td>
                          <td style={{ padding: '8px 10px' }}>{row.contratos?.titulo || '—'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>{getMesPrestacao(row)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>R$ {Number(row.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#f0fdf4', color: '#10b981', border: '1px solid #bbf7d0' }}>{row.status}</span>
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => handleAjustarAtivarMover(i)}
                              disabled={row.salvando}
                              style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--secondary)', background: row.moverAtivo ? 'var(--secondary)' : 'transparent', color: row.moverAtivo ? '#fff' : 'var(--secondary)', cursor: 'pointer', marginRight: '6px' }}
                            >
                              ↔ Mover
                            </button>
                            <button
                              onClick={() => handleAjustarRemover(i)}
                              disabled={row.salvando}
                              style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                            >
                              × Remover
                            </button>
                          </td>
                        </tr>
                        {row.moverAtivo && (
                          <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#f8faff' }}>
                            <td colSpan={7} style={{ padding: '8px 16px 12px' }}>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Mover NF {row.nf_numero} para:</span>
                                {row._opcoes?.length === 0 ? (
                                  <span style={{ fontSize: '12px', color: '#ef4444' }}>Nenhuma parcela disponível para este cliente</span>
                                ) : (
                                  <>
                                    <select
                                      className="form-control"
                                      style={{ fontSize: '12px', flex: 1, maxWidth: '480px' }}
                                      value={row.moverSelecionada}
                                      onChange={e => setAjustarParcelas(prev => prev.map((r, j) => j === i ? { ...r, moverSelecionada: e.target.value } : r))}
                                    >
                                      <option value="">Selecionar parcela destino...</option>
                                      {(row._opcoes || []).map(p => (
                                        <option key={p.id} value={p.id}>
                                          {p.contratos?.titulo} — {getMesPrestacao(p)} — R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => handleAjustarConfirmarMover(i)}
                                      disabled={!row.moverSelecionada || row.salvando}
                                      className="btn btn-primary"
                                      style={{ fontSize: '12px', padding: '5px 14px' }}
                                    >
                                      Confirmar
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => setAjustarParcelas(prev => prev.map((r, j) => j === i ? { ...r, moverAtivo: false } : r))}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px' }}
                                >×</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setAjustarModal(false)}>Fechar</button>
          </div>
        </div>
      </div>

      {/* ── Modal E-mail Consolidado ─────────────────────────────────────────── */}
      <div className={`modal-overlay ${emailModal.open ? 'active' : ''}`}>
        <div className="modal" style={{ maxWidth: '700px' }}>
          <div className="modal-header">
            <h2>Compor E-mail — {emailModal.cliente?.apelido || emailModal.cliente?.nome}</h2>
            <button className="close-modal" onClick={closeEmailModal}>&times;</button>
          </div>

          <div className="modal-body">
            {loadingEmailModal ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando dados...</div>
            ) : (
              <>
                {/* Para */}
                <div style={{ marginBottom: '14px', padding: '7px 12px', backgroundColor: 'var(--bg-dark)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--secondary)', fontWeight: 600 }}>Para:</strong>{' '}
                  {emailModal.cliente?.email_cobranca || <span style={{ color: '#ef4444' }}>sem e-mail cadastrado</span>}
                </div>

                {/* Seção 1: Parcelas do período */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Parcelas do período
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {emailModal.parcelas.map(p => {
                      const hasDoc = !!(p.nf_numero || p.nf_arquivo_url);
                      const included = emailParcelasIncluidas.includes(p.id);
                      const overdue = isOverdue(p);
                      return (
                        <label key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 9px',
                          backgroundColor: included ? (overdue ? '#fef2f2' : '#f8fafc') : 'transparent',
                          border: '1px solid ' + (overdue ? '#fca5a5' : (included ? '#e2e8f0' : '#e2e8f0')),
                          borderLeft: overdue ? '3px solid #dc2626' : (included ? '3px solid #93c5fd' : '3px solid transparent'),
                          borderRadius: '4px', opacity: hasDoc ? 1 : 0.5, cursor: hasDoc ? 'pointer' : 'default',
                        }}>
                          <input type="checkbox" checked={included} disabled={!hasDoc} onChange={() => toggleEmailParcela(p.id)} style={{ margin: 0 }} />
                          <span style={{ flex: 1, fontSize: '11px', color: 'var(--secondary)' }}>
                            <span style={{ fontWeight: 600 }}>{p.contratos?.titulo}</span>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '5px', fontWeight: 400 }}>ref. {getMesPrestacaoLong(p)}</span>
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', color: overdue ? '#dc2626' : 'var(--secondary)' }}>
                            R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <span style={{ fontSize: '10px', color: overdue ? '#ef4444' : 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: '80px', textAlign: 'right' }}>
                            {overdue ? '⚠ ' : ''}{new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                          {!hasDoc && <span style={{ fontSize: '10px', color: '#ef4444', whiteSpace: 'nowrap' }}>sem NF</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Seção 2: Parcelas em atraso */}
                {emailAtrasadas.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#dc2626', marginBottom: '6px' }}>
                      ⚠ Em atraso ({emailAtrasadas.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {emailAtrasadas.map(pa => {
                        const included = emailAtrasadasIncluidas.includes(pa.id);
                        return (
                          <label key={pa.id} style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 9px',
                            backgroundColor: included ? '#fef2f2' : 'transparent',
                            border: '1px solid #fecaca',
                            borderLeft: '3px solid ' + (included ? '#dc2626' : '#fca5a5'),
                            borderRadius: '4px', cursor: 'pointer',
                          }}>
                            <input type="checkbox" checked={included} onChange={() => toggleEmailAtrasada(pa.id)} style={{ margin: 0 }} />
                            <span style={{ flex: 1, fontSize: '11px', color: 'var(--secondary)' }}>
                              <span style={{ fontWeight: 600 }}>{pa.contratos?.titulo}</span>
                              <span style={{ color: 'var(--text-muted)', marginLeft: '5px', fontWeight: 400 }}>ref. {getMesPrestacaoLong(pa)}</span>
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#dc2626', whiteSpace: 'nowrap' }}>
                              R$ {Number(pa.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span style={{ fontSize: '10px', color: '#ef4444', whiteSpace: 'nowrap', minWidth: '80px', textAlign: 'right' }}>
                              {new Date(pa.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Seção 3: Mensagem editável */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Mensagem
                      {emailMensagemModificada && (
                        <span style={{ marginLeft: '8px', fontSize: '10px', color: '#d97706', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontStyle: 'italic' }}>editada</span>
                      )}
                    </div>
                    {emailMensagemModificada && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '10px', padding: '2px 8px' }}
                        onClick={() => { setEmailMensagemModificada(false); setEmailMensagem(''); }}
                      >
                        ↺ Reconstruir
                      </button>
                    )}
                  </div>
                  <textarea
                    className="form-control"
                    rows={9}
                    style={{ fontSize: '12px', lineHeight: 1.65, fontFamily: 'inherit', resize: 'vertical' }}
                    value={emailMensagemModificada ? emailMensagem : mensagemAutoGerada}
                    onChange={e => { setEmailMensagem(e.target.value); setEmailMensagemModificada(true); }}
                    placeholder="Selecione as parcelas acima para gerar a mensagem automaticamente."
                  />
                </div>

                {/* Seção 4: Anexos */}
                {emailAnexos.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Anexos ({emailAnexos.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                      {emailAnexos.map((anexo, i) => (
                        <a key={i} href={anexo.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: '11px', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', opacity: 0.75 }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.75'}
                        >
                          📎 {anexo.label.trim()}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                  <button
                    className="btn btn-primary"
                    disabled={enviandoEmail || !mensagemAutoGerada.trim()}
                    onClick={handleEnviarEmailConsolidado}
                  >
                    {enviandoEmail ? 'Enviando...' : '✉ Enviar por E-mail'}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={closeEmailModal}>Fechar</button>
          </div>
        </div>
      </div>

      {/* Export Inter Modal */}
      {exportModal && (
        <div className="modal-overlay active" style={{ zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header">
              <h2>Exportar Lote Banco Inter</h2>
              <button className="close-modal" onClick={() => setExportModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Selecione as parcelas que deseja incluir na planilha de emissão em lote do Banco Inter.
              </p>
              
              <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '16px' }}>
                <table className="nm-table" style={{ margin: 0, fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={exportSelecionadas.length > 0 && exportSelecionadas.length === parcelasFiltradas.filter(p => p.status !== 'Paga' && !isParcelaCongelada(p)).length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExportSelecionadas(parcelasFiltradas.filter(p => p.status !== 'Paga' && !isParcelaCongelada(p)).map(p => p.id));
                            } else {
                              setExportSelecionadas([]);
                            }
                          }}
                        />
                      </th>
                      <th>Cliente</th>
                      <th>Competência</th>
                      <th style={{ textAlign: 'center' }}>Vencimento</th>
                      <th style={{ textAlign: 'right' }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelasFiltradas.filter(p => p.status !== 'Paga' && !isParcelaCongelada(p)).map(p => {
                      const cli = p.contratos?.clientes;
                      const isOverdueParc = isOverdue(p);
                      return (
                        <tr key={p.id}>
                          <td style={{ textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={exportSelecionadas.includes(p.id)}
                              onChange={(e) => {
                                if (e.target.checked) setExportSelecionadas([...exportSelecionadas, p.id]);
                                else setExportSelecionadas(exportSelecionadas.filter(id => id !== p.id));
                              }}
                            />
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {cli?.apelido || cli?.nome}
                          </td>
                          <td>{getMesPrestacao(p)}</td>
                          <td style={{ textAlign: 'center' }}>
                            {new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                            {isOverdueParc && <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: 700 }}>EM ATRASO</div>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                    {parcelasFiltradas.filter(p => p.status !== 'Paga' && !isParcelaCongelada(p)).length === 0 && (
                      <tr><td colSpan="5" style={{ textAlign: 'center', padding: '24px' }}>Nenhuma parcela pendente.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>
                  {exportSelecionadas.length} parcela(s) selecionada(s)
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary" onClick={() => setExportModal(false)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={handleGerarExportInter} disabled={exportando || exportSelecionadas.length === 0}>
                    {exportando ? 'Gerando...' : 'Gerar Planilha Inter'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
