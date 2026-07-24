// Projeção do pitch — espelho fiel do renderVals() do design (fonte de verdade).
import type { Assumptions } from './types';
import { nf, fmtInt, fmtBRL, fmtSatsC } from './format';

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  cotacao: 380000, casas: 50, dias: 30, whLiq: 100, kwhDia: 8, precoKwh: 0.8,
  custoBoleto: 3.5, pspMensal: 99, pspFixo: 0.39, pspPct: 3.99, lnFee: 1, lnPct: 0.1,
};

export interface CompareRow {
  name: string;
  desc: string;
  amount: string;
  amountColor: string;
  pct: number;
  color: string;
}

export interface Projecao {
  kpiLiq: string; subLiq: string;
  kpiSats: string; subSats: string;
  kpiEnergia: string; subEnergia: string;
  kpiCortes: string; subCortes: string;
  volumeLabel: string;
  econPct: string; econLabel: string;
  rows: CompareRow[];
}

export function projetar(a: Assumptions): Projecao {
  const satsPorBrl = 1e8 / a.cotacao;
  const liquN = (a.casas * a.dias * a.kwhDia * 1000) / a.whLiq;
  const energia = a.casas * a.dias * a.kwhDia;
  const valorTotal = energia * a.precoKwh;
  const satsMov = valorTotal * satsPorBrl;
  const valorPorLiq = valorTotal / liquN;
  const cortes = Math.max(1, Math.round(a.casas * a.dias * 0.006));
  const religas = Math.max(0, Math.round(cortes * 0.92));

  const custoBoleto = liquN * a.custoBoleto;
  const custoPsp = liquN * (a.pspFixo + (valorPorLiq * a.pspPct) / 100) + a.pspMensal * (a.dias / 30);
  const custoLn = liquN * (a.lnFee / satsPorBrl + (valorPorLiq * a.lnPct) / 100);
  const maxC = Math.max(custoBoleto, custoPsp, custoLn, 1);
  const econ = (1 - custoLn / custoBoleto) * 100;

  return {
    kpiLiq: fmtInt(liquN), subLiq: 'a cada ' + a.whLiq + ' Wh consumidos',
    kpiSats: fmtSatsC(satsMov), subSats: '≈ ' + fmtBRL(valorTotal, 0) + ' ao produtor',
    kpiEnergia: fmtInt(energia), subEnergia: a.casas + ' casas × ' + a.dias + ' d × ' + nf(0).format(a.kwhDia) + ' kWh/dia',
    kpiCortes: cortes + ' / ' + religas, subCortes: 'acionados sem intervenção',
    volumeLabel: fmtInt(liquN) + ' microliquidações  ·  ' + a.casas + ' casas × ' + a.dias + ' dias',
    econPct: nf(1).format(econ) + '%',
    econLabel: 'mais barato que boleto para o mesmo volume — Lightning ' + fmtBRL(custoLn, 0) + ' vs ' + fmtBRL(custoBoleto, 0) + '.',
    rows: [
      { name: 'Boleto', desc: 'R$ ' + nf(2).format(a.custoBoleto) + ' por cobrança', amount: fmtBRL(custoBoleto), amountColor: '#6b675e', pct: (custoBoleto / maxC) * 100, color: '#d8d3c8' },
      { name: 'PSP / gateway', desc: nf(2).format(a.pspPct) + '% + R$ ' + nf(2).format(a.pspFixo) + '/tx + mensalidade', amount: fmtBRL(custoPsp), amountColor: '#6b675e', pct: (custoPsp / maxC) * 100, color: '#a8a297' },
      { name: 'Lightning', desc: '~' + a.lnFee + ' sat + ' + nf(1).format(a.lnPct) + '%/tx', amount: fmtBRL(custoLn), amountColor: '#d97a06', pct: Math.max((custoLn / maxC) * 100, 0.6), color: '#f7931a' },
    ],
  };
}
