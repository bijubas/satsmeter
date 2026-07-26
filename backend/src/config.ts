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

const mqttHost = str('MQTT_HOST', 'localhost');
const mqttPort = num('MQTT_PORT', 1883);
const mqttTls = str('MQTT_TLS', 'false') === 'true';
// MQTT_URL tem prioridade; senão monta a partir de host/port (mqtts:// se TLS).
const mqttUrl =
  str('MQTT_URL', '') || `${mqttTls ? 'mqtts' : 'mqtt'}://${mqttHost}:${mqttPort}`;

export const config = {
  // --- HTTP / WebSocket ---
  port: num('PORT', 8000),

  // --- MQTT (Mosquitto local OU HiveMQ Cloud, conforme o firmware) ---
  mqttUrl,
  mqttUsername: str('MQTT_USERNAME', ''),
  mqttPassword: str('MQTT_PASSWORD', ''),
  // Contrato do firmware do medidor:
  topicLeituras: str('TOPIC_LEITURAS', 'satsmeter/leituras'),   // ESP32 publica aqui
  topicComandos: str('TOPIC_COMANDOS', 'satsmeter/comandos'),   // backend publica 1/0 (relé)
  topicRecarga: str('TOPIC_RECARGA', 'satsmeter/recarga'),      // recarga de saldo (demo)
  // Payload do firmware não traz id; usa este quando o casaId vier ausente.
  deviceId: str('DEVICE_ID', 'device-01'),

  // --- Regras de negócio (README) ---
  satsPorMwh: num('SATS_POR_MWH', 0.5),   // tarifa: sats por mWh consumido
  carenciaLeituras: num('CARENCIA_LEITURAS', 3),
  saldoMinimoReliga: num('SALDO_MINIMO_RELIGA', 50),
  saldoInicial: num('SALDO_INICIAL', 20000), // saldo pré-pago inicial por casa (sats)
  whPorLiq: num('WH_POR_LIQ', 1),         // energia por microliquidação (Wh) -> 1 evento no extrato
  // Amplifica a energia lida do medidor antes de contabilizar (1 = valor real do
  // hardware). Só para demo: com carga baixa o consumo real fica ilegível no painel.
  escalaEnergia: num('ESCALA_ENERGIA', 1),
  // Eventos enviados ao painel a cada push. Sobe o histórico rolável do extrato ao
  // custo do tamanho do payload (o broadcast é 1x/s). Teto real: MAX_EVENTOS do ledger.
  eventosPainel: num('EVENTOS_PAINEL', 200),

  // --- Lightning (LNbits) ---
  lnbitsUrl: str('LNBITS_URL', ''),        // vazio => modo simulado
  lnbitsInvoiceKey: str('LNBITS_INVOICE_KEY', ''),
  // Liquidação REAL entre carteiras (o saldo se move de fato). Com as duas
  // preenchidas, o backend gera a invoice no produtor e paga pelo consumidor.
  // Faltando qualquer uma, cai no MVP que só registra a invoice como prova.
  lnbitsAdminKey: str('LNBITS_ADMIN_KEY', ''),                     // consumidor (paga)
  lnbitsProdutorInvoiceKey: str('LNBITS_PRODUTOR_INVOICE_KEY', ''), // produtor (recebe)
  // Recarga automática da carteira do consumidor (só demo). Precisa de uma conta
  // com privilégio de superusuário no LNbits — é ela que pode creditar saldo.
  // Limiar 0 desliga o recurso.
  lnbitsUsuario: str('LNBITS_USUARIO', ''),
  lnbitsSenha: str('LNBITS_SENHA', ''),
  lnbitsWalletConsumidor: str('LNBITS_WALLET_CONSUMIDOR', ''),
  lnbitsRecargaLimiar: num('LNBITS_RECARGA_LIMIAR', 0),   // sats: abaixo disso, recarrega
  lnbitsRecargaValor: num('LNBITS_RECARGA_VALOR', 0),     // sats creditados por recarga

  // --- Persistência ---
  ledgerFile: path.resolve(__dirname, '..', str('LEDGER_FILE', 'ledger.json')),
};

/** Converte energia (Wh) em sats pela tarifa vigente. 1 Wh = 1000 mWh. */
export const satsForWh = (wh: number): number => wh * 1000 * config.satsPorMwh;
