import { useMemo, useState } from 'react';
import { SMKpi } from './components/SMKpi';
import { SMLine } from './components/SMLine';
import { SMCompare } from './components/SMCompare';
import { SMExtrato } from './components/SMExtrato';
import { DEFAULT_ASSUMPTIONS, projetar } from './projection';
import { useLiveMetrics } from './useLiveMetrics';
import { fmtInt, fmtSatsC, nf } from './format';
import type { Assumptions } from './types';

const NOTA: Record<string, { txt: string; cls: string }> = {
  conectando: { txt: 'conectando ao backend…', cls: 'conn-note' },
  online: { txt: 'conectado ao backend · tempo real ativo', cls: 'conn-note ok' },
  offline: { txt: 'backend offline · reconectando…', cls: 'conn-note off' },
};

export default function App() {
  // projeção do pitch (client-side, sliders ao vivo)
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const proj = useMemo(() => projetar(assumptions), [assumptions]);
  const onChange = (key: keyof Assumptions, value: number) =>
    setAssumptions((a) => ({ ...a, [key]: value }));

  // dados reais (WebSocket)
  const { metrics, status } = useLiveMetrics();
  const kwhArr = metrics.serie.map((p) => p.kwh);
  const satsArr = metrics.serie.map((p) => p.sats);
  const lastKwh = kwhArr.length ? kwhArr[kwhArr.length - 1] : 0;
  const lastSats = satsArr.length ? satsArr[satsArr.length - 1] : 0;
  const nota = NOTA[status];

  return (
    <main className="page">
      <div className="sm-shell">
        {/* Topbar */}
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">₿</span>
            <span className="brand-name">SatsMeter</span>
            <span className="brand-sub">Cobrança automática de energia em Lightning</span>
          </div>
          <span className="live-badge">
            <span className={'dot ' + (status === 'online' ? 'dot-green' : 'off')} />
            {fmtInt(metrics.liqPorMin)}&nbsp;liquidações/min
          </span>
        </header>

        {/* Hero: comparativo + KPIs */}
        <section className="hero">
          <SMCompare assumptions={assumptions} proj={proj} onChange={onChange} />
          <div className="kpi-col">
            <SMKpi label="Microliquidações" value={proj.kpiLiq} unit="liquid." sub={proj.subLiq} accent="#f7931a" />
            <SMKpi label="Sats movimentados" value={proj.kpiSats} unit="sats" sub={proj.subSats} accent="#7b61ff" />
            <SMKpi label="Energia liquidada" value={proj.kpiEnergia} unit="kWh" sub={proj.subEnergia} accent="#1f9d57" />
            <SMKpi label="Cortes / religas" value={proj.kpiCortes} unit="auto" sub={proj.subCortes} accent="#2f6bff" />
          </div>
        </section>

        {/* Faixa inferior: 2 séries reais + extrato real */}
        <section className="bottom">
          <SMLine
            title="CONSUMO ACUMULADO" color="#f7931a" fillId="k1b" unit="kWh"
            valueLabel={lastKwh >= 100 ? fmtInt(lastKwh) : nf(2).format(lastKwh)}
            sub="acumulado · tempo real" points={kwhArr}
          />
          <SMLine
            title="SATS AO PRODUTOR" color="#7b61ff" fillId="s1b" unit="sats"
            valueLabel={fmtSatsC(lastSats)} sub="transferido ao produtor" points={satsArr}
          />
          <SMExtrato eventos={metrics.eventos} />
        </section>
      </div>
      <p className={nota.cls}>{nota.txt}</p>
    </main>
  );
}
