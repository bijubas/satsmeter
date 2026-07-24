import { useRef } from 'react';
import type { Evento, EventoTipo } from '../types';
import { fmtInt, fmtHora, nf } from '../format';

const EV_STYLE: Record<EventoTipo, { c: string; s: string; sc: string; bg: string }> = {
  'Liquidação': { c: '#f7931a', s: 'Confirmado', sc: '#1f7a45', bg: 'rgba(31,157,87,.12)' },
  'Religa': { c: '#2f6bff', s: 'Religado', sc: '#2451c9', bg: 'rgba(47,107,255,.12)' },
  'Corte': { c: '#e0533d', s: 'Cortado', sc: '#c23b26', bg: 'rgba(224,83,61,.12)' },
};

interface Props {
  eventos: Evento[]; // já vem mais recente primeiro
}

/** SM-Extrato — tabela de eventos reais (versão curta 1b: 5 primeiras linhas). */
export function SMExtrato({ eventos }: Props) {
  const prevTopo = useRef(0);
  const linhas = eventos.slice(0, 5);
  const topo = linhas.length ? linhas[0].id : 0;
  const animar = topo !== prevTopo.current;
  prevTopo.current = topo;

  return (
    <div className="card extrato">
      <div className="ext-head">
        <span className="ext-title">Extrato · últimos eventos</span>
        <span className="ext-live"><span className="dot dot-green" />ao vivo</span>
      </div>
      <div className="ext-grid ext-colhead">
        <span>Hora</span>
        <span>Evento</span>
        <span className="text-right">Energia</span>
        <span className="text-right">Sats</span>
        <span className="text-right">Status</span>
      </div>
      {linhas.length === 0 ? (
        <div className="ext-empty">aguardando leituras do medidor…</div>
      ) : (
        linhas.map((e, i) => {
          const st = EV_STYLE[e.tipo] ?? EV_STYLE['Liquidação'];
          const isLiq = e.tipo === 'Liquidação';
          const kwh = isLiq ? nf(2).format(e.wh / 1000) + ' kWh' : '—';
          const sats = isLiq ? '+' + fmtInt(e.sats) : '—';
          const enter = i === 0 && animar ? ' enter' : '';
          return (
            <div className={`ext-grid ext-row${enter}`} key={e.id}>
              <span className="ext-time">{fmtHora(e.ts)}</span>
              <span className="ext-evento">
                <span className="dot" style={{ background: st.c }} />
                <span className="ext-tipo">{e.tipo}</span>
                <span className="ext-casa">#{e.casa}</span>
              </span>
              <span className="ext-kwh">{kwh}</span>
              <span className="ext-sats">{sats}</span>
              <span className="ext-status" style={{ color: st.sc, background: st.bg }}>{st.s}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
