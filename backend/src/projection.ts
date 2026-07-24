/**
 * Projeção do pitch — reprodução fiel do renderVals() do arquivo de design
 * (design_handoff_satsmeter_dashboard/design/SatsMeter Dashboard.dc.html).
 *
 * É a "fonte de verdade" dos cálculos do gráfico comparativo e dos KPIs de
 * projeção. O mesmo cálculo é espelhado no front (public/app.js) para os
 * sliders atualizarem ao vivo sem round-trip; aqui fica exposto via /api/projection
 * para consumidores de API e para manter uma referência canônica no backend.
 */

export interface Assumptions {
  cotacao: number;
  casas: number;
  dias: number;
  whLiq: number;
  kwhDia: number;
  precoKwh: number;
  custoBoleto: number;
  pspMensal: number;
  pspFixo: number;
  pspPct: number;
  lnFee: number;
  lnPct: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  cotacao: 380000, casas: 50, dias: 30, whLiq: 100, kwhDia: 8, precoKwh: 0.8,
  custoBoleto: 3.5, pspMensal: 99, pspFixo: 0.39, pspPct: 3.99, lnFee: 1, lnPct: 0.1,
};

const nf = (d = 0) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = (n: number) => nf(0).format(Math.round(n));
const fmtBRL = (n: number, d = 2) => 'R$ ' + nf(d).format(n);
const fmtSatsC = (n: number) => {
  if (n >= 1e6) return nf(2).format(n / 1e6) + ' M';
  if (n >= 1e3) return nf(1).format(n / 1e3) + ' k';
  return fmtInt(n);
};

export function projetar(a: Assumptions) {
  const satsPorBrl = 1e8 / a.cotacao;
  const liquN = (a.casas * a.dias * a.kwhDia * 1000) / a.whLiq;
  const energia = a.casas * a.dias * a.kwhDia;
  const valorTotal = energia * a.precoKwh;
  const satsMov = valorTotal * satsPorBrl;
  const valorPorLiq = valorTotal / liquN;
  const cortes = Math.max(1, Math.round(a.casas * a.dias * 0.006));
  const religas = Math.max(0, Math.round(cortes * 0.92));
  const liqPorMin = fmtInt(Math.max(1, liquN / (a.dias * 24 * 60)));

  // comparativo de custo (cadência real por microliquidação)
  const custoBoleto = liquN * a.custoBoleto;
  const custoPsp = liquN * (a.pspFixo + (valorPorLiq * a.pspPct) / 100) + a.pspMensal * (a.dias / 30);
  const custoLn = liquN * (a.lnFee / satsPorBrl + (valorPorLiq * a.lnPct) / 100);
  const maxC = Math.max(custoBoleto, custoPsp, custoLn, 1);
  const econ = (1 - custoLn / custoBoleto) * 100;

  const compareRows = [
    { name: 'Boleto', desc: 'R$ ' + nf(2).format(a.custoBoleto) + ' por cobrança', amount: fmtBRL(custoBoleto), amountColor: '#6b675e', pct: (custoBoleto / maxC) * 100, color: '#d8d3c8' },
    { name: 'PSP / gateway', desc: nf(2).format(a.pspPct) + '% + R$ ' + nf(2).format(a.pspFixo) + '/tx + mensalidade', amount: fmtBRL(custoPsp), amountColor: '#6b675e', pct: (custoPsp / maxC) * 100, color: '#a8a297' },
    { name: 'Lightning', desc: '~' + a.lnFee + ' sat + ' + nf(1).format(a.lnPct) + '%/tx', amount: fmtBRL(custoLn), amountColor: '#d97a06', pct: Math.max((custoLn / maxC) * 100, 0.6), color: '#f7931a' },
  ];

  return {
    liqPorMin,
    kpiLiq: fmtInt(liquN),
    subLiq: 'a cada ' + a.whLiq + ' Wh consumidos',
    kpiSats: fmtSatsC(satsMov),
    subSats: '≈ ' + fmtBRL(valorTotal, 0) + ' ao produtor',
    kpiEnergia: fmtInt(energia),
    subEnergia: a.casas + ' casas × ' + a.dias + ' d × ' + nf(0).format(a.kwhDia) + ' kWh/dia',
    kpiCortes: cortes + ' / ' + religas,
    subCortes: 'acionados sem intervenção',
    volumeLabel: fmtInt(liquN) + ' microliquidações  ·  ' + a.casas + ' casas × ' + a.dias + ' dias',
    compareRows,
    econPct: nf(1).format(econ) + '%',
    econLabel: 'mais barato que boleto para o mesmo volume — Lightning ' + fmtBRL(custoLn, 0) + ' vs ' + fmtBRL(custoBoleto, 0) + '.',
    raw: { satsPorBrl, liquN, energia, valorTotal, satsMov, custoBoleto, custoPsp, custoLn, econ },
  };
}
