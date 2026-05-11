import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function esc(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Converte data local (Brasília UTC-3) para UTC no formato iCal
function toUtc(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m] = timeStr.split(':').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h + 3, m));
  return [
    String(dt.getUTCFullYear()),
    String(dt.getUTCMonth() + 1).padStart(2, '0'),
    String(dt.getUTCDate()).padStart(2, '0'),
    'T',
    String(dt.getUTCHours()).padStart(2, '0'),
    String(dt.getUTCMinutes()).padStart(2, '0'),
    '00Z',
  ].join('');
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const token  = searchParams.get('token');

  if (!userId || !token) {
    return new Response('Parâmetros inválidos', { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('ical_token, nome')
    .eq('id', userId)
    .single();

  if (!profile || String(profile.ical_token) !== String(token)) {
    return new Response('Token inválido', { status: 401 });
  }

  // Últimos 30 dias + todos os futuros
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split('T')[0];

  const { data: eventos } = await supabaseAdmin
    .from('agenda')
    .select('*, clientes(apelido, nome)')
    .eq('usuario_id', userId)
    .gte('data', sinceStr)
    .order('data')
    .order('hora_inicio');

  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Newmark//Agenda//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Newmark - ${profile.nome}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  for (const ev of (eventos || [])) {
    const clienteNome = ev.clientes?.apelido || ev.clientes?.nome || '';
    const summary     = ev.assunto || clienteNome || 'Compromisso';
    const description = [ev.assunto, clienteNome].filter(Boolean).join(' — ');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@newmark-agenda`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${toUtc(ev.data, ev.hora_inicio.slice(0, 5))}`);
    lines.push(`DTEND:${toUtc(ev.data, ev.hora_fim.slice(0, 5))}`);
    lines.push(`SUMMARY:${esc(summary)}`);
    if (description) lines.push(`DESCRIPTION:${esc(description)}`);
    lines.push(`STATUS:${ev.confirmado ? 'CONFIRMED' : 'TENTATIVE'}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
