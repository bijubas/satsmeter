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
  satsPagos: number;
  whAcumulado: number;
  /** recusas de pagamento consecutivas; ausente em ledger antigo */
  falhasPagamento?: number;
}

/** Saldos das carteiras Lightning — distintos do saldo pré-pago do ledger. */
export interface SaldosLightning {
  produtorSats: number | null;
  consumidorSats: number | null;
  atualizadoEm: number;
  online: boolean;
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
  lightning?: SaldosLightning;
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
