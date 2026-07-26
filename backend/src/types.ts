/**
 * Leitura publicada pelo firmware do ESP32 em `satsmeter/leituras`.
 * energia_kwh é ACUMULADA desde o boot; o backend calcula o delta.
 * casaId é opcional (o firmware single-device não envia) — cai no DEVICE_ID.
 */
export interface Leitura {
  casaId?: string;
  data_hora?: string;
  tensao_v: number;
  corrente_a: number;
  energia_kwh: number;
  ts?: number;
}

export type EventoTipo = 'Liquidação' | 'Corte' | 'Religa';

/** Evento auditável do extrato. */
export interface Evento {
  id: number;
  ts: number;
  casa: string;
  tipo: EventoTipo;
  wh: number;      // energia liquidada no evento (0 em corte/religa)
  sats: number;    // sats transferidos ao produtor (0 em corte/religa)
  tag?: string;
}

/** Estado ao vivo de uma casa. */
export interface CasaEstado {
  casaId: string;
  saldoSats: number;
  releLigado: boolean;
  semSaldoConsecutivo: number;
  falhasPagamento: number; // pagamentos recusados consecutivos (gatilho do corte)
  ultimaLeitura: number;   // ts
  whAcumulado: number;     // energia total acumulada (Wh)
  satsPagos: number;       // sats já transferidos ao produtor
  whPendente: number;      // energia acumulada aguardando fechar a próxima microliquidação
  satsPendente: number;    // sats correspondentes ao whPendente
  ultimoKwhAcum: number;   // baseline: energia_kwh acumulada da última leitura (p/ delta)
}

/** Ponto de série temporal (uma amostra por bucket). */
export interface SeriePonto {
  t: number;   // epoch ms do bucket
  kwh: number; // consumo acumulado (kWh)
  sats: number;// sats acumulados ao produtor
}

/** Métricas reais agregadas (observadas), empurradas ao front. */
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
