"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ContratosModule() {
  const [contratos, setContratos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  
  // Alloc Modal State
  const [allocModalState, setAllocModalState] = useState({ isOpen: false, contrato: null, atendentes: [] });
  
  // Edit Modal State
  const [editModalState, setEditModalState] = useState({ isOpen: false, contrato: null });
  const [editForm, setEditForm] = useState({ titulo: '', cliente_id: '', status: '', data_fim: '', valor_total: '', data_aplicacao: '', novaObservacao: '', historico_observacoes: [], arquivado: false, previsao_conclusao: '', obs_termino: '' });

  // Freeze Modal State
  const [congelarModal, setCongelarModal] = useState({ open: false, contrato: null });
  const [congelarForm, setCongelarForm] = useState({ desde: '', previsao_retorno: '' });
  const [congelarSaving, setCongelarSaving] = useState(false);
  
  // New Split Form State
  const [splitForm, setSplitForm] = useState({
    data_inicio: '',
    users: [
      { id: Date.now(), usuario_id: '', percentual: '100' }
    ]
  });

  // Form State
  const [clienteId, setClienteId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [modalidade, setModalidade] = useState('partido_fixo'); // 'projeto_fechado' ou 'partido_fixo'
  const [valorTotal, setValorTotal] = useState('');
  const [valorMensal, setValorMensal] = useState('');
  const [tipoCobranca, setTipoCobranca] = useState('');
  const [numParcelasMensais, setNumParcelasMensais] = useState('');
  const [diaVencimento, setDiaVencimento] = useState('10');
  const [cobrancaMesmoMes, setCobrancaMesmoMes] = useState(false);
  const [numEtapas, setNumEtapas] = useState('');
  const [temProspeccao, setTemProspeccao] = useState('nao');
  const [etapasForm, setEtapasForm] = useState([]);
  const [percentualRetencao, setPercentualRetencao] = useState('0');
  
  // Prospecção State
  const [prospeccaoUsuarioId, setProspeccaoUsuarioId] = useState('');
  const [prospeccaoValor, setProspeccaoValor] = useState('');
  const [prospeccaoData, setProspeccaoData] = useState('');
  const [prospeccaoObs, setProspeccaoObs] = useState('');

  useEffect(() => {
    if (modalidade === 'projeto_fechado' && (tipoCobranca === 'etapas' || tipoCobranca === 'hibrido')) {
      const num = parseInt(numEtapas, 10);
      if (num > 0) {
        const valTotalNum = parseFloat(valorTotal.replace(/\./g, '').replace(',', '.')) || 0;
        const baseValue = num > 0 ? (valTotalNum / num) : 0;
        
        setEtapasForm(prev => {
          if (prev.length === num) return prev; 
          return Array.from({ length: num }, (_, i) => ({
            id: `etapa-${i}`,
            data_vencimento: '',
            valor: baseValue.toFixed(2)
          }));
        });
      } else {
        setEtapasForm([]);
      }
    } else {
      setEtapasForm([]);
    }
  }, [numEtapas, tipoCobranca, modalidade, valorTotal]);

  const handleEtapaChange = (index, field, value) => {
    const novasEtapas = [...etapasForm];
    novasEtapas[index][field] = value;
    setEtapasForm(novasEtapas);
  };

  const fetchData = async () => {
    setLoading(true);
    const { data: contratosData } = await supabase
      .from('contratos')
      .select('*, clientes(apelido, nome), contrato_atendentes(*, profiles(nome))');
      
    const { data: clientesData } = await supabase
      .from('clientes')
      .select('id, apelido, nome, proposta_url')
      .order('nome', { ascending: true });

    const { data: usersData } = await supabase
      .from('profiles')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (contratosData) setContratos(contratosData);
    if (clientesData) setClientes(clientesData);
    if (usersData) setUsuarios(usersData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteContrato = async (id) => {
    if(confirm("Tem certeza que deseja excluir este contrato? Todas as parcelas associadas serão apagadas definitivamente!")) {
      const { error } = await supabase.from('contratos').delete().eq('id', id);
      if (error) alert("Erro ao excluir: " + error.message);
      else fetchData();
    }
  };

  const handleSaveContrato = async (e) => {
    e.preventDefault();

    const isPartidoFixo = modalidade === 'partido_fixo';
    const rawVal = isPartidoFixo ? valorMensal : valorTotal;
    const valorNum = parseFloat(rawVal.replace(/\./g, '').replace(',', '.'));
    
    if (modalidade === 'projeto_fechado' && tipoCobranca === 'etapas') {
       const totalEtapas = etapasForm.reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);
       if (Math.abs(totalEtapas - valorNum) >= 0.05) {
         alert("A soma dos valores das etapas deve ser igual ao valor total do projeto!");
         return;
       }
    }
    
    const novoContrato = {
      cliente_id: clienteId,
      titulo,
      data_inicio: dataInicio,
      valor_total: valorNum,
      tipo_cobranca: isPartidoFixo ? 'partido_fixo' : tipoCobranca,
      tem_prospeccao: temProspeccao === 'sim',
      status: 'Em andamento',
      cobranca_mesmo_mes: isPartidoFixo ? cobrancaMesmoMes : false,
      prospeccao_usuario_id: temProspeccao === 'sim' ? prospeccaoUsuarioId : null,
      prospeccao_valor: temProspeccao === 'sim' && prospeccaoValor ? parseFloat(prospeccaoValor.replace(/\./g, '').replace(',', '.')) : null,
      prospeccao_data: temProspeccao === 'sim' && prospeccaoData ? prospeccaoData : null,
      prospeccao_obs: temProspeccao === 'sim' ? prospeccaoObs : null,
      percentual_retencao: parseFloat(percentualRetencao) || 0,
    };

    const { data, error } = await supabase.from('contratos').insert([novoContrato]).select();
    if (error) { alert('Erro ao salvar contrato: ' + error.message); return; }

    const contratoSalvo = data[0];

    const parcelas = [];
    
    if (modalidade === 'projeto_fechado' && (tipoCobranca === 'etapas' || tipoCobranca === 'hibrido')) {
       etapasForm.forEach((etapa, idx) => {
         if (etapa.data_vencimento && etapa.valor) {
           parcelas.push({
               contrato_id: contratoSalvo.id,
               numero: idx + 1,
               tipo: 'Etapa',
               valor: parseFloat(etapa.valor) || 0,
               data_vencimento: etapa.data_vencimento,
               data_original: etapa.data_vencimento,
               historico_reprogramacao: [],
               status: 'Pendente'
           });
         }
       });
    }

    if (isPartidoFixo || tipoCobranca === 'mensal' || tipoCobranca === 'hibrido') {
       let qtd = 1;
       if (isPartidoFixo) {
         const inicioObj = new Date(dataInicio);
         const hoje = new Date();
         const diffAnos = hoje.getFullYear() - inicioObj.getFullYear();
         const diffMeses = hoje.getMonth() - inicioObj.getMonth();
         const totalMesesAteHoje = (diffAnos * 12) + diffMeses;
         
         qtd = totalMesesAteHoje > 0 ? totalMesesAteHoje + 24 : 24;
       } else {
         qtd = parseInt(numParcelasMensais) || 1;
       }
       const valorParcela = isPartidoFixo ? valorNum : (valorNum / qtd); 
       
       const [anoStr, mesStr] = dataInicio.split('-');
       const ano = parseInt(anoStr, 10);
       const mes = parseInt(mesStr, 10);
       const diaDesejado = parseInt(diaVencimento, 10);
       const mesOffset = (isPartidoFixo && cobrancaMesmoMes) ? -1 : 0;
       
       for(let i=1; i<=qtd; i++) {
          let calcMeses = mes - 1 + i + mesOffset;
          let calcAno = ano + Math.floor(calcMeses / 12);
          let calcMes = calcMeses % 12; 
          if (calcMes < 0) {
             calcMes += 12;
             calcAno -= 1;
          }
          
          const dataVenc = new Date(calcAno, calcMes, diaDesejado);
          if (dataVenc.getMonth() !== calcMes) dataVenc.setDate(0);
          
          const anoVenc = dataVenc.getFullYear();
          const mesVenc = String(dataVenc.getMonth() + 1).padStart(2, '0');
          const diaVenc = String(dataVenc.getDate()).padStart(2, '0');
          const dataFormatada = `${anoVenc}-${mesVenc}-${diaVenc}`;
          
          parcelas.push({
             contrato_id: contratoSalvo.id,
             numero: i,
             tipo: 'Mensal',
             valor: valorParcela,
             data_vencimento: dataFormatada,
             data_original: dataFormatada,
             historico_reprogramacao: [],
             status: 'Pendente'
          });
       }
    }

    if (parcelas.length > 0) await supabase.from('parcelas').insert(parcelas);

    await supabase.from('clientes').update({ status: 'Ativo' }).eq('id', clienteId);

    setIsModalOpen(false);
    
    // Clear Form
    setClienteId(''); setTitulo(''); setDataInicio(''); setValorTotal(''); setValorMensal('');
    setModalidade('partido_fixo'); setTipoCobranca(''); setNumParcelasMensais(''); 
    setDiaVencimento('10'); setCobrancaMesmoMes(false); setNumEtapas(''); setTemProspeccao('nao'); setEtapasForm([]);
    setProspeccaoUsuarioId(''); setProspeccaoValor(''); setProspeccaoData(''); setProspeccaoObs('');
    setPercentualRetencao('0');

    fetchData();
  };

  // --- Funções de Edição de Contrato ---
  const openEditModal = (contrato) => {
    setEditModalState({ isOpen: true, contrato });
    setEditForm({
      titulo: contrato.titulo,
      cliente_id: contrato.cliente_id,
      status: contrato.status || 'Em andamento',
      data_fim: contrato.data_fim || '',
      valor_total: contrato.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      data_aplicacao: '',
      novaObservacao: '',
      historico_observacoes: contrato.historico_observacoes || [],
      arquivado: contrato.arquivado || false,
      previsao_conclusao: contrato.previsao_conclusao || '',
      obs_termino: contrato.obs_termino || '',
      mensagem_padrao: contrato.mensagem_padrao || '',
      percentual_retencao: contrato.percentual_retencao != null ? String(contrato.percentual_retencao) : '0',
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const { contrato } = editModalState;
    const valorNum = parseFloat(editForm.valor_total.replace(/\./g, '').replace(',', '.'));
    
    const valueChanged = contrato.valor_total !== valorNum;
    let newHist = contrato.historico_valores || [];
    
    if (valueChanged) {
       if (!editForm.data_aplicacao) {
          alert("Por favor, informe a partir de qual mês o novo valor será aplicado.");
          return;
       }
       const dataApp = `${editForm.data_aplicacao}-01`;

       newHist.push({
         data_alteracao: new Date().toISOString(),
         data_aplicacao: dataApp,
         valor_antigo: contrato.valor_total,
         valor_novo: valorNum
       });
       
       const { error: pError } = await supabase
         .from('parcelas')
         .update({ valor: valorNum })
         .eq('contrato_id', contrato.id)
         .eq('status', 'Pendente')
         .gte('data_original', dataApp);
         
       if (pError) {
         alert("Erro ao atualizar parcelas: " + pError.message);
         return;
       }
    }
    
    let updatedObs = [...editForm.historico_observacoes];
    if (editForm.novaObservacao.trim()) {
      updatedObs.push({
        data: new Date().toISOString(),
        texto: editForm.novaObservacao.trim()
      });
    }
    
    const updateData = {
      titulo: editForm.titulo,
      cliente_id: editForm.cliente_id,
      status: editForm.status,
      valor_total: valorNum,
      historico_valores: newHist,
      historico_observacoes: updatedObs,
      arquivado: editForm.arquivado,
      mensagem_padrao: editForm.mensagem_padrao || null,
      percentual_retencao: parseFloat(editForm.percentual_retencao) || 0,
    };
    
    if (editForm.status === 'Finalizado' || editForm.status === 'Cancelado') {
      updateData.data_fim = editForm.data_fim;
    } else {
      updateData.data_fim = null;
    }

    // Handle previsao_conclusao: save it and delete pending parcelas after that date
    updateData.previsao_conclusao = editForm.previsao_conclusao || null;
    updateData.obs_termino = editForm.obs_termino || null;

    if (editForm.previsao_conclusao) {
      const prevData = editForm.previsao_conclusao;
      const prevChanged = contrato.previsao_conclusao !== prevData;
      if (prevChanged) {
        const { error: delError } = await supabase
          .from('parcelas')
          .delete()
          .eq('contrato_id', contrato.id)
          .eq('status', 'Pendente')
          .gt('data_vencimento', prevData);
        if (delError) {
          alert('Erro ao cortar parcelas futuras: ' + delError.message);
          return;
        }
      }
    }
    
    const { error } = await supabase
      .from('contratos')
      .update(updateData)
      .eq('id', contrato.id);
      
    if (error) alert("Erro ao atualizar contrato: " + error.message);
    else {
      setEditModalState({ isOpen: false, contrato: null });
      fetchData();
    }
  };

  const handleToggleProspeccao = async () => {
    const contrato = editModalState.contrato;
    const novoStatus = contrato.prospeccao_status === 'Pago' ? 'Pendente' : 'Pago';
    
    const { error } = await supabase
      .from('contratos')
      .update({ prospeccao_status: novoStatus })
      .eq('id', contrato.id);
      
    if (error) {
      alert("Erro ao atualizar status da prospecção: " + error.message);
    } else {
      setEditModalState({ ...editModalState, contrato: { ...contrato, prospeccao_status: novoStatus } });
      fetchData(); 
    }
  };

  const handleDeleteHistory = async (indexToRemove) => {
    if (!window.confirm("Deseja desfazer este reajuste? As parcelas a partir da data de aplicação voltarão ao valor anterior.")) return;
    
    const { contrato } = editModalState;
    const hist = [...contrato.historico_valores];
    
    const itemToRemove = hist[indexToRemove];
    const isLastItem = indexToRemove === hist.length - 1;
    
    let novoValorTotal = contrato.valor_total;
    
    if (isLastItem) {
       novoValorTotal = itemToRemove.valor_antigo;
    }
    
    if (itemToRemove.data_aplicacao) {
       const { error: pError } = await supabase
         .from('parcelas')
         .update({ valor: itemToRemove.valor_antigo })
         .eq('contrato_id', contrato.id)
         .eq('status', 'Pendente')
         .gte('data_original', itemToRemove.data_aplicacao);
         
       if (pError) {
         alert("Erro ao reverter parcelas: " + pError.message);
         return;
       }
    }
    
    hist.splice(indexToRemove, 1);
    
    const { error } = await supabase
      .from('contratos')
      .update({
         historico_valores: hist,
         valor_total: novoValorTotal
      })
      .eq('id', contrato.id);
      
    if (error) {
      alert("Erro ao atualizar contrato: " + error.message);
    } else {
      setEditModalState({ isOpen: false, contrato: null }); 
      fetchData();
    }
  };

  // --- Funções de Congelamento ---
  const openCongelarModal = (c) => {
    setCongelarModal({ open: true, contrato: c });
    setCongelarForm({
      desde: c.congelado_desde || new Date().toISOString().split('T')[0],
      previsao_retorno: c.congelado_previsao_retorno || '',
    });
  };

  const handleCongelar = async () => {
    const { contrato } = congelarModal;
    if (!congelarForm.desde) { alert('Informe a data de início do congelamento.'); return; }
    setCongelarSaving(true);

    const { error: cErr } = await supabase.from('contratos').update({
      congelado: true,
      congelado_desde: congelarForm.desde,
      congelado_previsao_retorno: congelarForm.previsao_retorno || null,
    }).eq('id', contrato.id);
    if (cErr) { alert('Erro: ' + cErr.message); setCongelarSaving(false); return; }

    const { error: pErr } = await supabase.from('parcelas')
      .update({ status: 'Congelada' })
      .eq('contrato_id', contrato.id)
      .in('status', ['Pendente', 'Reprogramada', 'NF Emitida'])
      .gte('data_vencimento', congelarForm.desde);
    if (pErr) { alert('Erro ao congelar parcelas: ' + pErr.message); setCongelarSaving(false); return; }

    setCongelarModal({ open: false, contrato: null });
    setCongelarSaving(false);
    fetchData();
  };

  const handleDescongelar = async () => {
    const { contrato } = congelarModal;
    if (!window.confirm(`Descongelar "${contrato.titulo}"? As parcelas congeladas voltarão a ficar pendentes.`)) return;
    setCongelarSaving(true);

    await supabase.from('parcelas')
      .update({ status: 'Pendente' })
      .eq('contrato_id', contrato.id)
      .eq('status', 'Congelada');

    const { error: cErr } = await supabase.from('contratos').update({
      congelado: false,
      congelado_desde: null,
      congelado_previsao_retorno: null,
    }).eq('id', contrato.id);
    if (cErr) { alert('Erro: ' + cErr.message); setCongelarSaving(false); return; }

    setCongelarModal({ open: false, contrato: null });
    setCongelarSaving(false);
    fetchData();
  };

  // --- Funções de Alocação por Split ---
  const openAllocModal = async (contrato) => {
    const { data } = await supabase
      .from('contrato_atendentes')
      .select('*, profiles(nome)')
      .eq('contrato_id', contrato.id)
      .order('data_inicio', { ascending: false });
    
    setAllocModalState({ isOpen: true, contrato, atendentes: data || [] });
    setSplitForm({
      data_inicio: contrato.data_inicio, // Default to contract start date
      users: [{ id: Date.now(), usuario_id: '', percentual: '100' }]
    });
  };

  const addSplitUserRow = () => {
    setSplitForm({
      ...splitForm,
      users: [...splitForm.users, { id: Date.now(), usuario_id: '', percentual: '' }]
    });
  };

  const removeSplitUserRow = (idToRemove) => {
    setSplitForm({
      ...splitForm,
      users: splitForm.users.filter(u => u.id !== idToRemove)
    });
  };

  const handleSplitUserChange = (id, field, value) => {
    setSplitForm({
      ...splitForm,
      users: splitForm.users.map(u => u.id === id ? { ...u, [field]: value } : u)
    });
  };

  const handleAddSplit = async (e) => {
    e.preventDefault();
    
    // Validar se soma é 100%
    const totalPercent = splitForm.users.reduce((acc, u) => acc + parseFloat(u.percentual || 0), 0);
    if (totalPercent !== 100) {
      alert(`A soma das porcentagens deve ser EXATAMENTE 100%. O valor atual é: ${totalPercent}%`);
      return;
    }

    // Fechar automaticamente a regra anterior
    const dataInicioNova = new Date(splitForm.data_inicio);
    const dataFimAtualObj = new Date(dataInicioNova);
    dataFimAtualObj.setDate(dataFimAtualObj.getDate() - 1);
    const dataFimAtualStr = dataFimAtualObj.toISOString().split('T')[0];

    const currentActive = allocModalState.atendentes.filter(a => !a.data_fim);
    if (currentActive.length > 0) {
      const activeIds = currentActive.map(a => a.id);
      await supabase
        .from('contrato_atendentes')
        .update({ data_fim: dataFimAtualStr })
        .in('id', activeIds);
    }

    // Inserir nova regra (cada usuário vira uma linha)
    const inserts = splitForm.users.map(u => ({
      contrato_id: allocModalState.contrato.id,
      usuario_id: u.usuario_id,
      percentual: parseFloat(u.percentual),
      data_inicio: splitForm.data_inicio,
      data_fim: null
    }));

    const { error } = await supabase.from('contrato_atendentes').insert(inserts);
    if (error) alert("Erro ao salvar regra: " + error.message);
    else openAllocModal(allocModalState.contrato); // refresh
  };

  const handleRemoveRule = async (data_inicio) => {
    if(confirm("Deseja remover esta regra inteira?")) {
      await supabase
        .from('contrato_atendentes')
        .delete()
        .eq('contrato_id', allocModalState.contrato.id)
        .eq('data_inicio', data_inicio);
      openAllocModal(allocModalState.contrato);
    }
  };

  // Agrupar atendentes por Data de Inicio para visualização
  const groupedRules = {};
  allocModalState.atendentes.forEach(a => {
    if (!groupedRules[a.data_inicio]) {
      groupedRules[a.data_inicio] = {
        data_inicio: a.data_inicio,
        data_fim: a.data_fim,
        pessoas: []
      };
    }
    groupedRules[a.data_inicio].pessoas.push(a);
  });
  const rulesArray = Object.values(groupedRules).sort((a,b) => new Date(b.data_inicio) - new Date(a.data_inicio));

  const sumCurrentInput = splitForm.users.reduce((acc, u) => acc + parseFloat(u.percentual || 0), 0);

  return (
    <section className="content-area active">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
        <input type="text" className="form-control" placeholder="Buscar contratos..." style={{ width: '300px' }} />
        
        <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
           <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)'}}>
             <input type="checkbox" checked={mostrarArquivados} onChange={e => setMostrarArquivados(e.target.checked)} />
             Mostrar Arquivados
           </label>
           <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>Novo Contrato</button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Serviço</th>
              <th>Início</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Alocação Atual</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{textAlign: 'center'}}>Carregando...</td></tr>
            ) : contratos.length === 0 ? (
              <tr><td colSpan="7" style={{textAlign: 'center'}}>Nenhum contrato cadastrado.</td></tr>
            ) : (
              contratos
                .filter(c => mostrarArquivados ? true : !c.arquivado)
                .map(c => (
                <tr key={c.id} style={{ opacity: c.arquivado ? 0.6 : 1 }}>
                  <td><strong>{c.clientes?.apelido || c.clientes?.nome}</strong></td>
                  <td>
                    {c.titulo}
                    {c.congelado && (
                      <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#0369a1', backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '4px', padding: '1px 6px', letterSpacing: '0.02em' }}>
                          ❄ Congelado
                        </span>
                        {c.congelado_desde && (
                          <span style={{ fontSize: '10px', color: '#0369a1' }}>
                            desde {new Date(c.congelado_desde + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                        {c.congelado_previsao_retorno && (
                          <span style={{ fontSize: '10px', color: '#64748b' }}>
                            · retorno previsto {new Date(c.congelado_previsao_retorno + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>{new Date(c.data_inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                  <td>
                    {(() => {
                      switch (c.tipo_cobranca) {
                        case 'partido_fixo':
                          return <span style={{backgroundColor: '#fffbeb', color: '#f59e0b', border: '1px solid #fcd34d', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap'}}>Partido Fixo</span>;
                        case 'mensal':
                          return <span style={{backgroundColor: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap'}}>Fechado (Mensal)</span>;
                        case 'etapas':
                          return <span style={{backgroundColor: '#f0fdf4', color: '#22c55e', border: '1px solid #bbf7d0', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap'}}>Fechado (Etapas)</span>;
                        case 'hibrido':
                          return <span style={{backgroundColor: '#faf5ff', color: '#a855f7', border: '1px solid #e9d5ff', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap'}}>Fechado (Híbrido)</span>;
                        default:
                          return <span style={{backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap'}}>Projeto Fechado</span>;
                      }
                    })()}
                  </td>
                  <td>
                    {c.tipo_cobranca === 'partido_fixo' ? (
                      <div style={{display: 'flex', flexDirection: 'column'}}>
                        <strong style={{color: 'var(--success)'}}>R$ {c.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        {(() => {
                           const ultReajuste = c.historico_valores && c.historico_valores.length > 0 ? c.historico_valores[c.historico_valores.length - 1] : null;
                           const dataExibicao = ultReajuste?.data_aplicacao || c.data_inicio;
                           return (
                             <span style={{fontSize: '10px', color: 'var(--text-muted)', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', width: 'fit-content', marginTop: '4px'}}>
                               Mensal desde {new Date(dataExibicao).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                             </span>
                           );
                        })()}
                      </div>
                    ) : (
                      <div style={{display: 'flex', flexDirection: 'column'}}>
                        <strong style={{color: 'var(--secondary)'}}>R$ {c.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>Total</span>
                      </div>
                    )}
                  </td>
                  <td style={{fontSize: '12px'}}>
                    {(() => {
                      const actives = c.contrato_atendentes?.filter(a => !a.data_fim) || [];
                      if (actives.length === 0) return <span style={{color: 'var(--text-muted)'}}>Sem alocação</span>;
                      return actives.map(a => `${a.profiles?.nome} (${a.percentual}%)`).join(', ');
                    })()}
                  </td>
                  <td>
                    <div style={{display: 'flex', gap: '6px'}}>
                      <button
                        className="btn btn-secondary"
                        style={{padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                        onClick={() => openEditModal(c)}
                        title="Editar Contrato"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: c.congelado ? '#e0f2fe' : '', borderColor: c.congelado ? '#7dd3fc' : '', color: c.congelado ? '#0369a1' : '' }}
                        onClick={() => openCongelarModal(c)}
                        title={c.congelado ? 'Gerenciar congelamento' : 'Congelar contrato'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                        onClick={() => openAllocModal(c)}
                        title="Alocação"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{color: 'var(--danger)', padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                        onClick={() => handleDeleteContrato(c.id)}
                        title="Excluir Contrato"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Alocação */}
      <div className={`modal-overlay ${allocModalState.isOpen ? 'active' : ''}`}>
        <div className="modal" style={{maxWidth: '800px', height: '90vh', display: 'flex', flexDirection: 'column'}}>
          <div className="modal-header" style={{flexShrink: 0}}>
            <h2>Divisão de Faturamento: {allocModalState.contrato?.titulo}</h2>
            <button className="close-modal" onClick={() => setAllocModalState({...allocModalState, isOpen: false})}>&times;</button>
          </div>
          <div className="modal-body" style={{overflowY: 'auto'}}>
            
            <form onSubmit={handleAddSplit} style={{backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--border)'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                <h3 style={{fontSize: '16px', color: 'var(--secondary)', margin: 0}}>Nova Regra de Divisão</h3>
              </div>
              
              <div className="form-group" style={{maxWidth: '200px'}}>
                <label>Válido a partir de:</label>
                <input type="date" className="form-control" value={splitForm.data_inicio} onChange={e => setSplitForm({...splitForm, data_inicio: e.target.value})} required />
              </div>

              <label>Distribuição (A soma deve ser 100%)</label>
              {splitForm.users.map((u, idx) => (
                <div key={u.id} style={{display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center'}}>
                  <div style={{flex: 2}}>
                    <select className="form-control" value={u.usuario_id} onChange={e => handleSplitUserChange(u.id, 'usuario_id', e.target.value)} required>
                      <option value="">Selecione um membro...</option>
                      {usuarios.map(user => <option key={user.id} value={user.id}>{user.nome}</option>)}
                    </select>
                  </div>
                  <div style={{flex: 1, position: 'relative'}}>
                    <input 
                      type="number" 
                      step="0.01" 
                      className="form-control" 
                      placeholder="%"
                      value={u.percentual} 
                      onChange={e => handleSplitUserChange(u.id, 'percentual', e.target.value)} 
                      required 
                    />
                  </div>
                  <div style={{width: '32px'}}>
                    {splitForm.users.length > 1 && (
                      <button type="button" onClick={() => removeSplitUserRow(u.id)} style={{background: 'none', border: 'none', color: 'var(--danger)', fontSize: '20px', cursor: 'pointer'}}>&times;</button>
                    )}
                  </div>
                </div>
              ))}
              
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px'}}>
                <button type="button" className="action-link" style={{border: 'none', background: 'none', fontWeight: 600}} onClick={addSplitUserRow}>
                  + Adicionar Pessoa
                </button>
                <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                  <span style={{fontWeight: 600, color: sumCurrentInput === 100 ? 'var(--success)' : 'var(--danger)'}}>
                    Soma: {sumCurrentInput}%
                  </span>
                  <button type="submit" className="btn btn-primary" disabled={sumCurrentInput !== 100}>Salvar Regra</button>
                </div>
              </div>
            </form>

            {rulesArray.length > 0 && (
              <div style={{marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px'}}>
                <h4 style={{fontSize: '13px', color: 'var(--secondary)', marginBottom: '12px'}}>Histórico de Regras de Alocação</h4>
                <div style={{display: 'flex', flexDirection: 'column'}}>
                  <div style={{marginLeft: '3px', borderLeft: '2px solid var(--border)', paddingLeft: '11px', marginTop: '4px', marginBottom: '4px'}}>
                    {rulesArray.map((rule, i) => (
                      <div key={rule.data_inicio} style={{fontSize: '12px', color: 'var(--text-main)', marginBottom: '12px', position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                        <div>
                          <span style={{position: 'absolute', left: '-16px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: rule.data_fim ? 'var(--border)' : 'var(--success)'}}></span>
                          <div style={{marginBottom: '4px'}}>
                            <strong>Vigência:</strong> a partir de {new Date(rule.data_inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} 
                            {rule.data_fim ? ` (até ${new Date(rule.data_fim).toLocaleDateString('pt-BR', { timeZone: 'UTC' })})` : ' (Ativo atualmente)'}
                          </div>
                          <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                            {rule.pessoas.map(p => (
                              <span key={p.id} style={{backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)'}}>
                                {p.profiles?.nome}: <strong style={{color: 'var(--success)'}}>{p.percentual}%</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveRule(rule.data_inicio)}
                          style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '0 4px', lineHeight: 1}}
                          title="Remover regra"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Modal Novo Contrato */}
      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`}>
        <div className="modal" style={{maxWidth: '700px'}}>
          <div className="modal-header">
            <h2>Novo Contrato</h2>
            <button className="close-modal" onClick={() => setIsModalOpen(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <form id="form-contrato" onSubmit={handleSaveContrato}>
              <h3 style={{marginBottom: '16px', fontSize: '16px', color: 'var(--secondary)'}}>1. Identificação</h3>
              
              <div className="form-group">
                <label>Modalidade</label>
                <select className="form-control" value={modalidade} onChange={e => setModalidade(e.target.value)} style={{backgroundColor: '#f0f9ff', borderColor: '#bae6fd'}}>
                  <option value="projeto_fechado">Projeto Fechado (Com Valor Total Definido)</option>
                  <option value="partido_fixo">Partido Fixo (Fee Mensal Contínuo)</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group" style={{flex: 2}}>
                  <label>Cliente</label>
                  <select className="form-control" value={clienteId} onChange={e => setClienteId(e.target.value)} required>
                    <option value="">Selecione um cliente...</option>
                    {clientes.map(cli => (
                      <option key={cli.id} value={cli.id}>{cli.apelido ? `${cli.apelido} - ${cli.nome}` : cli.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{flex: 2}}>
                  <label>Título do Serviço</label>
                  <input type="text" className="form-control" placeholder="Ex: Assessoria" value={titulo} onChange={e => setTitulo(e.target.value)} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Data de Início</label>
                  <input type="date" className="form-control" value={dataInicio} onChange={e => setDataInicio(e.target.value)} required />
                </div>
                {modalidade === 'projeto_fechado' ? (
                  <div className="form-group">
                    <label>Valor Total (R$)</label>
                    <input type="text" className="form-control" placeholder="Ex: 50000,00" value={valorTotal} onChange={e => setValorTotal(e.target.value)} required />
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Valor da Mensalidade (R$)</label>
                    <input type="text" className="form-control" placeholder="Ex: 5000,00" value={valorMensal} onChange={e => setValorMensal(e.target.value)} required />
                  </div>
                )}
              </div>

              <div className="form-group" style={{maxWidth: '260px', marginTop: '4px'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                  Retenção na fonte (%)
                  <span style={{fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400}}>opcional</span>
                </label>
                <input type="number" step="0.01" min="0" max="100" className="form-control" placeholder="Ex: 5" value={percentualRetencao} onChange={e => setPercentualRetencao(e.target.value)} />
                <span style={{fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'block'}}>NF no valor bruto, boleto descontado os impostos retidos</span>
              </div>

              <hr style={{border: 0, borderTop: '1px solid var(--border)', margin: '24px 0'}} />

              <h3 style={{marginBottom: '16px', fontSize: '16px', color: 'var(--secondary)'}}>2. Modelo de Cobrança</h3>
              
              {modalidade === 'projeto_fechado' && (
                <div className="form-group">
                  <label>Tipo de Cobrança</label>
                  <select className="form-control" value={tipoCobranca} onChange={e => setTipoCobranca(e.target.value)} required>
                    <option value="">Selecione...</option>
                    <option value="mensal">Mensal</option>
                    <option value="etapas">Por Etapas Concluídas</option>
                    <option value="hibrido">Híbrido</option>
                  </select>
                </div>
              )}
              
              {(modalidade === 'projeto_fechado' && (tipoCobranca === 'mensal' || tipoCobranca === 'hibrido')) && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Qtd. de Parcelas</label>
                    <input type="number" className="form-control" min="1" value={numParcelasMensais} onChange={e => setNumParcelasMensais(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Dia do Vencimento</label>
                    <input type="number" className="form-control" min="1" max="31" placeholder="Ex: 10" value={diaVencimento} onChange={e => setDiaVencimento(e.target.value)} required />
                  </div>
                </div>
              )}

              {modalidade === 'partido_fixo' && (
                <div className="form-row">
                  <div className="form-group" style={{flex: 1}}>
                    <label>Dia do Vencimento da Mensalidade</label>
                    <input type="number" className="form-control" min="1" max="31" placeholder="Ex: 10" value={diaVencimento} onChange={e => setDiaVencimento(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{flex: 1, display: 'flex', alignItems: 'center'}}>
                    <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, marginTop: '24px'}}>
                      <input type="checkbox" checked={cobrancaMesmoMes} onChange={e => setCobrancaMesmoMes(e.target.checked)} />
                      Cobrar no mesmo mês de prestação
                    </label>
                  </div>
                </div>
              )}
              
              {(modalidade === 'projeto_fechado' && (tipoCobranca === 'etapas' || tipoCobranca === 'hibrido')) && (
                <div className="form-group">
                  <label>Número de Etapas</label>
                  <input type="number" className="form-control" min="1" value={numEtapas} onChange={e => setNumEtapas(e.target.value)} required={tipoCobranca !== 'mensal'} />
                </div>
              )}

              {etapasForm.length > 0 && (
                <div style={{marginTop: '16px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)'}}>
                  <h4 style={{fontSize: '14px', color: 'var(--secondary)', marginBottom: '12px'}}>Projeção das Etapas</h4>
                  {etapasForm.map((etapa, idx) => (
                    <div key={etapa.id} className="form-row" style={{marginBottom: '8px'}}>
                      <div className="form-group" style={{flex: 2}}>
                        <label style={{fontSize: '12px'}}>Etapa {idx + 1} - Data Prevista</label>
                        <input type="date" className="form-control" value={etapa.data_vencimento} onChange={e => handleEtapaChange(idx, 'data_vencimento', e.target.value)} required />
                      </div>
                      <div className="form-group" style={{flex: 1}}>
                        <label style={{fontSize: '12px'}}>Valor (R$)</label>
                        <input type="number" step="0.01" className="form-control" value={etapa.valor} onChange={e => handleEtapaChange(idx, 'valor', e.target.value)} required />
                      </div>
                    </div>
                  ))}
                  
                  {(() => {
                     const totalEtapas = etapasForm.reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);
                     const valTotalNum = parseFloat(valorTotal.replace(/\./g, '').replace(',', '.')) || 0;
                     const isMatch = Math.abs(totalEtapas - valTotalNum) < 0.05;
                     
                     if (tipoCobranca === 'etapas') {
                       return (
                         <div style={{marginTop: '8px', fontSize: '12px', fontWeight: 600, color: isMatch ? 'var(--success)' : 'var(--danger)'}}>
                           Soma atual: R$ {totalEtapas.toLocaleString('pt-BR', {minimumFractionDigits: 2})} / Total do Projeto: R$ {valTotalNum.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                           {!isMatch && " (A soma das etapas deve ser igual ao total)"}
                         </div>
                       );
                     }
                     return null;
                  })()}
                </div>
              )}

              <hr style={{border: 0, borderTop: '1px solid var(--border)', margin: '24px 0'}} />

              <h3 style={{marginBottom: '16px', fontSize: '16px', color: 'var(--secondary)'}}>3. Prospecção</h3>
              <div className="form-group">
                <label>Haverá pagamento de prospecção?</label>
                <select className="form-control" value={temProspeccao} onChange={e => setTemProspeccao(e.target.value)}>
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </div>

              {temProspeccao === 'sim' && (
                <div style={{backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '16px'}}>
                  <div className="form-row">
                    <div className="form-group" style={{flex: 2}}>
                      <label>Membro da Equipe</label>
                      <select className="form-control" value={prospeccaoUsuarioId} onChange={e => setProspeccaoUsuarioId(e.target.value)} required>
                        <option value="">Selecione...</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{flex: 1}}>
                      <label>Valor (R$)</label>
                      <input type="text" className="form-control" placeholder="Ex: 1500,00" value={prospeccaoValor} onChange={e => setProspeccaoValor(e.target.value)} required />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Data Prevista de Pagamento</label>
                      <input type="date" className="form-control" value={prospeccaoData} onChange={e => setProspeccaoData(e.target.value)} required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Observação (Opcional)</label>
                    <textarea className="form-control" rows="2" placeholder="Ex: Pagamento após a primeira parcela..." value={prospeccaoObs} onChange={e => setProspeccaoObs(e.target.value)} />
                  </div>
                </div>
              )}
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</button>
            <button type="submit" form="form-contrato" className="btn btn-primary">Gerar Contrato</button>
          </div>
        </div>
      </div>

      {/* Modal Editar Contrato */}
      <div className={`modal-overlay ${editModalState.isOpen ? 'active' : ''}`}>
        <div className="modal" style={{maxWidth: '600px'}}>
          <div className="modal-header">
            <h2>Editar Contrato</h2>
            <button className="close-modal" onClick={() => setEditModalState({isOpen: false, contrato: null})}>&times;</button>
          </div>
          <div className="modal-body">
            <form id="form-edit-contrato" onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label>Cliente</label>
                <select className="form-control" value={editForm.cliente_id} onChange={e => setEditForm({...editForm, cliente_id: e.target.value})} required>
                  {clientes.map(cli => <option key={cli.id} value={cli.id}>{cli.apelido ? `${cli.apelido} - ${cli.nome}` : cli.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Serviço</label>
                <input type="text" className="form-control" value={editForm.titulo} onChange={e => setEditForm({...editForm, titulo: e.target.value})} required />
              </div>
              
              <div className="form-row">
                <div className="form-group" style={{flex: 1}}>
                  <label>Status</label>
                  <select className="form-control" value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                    <option value="Em andamento">Em andamento</option>
                    <option value="Finalizado">Finalizado</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>
                {(editForm.status === 'Finalizado' || editForm.status === 'Cancelado') && (
                  <div className="form-group" style={{flex: 1}}>
                    <label>Data de Fim</label>
                    <input type="date" className="form-control" value={editForm.data_fim} onChange={e => setEditForm({...editForm, data_fim: e.target.value})} required />
                  </div>
                )}
              </div>

              <div className="form-group" style={{backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '8px'}}>
                <label style={{color: 'var(--secondary)'}}>Valor {editModalState.contrato?.tipo_cobranca === 'partido_fixo' ? 'da Mensalidade (R$)' : 'Total do Projeto (R$)'}</label>
                <input type="text" className="form-control" value={editForm.valor_total} onChange={e => setEditForm({...editForm, valor_total: e.target.value})} required />
              </div>

              <div className="form-group" style={{maxWidth: '260px', marginTop: '8px'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                  Retenção na fonte (%)
                  <span style={{fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400}}>opcional</span>
                </label>
                <input type="number" step="0.01" min="0" max="100" className="form-control" value={editForm.percentual_retencao || '0'} onChange={e => setEditForm({...editForm, percentual_retencao: e.target.value})} />
                {parseFloat(editForm.percentual_retencao) > 0 && (
                  <span style={{fontSize: '11px', color: '#0369a1', marginTop: '3px', display: 'block'}}>
                    Boleto esperado: R$ {(parseFloat(editForm.valor_total.replace(/\./g,'').replace(',','.')) * (1 - parseFloat(editForm.percentual_retencao) / 100)).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                  </span>
                )}
              </div>

              {editModalState.contrato && parseFloat(editForm.valor_total.replace(/\./g, '').replace(',', '.')) !== editModalState.contrato.valor_total && (
                <div className="form-group" style={{backgroundColor: '#fffbeb', padding: '16px', borderRadius: '8px', border: '1px solid #fcd34d', marginTop: '16px'}}>
                  <label style={{color: '#d97706'}}>A partir de qual mês o novo valor será aplicado?</label>
                  <input type="month" className="form-control" value={editForm.data_aplicacao} onChange={e => setEditForm({...editForm, data_aplicacao: e.target.value})} required />
                  <span style={{fontSize: '11px', color: '#d97706', marginTop: '4px', display: 'block'}}>
                    ⚠️ As parcelas "Pendentes" com vencimento original a partir deste mês serão reajustadas automaticamente.
                  </span>
                </div>
              )}

              {editModalState.contrato?.tem_prospeccao && (
                <div className="form-group" style={{backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', border: '1px solid #fde68a', marginTop: '16px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                    <div>
                      <h4 style={{fontSize: '14px', color: '#b45309', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>
                        Comissão de Prospecção
                      </h4>
                      <p style={{margin: '0 0 4px 0', fontSize: '13px', color: '#92400e'}}>
                        <strong>Favorecido:</strong> {usuarios.find(u => u.id === editModalState.contrato?.prospeccao_usuario_id)?.nome || 'Não definido'}
                      </p>
                      <p style={{margin: '0 0 4px 0', fontSize: '13px', color: '#92400e'}}>
                        <strong>Valor:</strong> R$ {editModalState.contrato?.prospeccao_valor?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                      </p>
                      <p style={{margin: '0 0 4px 0', fontSize: '13px', color: '#92400e'}}>
                        <strong>Previsão de Pagamento:</strong> {editModalState.contrato?.prospeccao_data ? new Date(editModalState.contrato?.prospeccao_data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definida'}
                      </p>
                      {editModalState.contrato?.prospeccao_obs && (
                        <p style={{margin: '0', fontSize: '12px', color: '#92400e', fontStyle: 'italic'}}>
                          Obs: {editModalState.contrato?.prospeccao_obs}
                        </p>
                      )}
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
                      <span className={`badge ${editModalState.contrato?.prospeccao_status === 'Pago' ? 'badge-success' : 'badge-warning'}`} style={{marginBottom: '12px'}}>
                        {editModalState.contrato?.prospeccao_status === 'Pago' ? '✅ Pago' : '⏳ Pendente'}
                      </span>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{fontSize: '12px', padding: '6px 12px', backgroundColor: editModalState.contrato?.prospeccao_status === 'Pago' ? '#fff' : '#10b981', color: editModalState.contrato?.prospeccao_status === 'Pago' ? 'var(--text-main)' : '#fff', borderColor: editModalState.contrato?.prospeccao_status === 'Pago' ? 'var(--border)' : '#10b981'}}
                        onClick={handleToggleProspeccao}
                      >
                        {editModalState.contrato?.prospeccao_status === 'Pago' ? 'Desfazer Pagamento' : 'Marcar como Pago'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group" style={{marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px'}}>
                <label style={{color: 'var(--secondary)'}}>Notas e Observações</label>
                
                <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
                  <textarea 
                    className="form-control" 
                    rows="2" 
                    placeholder="Adicionar nova anotação (será salva com data e hora ao clicar em Salvar)..."
                    value={editForm.novaObservacao} 
                    onChange={e => setEditForm({...editForm, novaObservacao: e.target.value})}
                    style={{resize: 'vertical'}}
                  />
                </div>

                {editForm.historico_observacoes && editForm.historico_observacoes.length > 0 && (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)'}}>
                    {[...editForm.historico_observacoes].reverse().map((obs, i) => (
                      <div key={i} style={{paddingBottom: '8px', borderBottom: i !== editForm.historico_observacoes.length - 1 ? '1px solid #e2e8f0' : 'none'}}>
                        <div style={{fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px'}}>
                          {new Date(obs.data).toLocaleString('pt-BR')}
                        </div>
                        <div style={{fontSize: '13px', color: 'var(--text-main)', whiteSpace: 'pre-wrap'}}>
                          {obs.texto}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MENSAGEM PADRÃO DE COBRANÇA */}
              <div className="form-group" style={{marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px'}}>
                <label style={{color: 'var(--secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px'}}>
                  Mensagem Padrão de Cobrança
                </label>
                <textarea
                  className="form-control"
                  rows="5"
                  placeholder={`Ex: Olá {cliente}, segue a NF nº {nf} e o boleto nº {boleto} referente ao mês de {competencia}.\n\nValor: {valor} — Vencimento: {vencimento}.\n\nAtenciosamente,\nEquipe Newmark`}
                  value={editForm.mensagem_padrao}
                  onChange={e => setEditForm({...editForm, mensagem_padrao: e.target.value})}
                  style={{resize: 'vertical', fontSize: '13px', fontFamily: 'inherit'}}
                />
                <div style={{marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6}}>
                  Variáveis disponíveis:{' '}
                  {['{cliente}','{contrato}','{valor}','{vencimento}','{competencia}','{nf}','{boleto}'].map(v => (
                    <code key={v} style={{backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '3px', padding: '0 4px', marginRight: '4px', fontSize: '11px'}}>{v}</code>
                  ))}
                </div>
              </div>

              {/* PREVISÃO DE CONCLUSÃO */}
              <div className="form-group" style={{marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px', backgroundColor: '#fffbeb', borderRadius: '8px', padding: '16px', border: '1px solid #fde68a'}}>
                <label style={{color: '#92400e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px'}}>
                  📅 Previsão de Conclusão do Serviço
                </label>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                  <div>
                    <label className="form-label" style={{fontSize: '12px', color: '#92400e'}}>Data Prevista de Encerramento</label>
                    <input
                      type="date"
                      className="form-control"
                      value={editForm.previsao_conclusao}
                      onChange={e => setEditForm({...editForm, previsao_conclusao: e.target.value})}
                    />
                    {editForm.previsao_conclusao && (
                      <span style={{fontSize: '11px', color: '#b45309', marginTop: '4px', display: 'block'}}>
                        ⚠️ Ao salvar, parcelas pendentes após esta data serão removidas.
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="form-label" style={{fontSize: '12px', color: '#92400e'}}>Observação sobre o Término</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      placeholder="Ex: Cliente encerrou por restrição orçamentária, renovação prevista para..."
                      value={editForm.obs_termino}
                      onChange={e => setEditForm({...editForm, obs_termino: e.target.value})}
                      style={{resize: 'vertical', fontSize: '13px'}}
                    />
                  </div>
                </div>
                {editForm.previsao_conclusao && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{marginTop: '8px', fontSize: '12px', padding: '4px 12px', color: '#92400e'}}
                    onClick={() => setEditForm({...editForm, previsao_conclusao: '', obs_termino: ''})}
                  >
                    ✕ Remover Previsão de Conclusão
                  </button>
                )}
              </div>

              <div className="form-group" style={{marginTop: '16px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0}}>
                  <input type="checkbox" checked={editForm.arquivado} onChange={e => setEditForm({...editForm, arquivado: e.target.checked})} style={{width: '18px', height: '18px'}} />
                  <span style={{fontWeight: 600, color: 'var(--secondary)'}}>Arquivar Contrato</span>
                </label>
                <span style={{fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginLeft: '26px', marginTop: '4px'}}>
                  Contratos arquivados ficam ocultos da listagem principal para manter a tela limpa.
                </span>
              </div>

              {editModalState.contrato?.historico_valores && editModalState.contrato.historico_valores.length > 0 && (
                <div style={{marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px'}}>
                  <h4 style={{fontSize: '13px', color: 'var(--secondary)', marginBottom: '12px'}}>Histórico de Reajustes</h4>
                  <div style={{display: 'flex', flexDirection: 'column'}}>
                    <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                      <span style={{display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--border)', marginRight: '8px'}}></span>
                      Valor Original: <strong>R$ {editModalState.contrato.historico_valores[0]?.valor_antigo?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
                    </div>
                    <div style={{marginLeft: '3px', borderLeft: '2px solid var(--border)', paddingLeft: '11px', marginTop: '4px', marginBottom: '4px'}}>
                      {editModalState.contrato.historico_valores.map((h, i) => (
                        <div key={i} style={{fontSize: '12px', color: 'var(--text-main)', marginBottom: '8px', position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div>
                            <span style={{position: 'absolute', left: '-16px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)'}}></span>
                            Em {new Date(h.data_alteracao).toLocaleDateString('pt-BR')} ajustado p/: <strong>R$ {h.valor_novo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                            <span style={{color: 'var(--text-muted)', marginLeft: '4px'}}>(a partir de {h.data_aplicacao ? new Date(h.data_aplicacao).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '...'})</span>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => handleDeleteHistory(i)}
                            style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0 4px', lineHeight: 1}}
                            title="Remover reajuste"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" type="button" onClick={() => setEditModalState({isOpen: false, contrato: null})}>Cancelar</button>
            <button type="submit" form="form-edit-contrato" className="btn btn-primary">Salvar Alterações</button>
          </div>
        </div>
      </div>
      {/* Modal Congelar Contrato */}
      <div className={`modal-overlay ${congelarModal.open ? 'active' : ''}`}>
        <div className="modal" style={{ maxWidth: '460px' }}>
          <div className="modal-header">
            <h2>{congelarModal.contrato?.congelado ? '❄ Gerenciar Congelamento' : '❄ Congelar Contrato'}</h2>
            <button className="close-modal" onClick={() => setCongelarModal({ open: false, contrato: null })}>&times;</button>
          </div>
          <div className="modal-body">
            <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: 'var(--bg-dark)', borderRadius: '8px', fontSize: '13px' }}>
              <strong style={{ color: 'var(--secondary)' }}>{congelarModal.contrato?.clientes?.apelido || congelarModal.contrato?.clientes?.nome}</strong>
              <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{congelarModal.contrato?.titulo}</span>
            </div>

            {congelarModal.contrato?.congelado ? (
              <div>
                <div style={{ padding: '14px', backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '8px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0369a1', marginBottom: '8px' }}>❄ Contrato congelado</div>
                  <div style={{ fontSize: '13px', color: '#0369a1' }}>
                    <div>Desde: <strong>{congelarModal.contrato.congelado_desde ? new Date(congelarModal.contrato.congelado_desde + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</strong></div>
                    {congelarModal.contrato.congelado_previsao_retorno && (
                      <div style={{ marginTop: '4px' }}>Previsão de retorno: <strong>{new Date(congelarModal.contrato.congelado_previsao_retorno + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></div>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                  Descongelar vai restaurar todas as parcelas congeladas para status "Pendente". Você poderá emitir parcelas pontuais sem descongelar clicando nelas no módulo de Parcelas.
                </p>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', backgroundColor: '#0369a1', borderColor: '#0369a1' }}
                  onClick={handleDescongelar}
                  disabled={congelarSaving}
                >
                  {congelarSaving ? 'Processando...' : 'Descongelar Contrato'}
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                  As parcelas pendentes a partir da data escolhida serão marcadas como <strong>Congeladas</strong> e não entrarão nos totais. Você pode emiti-las pontualmente sem reabrir o contrato.
                </p>
                <div className="form-group">
                  <label>Congelar a partir de</label>
                  <input
                    type="date"
                    className="form-control"
                    value={congelarForm.desde}
                    onChange={e => setCongelarForm({ ...congelarForm, desde: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Perspectiva de retorno
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span>
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    value={congelarForm.previsao_retorno}
                    onChange={e => setCongelarForm({ ...congelarForm, previsao_retorno: e.target.value })}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', backgroundColor: '#0369a1', borderColor: '#0369a1' }}
                  onClick={handleCongelar}
                  disabled={congelarSaving || !congelarForm.desde}
                >
                  {congelarSaving ? 'Congelando...' : 'Confirmar Congelamento'}
                </button>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setCongelarModal({ open: false, contrato: null })}>Fechar</button>
          </div>
        </div>
      </div>

    </section>
  );
}
