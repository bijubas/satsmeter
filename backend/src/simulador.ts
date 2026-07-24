/**
 * Simulador de medidores — publica leituras MQTT no MESMO formato do firmware
 * ESP32 (tópico `satsmeter/leituras`, energia acumulada em kWh), para o sistema
 * rodar em tempo real sem hardware.
 *
 *   npm run sim
 *
 * Cada "casa" varia a potência, acumula energia e publica periodicamente.
 * O firmware real não envia `casaId` (single-device); aqui mandamos para simular
 * várias casas — o backend aceita ambos (sem casaId cai no DEVICE_ID).
 */
import mqtt from 'mqtt';
import { config } from './config';

const CASAS = ['A-042', 'B-118', 'C-007', 'A-091', 'D-233', 'B-054'];
const INTERVALO_MS = 1500;
const TENSAO = 127;

const client = mqtt.connect(config.mqttUrl, {
  reconnectPeriod: 2000,
  username: config.mqttUsername || undefined,
  password: config.mqttPassword || undefined,
});

// estado por casa: potência-base e energia acumulada (kWh)
const estado = new Map<string, { base: number; kwh: number }>();
for (const c of CASAS) estado.set(c, { base: 150 + Math.random() * 700, kwh: 0 });

function dataHora(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

client.on('connect', () => {
  console.log(`[sim] conectado a ${config.mqttUrl} · ${CASAS.length} casas · a cada ${INTERVALO_MS}ms`);
  console.log(`[sim] publicando em ${config.topicLeituras} (energia acumulada)…`);
});
client.on('error', (e) => console.error('[sim] erro mqtt:', e.message));

function publicar(casaId: string) {
  const st = estado.get(casaId)!;
  // random walk da potência entre 60 e 1200 W
  st.base = Math.min(1200, Math.max(60, st.base + (Math.random() - 0.5) * 120));
  const watts = Math.round(st.base * (0.9 + Math.random() * 0.2) * 10) / 10;
  st.kwh += (watts * (INTERVALO_MS / 1000)) / 3600 / 1000; // acumula kWh
  const payload = JSON.stringify({
    casaId,
    data_hora: dataHora(),
    tensao_v: Number(TENSAO.toFixed(2)),
    corrente_a: Number((watts / TENSAO).toFixed(3)),
    energia_kwh: Number(st.kwh.toFixed(6)),
  });
  client.publish(config.topicLeituras, payload);
}

setInterval(() => {
  for (const c of CASAS) publicar(c);
}, INTERVALO_MS);

// recargas periódicas -> demonstra religa após cortes
setInterval(() => {
  const casaId = CASAS[Math.floor(Math.random() * CASAS.length)];
  const sats = 5000 + Math.floor(Math.random() * 5000);
  client.publish(config.topicRecarga, JSON.stringify({ casaId, sats }));
  console.log(`[sim] recarga ${casaId}: +${sats} sats`);
}, 20000);

const parar = () => { console.log('\n[sim] encerrando…'); client.end(); process.exit(0); };
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
