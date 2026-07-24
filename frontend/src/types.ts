export type EventoTipo = 'Liquidação' | 'Corte' | 'Religa';

export interface Evento {
  id: number;
  ts: number;
  casa: string;
  tipo: EventoTipo;
  wh: number;
  sats: number;
  tag?: string;
}

export interface SeriePonto {
  t: number;
  kwh: number;
  sats: number;
}

export interface CasaEstado {
  casaId: string;
  saldoSats: number;
  releLigado: boolean;
  ultimaLeitura: number;
}

/** Métricas reais empurradas pelo backend via WebSocket. */
export interface MetricasReais {
  liqTotal: number;
  satsTotal: number;
  energiaKwh: number;
  cortes: number;
  religas: number;
  liqPorMin: number;
  casasAtivas: number;
  serie: SeriePonto[];
  eventos: Evento[];
  casas: CasaEstado[];
}

/** Premissas do pitch (5 expostas em slider no 1b). */
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
