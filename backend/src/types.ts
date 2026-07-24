/** Leitura publicada pelo ESP32 (ou simulador) via MQTT. */
export interface Reading {
  casaId: string;
  watts: number;   // potência instantânea (W)
  wh: number;      // energia incremental desde a última publicação (Wh)
  ts: number;      // epoch ms
  tag: string;     // chave de idempotência (monotônica por dispositivo)
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
  ultimaLeitura: number;   // ts
  whAcumulado: number;     // energia total acumulada (Wh)
  satsPagos: number;       // sats já transferidos ao produtor
  whPendente: number;      // energia acumulada aguardando fechar a próxima microliquidação
  satsPendente: number;    // sats correspondentes ao whPendente
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
