"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getPersonColor } from '@/lib/personColors';

const SLOT_H = 40;     // px por slot de 30min
const START_H = 7;     // 07:00
const END_H = 22;      // 22:00
const SLOTS = (END_H - START_H) * 2;
const TOTAL_H = SLOTS * SLOT_H; // 1200px

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function toStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fromMins(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export default function AgendaModule({ permissao = 'ver_tudo', userId = null }) {
  const verProprio = permissao === 'ver_proprio';
  const [myId, setMyId] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [alocados, setAlocados] = useState(new Set());
  const [eventos, setEventos] = useState([]);
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  const [modal, setModal] = useState({ open: false, id: null });
  const [form, setForm] = useState({
    data: '', hi: '09:00', hf: '10:00', cliente_id: '',
    assunto: '', repetir: false, freq: 'semanal', confirmado: false,
  });
  const [icalUrl, setIcalUrl] = useState(null);
  const [icalCopied, setIcalCopied] = useState(false);

  // Init: pega usuário logado, lista de usuários e clientes
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) { setMyId(user.id); setViewId(userId || user.id); }

      const [{ data: us }, { data: cs }] = await Promise.all([
        supabase.from('profiles').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('clientes').select('id, apelido, nome').in('status', ['Ativo', 'Prospect']).order('apelido'),
      ]);
      if (us) setUsuarios(us);
      if (cs) setClientes(cs);
    })();
  }, []);

  // Scroll para 8h ao montar
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - START_H) * 2 * SLOT_H;
    }
  }, []);

  // Busca clientes alocados ao usuário sendo visualizado
  useEffect(() => {
    if (!viewId) return;
    supabase
      .from('contrato_atendentes')
      .select('contratos(cliente_id)')
      .eq('usuario_id', viewId)
      .is('data_fim', null)
      .then(({ data }) => {
        if (data) setAlocados(new Set(data.map(r => r.contratos?.cliente_id).filter(Boolean)));
      });
  }, [viewId]);

  // Busca eventos da semana visualizada
  const fetchEventos = useCallback(async () => {
    if (!viewId) return;
    setLoading(true);
    const end = new Date(week);
    end.setDate(end.getDate() + 6);
    const { data } = await supabase
      .from('agenda')
      .select('*, clientes(apelido, nome)')
      .eq('usuario_id', viewId)
      .gte('data', toStr(week))
      .lte('data', toStr(end))
      .order('hora_inicio');
    if (data) setEventos(data);
    setLoading(false);
  }, [viewId, week]);

  useEffect(() => { fetchEventos(); }, [fetchEventos]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week);
    d.setDate(d.getDate() + i);
    return d;
  });
  const todayStr = toStr(new Date());

  // Clientes ordenados: alocados primeiro
  const clientesSorted = [
    ...clientes.filter(c => alocados.has(c.id)),
    ...clientes.filter(c => !alocados.has(c.id)),
  ];

  function openNew(data, hi) {
    const hfMins = Math.min(toMins(hi) + 60, END_H * 60);
    setForm({ data, hi, hf: fromMins(hfMins), cliente_id: '', assunto: '', repetir: false, freq: 'semanal', confirmado: false });
    setModal({ open: true, id: null });
  }

  function openEdit(ev) {
    setForm({
      data: ev.data,
      hi: ev.hora_inicio.slice(0, 5),
      hf: ev.hora_fim.slice(0, 5),
      cliente_id: ev.cliente_id || '',
      assunto: ev.assunto || '',
      repetir: false,
      freq: 'semanal',
      confirmado: ev.confirmado || false,
    });
    setModal({ open: true, id: ev.id });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (toMins(form.hf) <= toMins(form.hi)) {
      alert('Horário de fim deve ser depois do início.');
      return;
    }
    const base = {
      usuario_id: viewId,
      cliente_id: form.cliente_id || null,
      assunto: form.assunto.trim() || null,
      data: form.data,
      hora_inicio: form.hi,
      hora_fim: form.hf,
      confirmado: form.confirmado,
    };

    if (modal.id) {
      const { error } = await supabase.from('agenda').update(base).eq('id', modal.id);
      if (error) { alert('Erro: ' + error.message); return; }
    } else if (form.repetir) {
      const grupoId = crypto.randomUUID();
      const stepDays = { semanal: 7, quinzenal: 14, mensal: 28 }[form.freq] || 7;
      const rows = [];
      let d = new Date(form.data + 'T12:00:00');
      for (let i = 0; i < 12; i++) {
        rows.push({ ...base, data: toStr(d), grupo_repeticao: grupoId });
        d.setDate(d.getDate() + stepDays);
      }
      const { error } = await supabase.from('agenda').insert(rows);
      if (error) { alert('Erro: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('agenda').insert([base]);
      if (error) { alert('Erro: ' + error.message); return; }
    }

    setModal({ open: false, id: null });
    fetchEventos();
  }

  async function handleDelete() {
    if (!confirm('Excluir este compromisso?')) return;
    await supabase.from('agenda').delete().eq('id', modal.id);
    setModal({ open: false, id: null });
    fetchEventos();
  }

  async function handleToggleConfirmado(e, ev) {
    e.stopPropagation();
    const novo = !ev.confirmado;
    // atualiza local imediatamente
    setEventos(prev => prev.map(x => x.id === ev.id ? { ...x, confirmado: novo } : x));
    await supabase.from('agenda').update({ confirmado: novo }).eq('id', ev.id);
  }

  // Clique na coluna do dia → calcula horário pelo Y
  function handleColClick(e, dayStr) {
    if (e.target.closest('[data-ev]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slotIdx = Math.max(0, Math.min(SLOTS - 2, Math.floor(y / SLOT_H)));
    openNew(dayStr, fromMins(START_H * 60 + slotIdx * 30));
  }

  // Agrupa eventos por dia
  const evsByDay = {};
  eventos.forEach(ev => {
    if (!evsByDay[ev.data]) evsByDay[ev.data] = [];
    evsByDay[ev.data].push(ev);
  });

  // Labels de hora
  const timeLabels = Array.from({ length: END_H - START_H }, (_, i) => ({
    label: `${String(START_H + i).padStart(2, '0')}:00`,
    top: i * SLOT_H * 2,
  }));

  const prevWeek = () => setWeek(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; });
  const nextWeek = () => setWeek(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; });
  const goToday  = () => setWeek(weekStart(new Date()));

  async function handleGetIcalLink() {
    if (icalUrl) { setIcalUrl(null); return; }
    const { data } = await supabase.from('profiles').select('ical_token').eq('id', myId).single();
    if (!data?.ical_token) { alert('Não foi possível gerar o link. Rode a migration SQL.'); return; }
    const base = window.location.origin;
    setIcalUrl(`${base}/api/agenda/ical?userId=${myId}&token=${data.ical_token}`);
  }

  async function handleCopyIcal() {
    if (!icalUrl) return;
    await navigator.clipboard.writeText(icalUrl);
    setIcalCopied(true);
    setTimeout(() => setIcalCopied(false), 2000);
  }

  return (
    <section className="content-area active" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 0 14px', flexShrink: 0 }}>
        {verProprio ? (
          <span style={{ fontWeight: 600, color: 'var(--secondary)', fontSize: '14px', width: '185px' }}>
            ★ Minha agenda
          </span>
        ) : (
          <select
            className="form-control"
            style={{ width: '185px' }}
            value={viewId || ''}
            onChange={e => setViewId(e.target.value)}
          >
            {usuarios.map(u => (
              <option key={u.id} value={u.id}>
                {u.id === myId ? `★ ${u.nome}` : u.nome}
              </option>
            ))}
          </select>
        )}

        <button className="btn btn-secondary" style={{ padding: '6px 11px', fontSize: '18px', lineHeight: 1 }} onClick={prevWeek}>‹</button>
        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={goToday}>Hoje</button>
        <button className="btn btn-secondary" style={{ padding: '6px 11px', fontSize: '18px', lineHeight: 1 }} onClick={nextWeek}>›</button>

        <span style={{ fontWeight: 600, color: 'var(--secondary)', fontSize: '14px', marginLeft: '4px' }}>
          {days[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} –{' '}
          {days[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>

        <button className="btn btn-primary" style={{ marginLeft: 'auto', padding: '6px 14px' }}
          onClick={() => openNew(todayStr, '09:00')}>
          + Novo
        </button>
        <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '13px' }}
          onClick={handleGetIcalLink}
          title="Sincronizar com iPhone / Outlook">
          📅
        </button>
      </div>

      {/* Painel iCal */}
      {icalUrl && (
        <div style={{ marginBottom: '12px', padding: '10px 12px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1', marginBottom: '3px' }}>Link iCal — cole no iPhone (Calendário → Contas → Outro → Calendário com assinatura) ou no Outlook (Adicionar calendário → Assinar pela internet)</div>
            <div style={{ fontSize: '11px', color: '#0c4a6e', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{icalUrl}</div>
          </div>
          <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: '12px', flexShrink: 0 }} onClick={handleCopyIcal}>
            {icalCopied ? '✓ Copiado!' : 'Copiar link'}
          </button>
        </div>
      )}

      {/* ── Calendário ── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* Cabeçalho dos dias — sticky */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', backgroundColor: '#f8fafc', flexShrink: 0 }}>
          <div style={{ width: 50, flexShrink: 0 }} />
          {days.map((day, i) => {
            const ds = toStr(day);
            const isToday = ds === todayStr;
            return (
              <div key={i} style={{ flex: 1, minWidth: 80, textAlign: 'center', padding: '6px 4px', borderLeft: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {DIAS[i]}
                </div>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', margin: '2px auto 0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isToday ? 'var(--secondary)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--text-main)',
                  fontWeight: isToday ? 700 : 500, fontSize: '14px',
                }}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Corpo scrollável */}
        <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', position: 'relative' }}>

            {/* Coluna de horários */}
            <div style={{ width: 50, flexShrink: 0, position: 'relative', height: TOTAL_H }}>
              {timeLabels.map(({ label, top }) => (
                <div key={label} style={{
                  position: 'absolute', top: top - 7, right: 6,
                  fontSize: '10px', color: '#94a3b8', lineHeight: 1,
                  userSelect: 'none', whiteSpace: 'nowrap',
                }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Colunas dos dias */}
            {days.map((day, i) => {
              const ds = toStr(day);
              const dayEvs = evsByDay[ds] || [];
              const isToday = ds === todayStr;

              return (
                <div
                  key={i}
                  style={{
                    flex: 1, minWidth: 80,
                    height: TOTAL_H,
                    position: 'relative',
                    borderLeft: '1px solid var(--border)',
                    backgroundColor: isToday ? '#f0f7ff' : '#fff',
                    cursor: 'pointer',
                    backgroundImage: `repeating-linear-gradient(
                      to bottom,
                      transparent,
                      transparent ${SLOT_H - 1}px,
                      ${isToday ? '#dbeafe' : '#f1f5f9'} ${SLOT_H - 1}px,
                      ${isToday ? '#dbeafe' : '#f1f5f9'} ${SLOT_H}px
                    )`,
                  }}
                  onClick={e => handleColClick(e, ds)}
                >
                  {/* Linhas de hora cheia (mais escuras) */}
                  {timeLabels.map(({ top }) => (
                    <div key={top} style={{
                      position: 'absolute', top, left: 0, right: 0,
                      borderTop: `1px solid ${isToday ? '#bfdbfe' : '#e2e8f0'}`,
                      pointerEvents: 'none',
                    }} />
                  ))}

                  {/* Eventos */}
                  {dayEvs.map(ev => {
                    const startMins = toMins(ev.hora_inicio.slice(0, 5));
                    const endMins = toMins(ev.hora_fim.slice(0, 5));
                    const top = ((startMins - START_H * 60) / 30) * SLOT_H;
                    const height = Math.max(((endMins - startMins) / 30) * SLOT_H - 2, 22);
                    const color = getPersonColor(ev.clientes?.apelido || ev.clientes?.nome || ev.cliente_id || 'default');
                    const label = ev.assunto || ev.clientes?.apelido || ev.clientes?.nome || '';

                    return (
                      <div
                        key={ev.id}
                        data-ev="1"
                        onClick={e => { e.stopPropagation(); openEdit(ev); }}
                        title={`${ev.hora_inicio.slice(0,5)}–${ev.hora_fim.slice(0,5)}${label ? ' · ' + label : ''}`}
                        style={{
                          position: 'absolute',
                          top: top + 1,
                          left: 2, right: 2,
                          height,
                          backgroundColor: color.bg,
                          border: `1px solid ${color.border}`,
                          borderLeft: `3px solid ${color.border}`,
                          borderRadius: '4px',
                          padding: '2px 5px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          zIndex: 5,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                          opacity: ev.confirmado ? 1 : 0.88,
                        }}
                      >
                        {/* Checkbox de confirmação */}
                        <input
                          type="checkbox"
                          checked={ev.confirmado}
                          data-ev="1"
                          onClick={e => handleToggleConfirmado(e, ev)}
                          onChange={() => {}}
                          title={ev.confirmado ? 'Realizado' : 'Marcar como realizado'}
                          style={{
                            position: 'absolute', top: 3, right: 3,
                            width: 11, height: 11,
                            cursor: 'pointer', accentColor: color.border,
                            zIndex: 6,
                          }}
                        />
                        <div style={{ fontSize: '10px', fontWeight: 700, color: color.text, lineHeight: 1.3, paddingRight: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.hora_inicio.slice(0, 5)}{label ? ` ${label}` : ''}
                        </div>
                        {height > 30 && ev.clientes && ev.assunto && (
                          <div style={{ fontSize: '10px', color: color.text, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ev.clientes.apelido || ev.clientes.nome}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Modal ── */}
      <div className={`modal-overlay ${modal.open ? 'active' : ''}`}>
        <div className="modal" style={{ maxWidth: '440px' }}>
          <div className="modal-header">
            <h2>{modal.id ? 'Editar Compromisso' : 'Novo Compromisso'}</h2>
            <button className="close-modal" onClick={() => setModal({ open: false, id: null })}>&times;</button>
          </div>
          <div className="modal-body">
            <form id="form-agenda" onSubmit={handleSave}>

              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Data</label>
                  <input type="date" className="form-control"
                    value={form.data}
                    onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                    required />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Início</label>
                  <input type="time" className="form-control"
                    value={form.hi}
                    onChange={e => setForm(f => ({ ...f, hi: e.target.value }))}
                    required />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Fim</label>
                  <input type="time" className="form-control"
                    value={form.hf}
                    onChange={e => setForm(f => ({ ...f, hf: e.target.value }))}
                    required />
                </div>
              </div>

              <div className="form-group">
                <label>Cliente <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '11px' }}>— opcional</span></label>
                <select className="form-control" value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}>
                  <option value="">Sem cliente específico</option>
                  {alocados.size > 0 && (
                    <optgroup label="Meus clientes">
                      {clientesSorted.filter(c => alocados.has(c.id)).map(c => (
                        <option key={c.id} value={c.id}>{c.apelido || c.nome}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={alocados.size > 0 ? 'Outros clientes' : 'Clientes'}>
                    {clientesSorted.filter(c => !alocados.has(c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.apelido || c.nome}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="form-group">
                <label>Assunto <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '11px' }}>— opcional</span></label>
                <input type="text" className="form-control"
                  placeholder="Ex: Reunião mensal, Entrega relatório..."
                  value={form.assunto}
                  onChange={e => setForm(f => ({ ...f, assunto: e.target.value }))} />
              </div>

              {/* Recorrência — só na criação */}
              {!modal.id && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 400 }}>
                    <input type="checkbox" checked={form.repetir} onChange={e => setForm(f => ({ ...f, repetir: e.target.checked }))} />
                    Compromisso recorrente
                  </label>
                  {form.repetir && (
                    <select className="form-control" style={{ marginTop: '8px' }} value={form.freq} onChange={e => setForm(f => ({ ...f, freq: e.target.value }))}>
                      <option value="semanal">Toda semana (12 semanas)</option>
                      <option value="quinzenal">A cada 2 semanas (6 meses)</option>
                      <option value="mensal">Todo mês (12 meses)</option>
                    </select>
                  )}
                </div>
              )}

              {/* Confirmar — só na edição */}
              {modal.id && (
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                  padding: '10px 12px', borderRadius: '6px', marginTop: '4px',
                  backgroundColor: form.confirmado ? '#f0fdf4' : '#f8fafc',
                  border: `1px solid ${form.confirmado ? '#86efac' : 'var(--border)'}`,
                }}>
                  <input type="checkbox" checked={form.confirmado} onChange={e => setForm(f => ({ ...f, confirmado: e.target.checked }))} />
                  <span style={{ fontWeight: 600, color: form.confirmado ? '#15803d' : 'var(--text-muted)' }}>
                    {form.confirmado ? '✓ Compromisso realizado' : 'Marcar como realizado'}
                  </span>
                </label>
              )}

            </form>
          </div>
          <div className="modal-footer">
            {modal.id && (
              <button type="button" className="btn btn-secondary"
                style={{ color: '#ef4444', marginRight: 'auto' }}
                onClick={handleDelete}>
                Excluir
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setModal({ open: false, id: null })}>Cancelar</button>
            <button type="submit" form="form-agenda" className="btn btn-primary">
              {modal.id ? 'Salvar' : form.repetir ? `Criar ${form.freq === 'semanal' ? '12x' : form.freq === 'quinzenal' ? '12x' : '12x'}` : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
