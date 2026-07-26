import { useMemo, useState } from 'react';
import { SMKpi } from './components/SMKpi';
import { SMLine } from './components/SMLine';
import { SMCompare } from './components/SMCompare';
import { SMExtrato } from './components/SMExtrato';
import { SMCarteira } from './components/SMCarteira';
import { DEFAULT_ASSUMPTIONS, projetar } from './projection';
import { useLiveMetrics, useRegras } from './useLiveMetrics';
import { fmtInt, fmtSatsC, fmtBRL, fmtEnergia, nf } from './format';
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
  const regras = useRegras();
  const kwhArr = metrics.serie.map((p) => p.kwh);
  const satsArr = metrics.serie.map((p) => p.sats);
  const lastKwh = kwhArr.length ? kwhArr[kwhArr.length - 1] : 0;
  const lastSats = satsArr.length ? satsArr[satsArr.length - 1] : 0;
  const nota = NOTA[status];

  // KPIs medidos (não projetados). A cotação do slider só converte sats em BRL.
  const energia = fmtEnergia(metrics.energiaKwh);

  // "Sats ao produtor" mostra a CUSTÓDIA (saldo real da carteira LNbits), não o
  // contábil do ledger. Sem LNbits acessível, cai no contábil e avisa no subtítulo.
  const custodia = metrics.lightning?.produtorSats ?? null;
  const satsProdutor = custodia ?? metrics.satsTotal;
  const valorBrl = satsProdutor / (1e8 / assumptions.cotacao);
  const subProdutor =
    custodia === null
      ? `≈ ${fmtBRL(valorBrl)} · contábil (sem LNbits)`
      : `≈ ${fmtBRL(valorBrl)} · custódia LNbits${metrics.lightning?.online ? '' : ' (offline)'}`;
  const subLiq = metrics.liqTotal
    ? `${nf(1).format(metrics.liqPorMin)}/min · ${fmtInt(metrics.casasAtivas)} casa(s) ativa(s)`
    : 'aguardando o medidor…';
  const subEnergia = regras.whPorLiq
    ? `liquidada a cada ${nf(3).format(regras.whPorLiq)} Wh`
    : 'medida pelo INA219';

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
            <SMKpi label="Microliquidações" value={fmtInt(metrics.liqTotal)} unit="liquid." sub={subLiq} accent="#f7931a" />
            <SMKpi label="Sats ao produtor" value={fmtSatsC(satsProdutor)} unit="sats" sub={subProdutor} accent="#7b61ff" />
            <SMKpi label="Energia liquidada" value={energia.valor} unit={energia.unidade} sub={subEnergia} accent="#1f9d57" />
            <SMKpi label="Cortes / religas" value={`${fmtInt(metrics.cortes)} / ${fmtInt(metrics.religas)}`} unit="auto" sub="acionados sem intervenção" accent="#2f6bff" />
          </div>
        </section>

        {/* Carteira real: saldo, relé e recusas por casa */}
        <SMCarteira casas={metrics.casas} carencia={regras.carenciaLeituras} lightning={metrics.lightning} />

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
