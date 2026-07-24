import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const num = (key: string, def: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return def;
  // permite comentários inline no .env: "0.5   # tarifa"
  const v = parseFloat(String(raw).split('#')[0].trim());
  return Number.isFinite(v) ? v : def;
};

const str = (key: string, def: string): string => {
  const raw = process.env[key];
  return raw === undefined ? def : String(raw).split('#')[0].trim();
};

export const config = {
  // --- HTTP / WebSocket ---
  port: num('PORT', 8000),

  // --- MQTT ---
  mqttHost: str('MQTT_HOST', 'localhost'),
  mqttPort: num('MQTT_PORT', 1883),
  topicReadingWildcard: 'satsmeter/+/reading',
  topicRecargaWildcard: 'satsmeter/+/recarga',
  topicRele: (casaId: string) => `satsmeter/${casaId}/rele`,

  // --- Regras de negócio (README) ---
  satsPorMwh: num('SATS_POR_MWH', 0.5),   // tarifa: sats por mWh consumido
  carenciaLeituras: num('CARENCIA_LEITURAS', 3),
  saldoMinimoReliga: num('SALDO_MINIMO_RELIGA', 50),
  saldoInicial: num('SALDO_INICIAL', 20000), // saldo pré-pago inicial por casa (sats)
  whPorLiq: num('WH_POR_LIQ', 1),         // energia por microliquidação (Wh) -> 1 evento no extrato

  // --- Lightning (LNbits) ---
  lnbitsUrl: str('LNBITS_URL', ''),        // vazio => modo simulado
  lnbitsInvoiceKey: str('LNBITS_INVOICE_KEY', ''),

  // --- Persistência ---
  ledgerFile: path.resolve(__dirname, '..', str('LEDGER_FILE', 'ledger.json')),
};

/** Converte energia (Wh) em sats pela tarifa vigente. 1 Wh = 1000 mWh. */
export const satsForWh = (wh: number): number => wh * 1000 * config.satsPorMwh;
