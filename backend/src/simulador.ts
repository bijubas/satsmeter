/**
 * Simulador de medidores — publica leituras MQTT no mesmo formato do firmware
 * ESP32, para o sistema rodar em tempo real sem hardware.
 *
 *   npm run sim
 *
 * Cada "casa" gera potência variável, integra energia (Wh) e publica em
 * satsmeter/<casaId>/reading. Periodicamente recarrega saldos para demonstrar
 * o ciclo corte -> religa.
 */
import mqtt from 'mqtt';
import { config } from './config';

const CASAS = ['A-042', 'B-118', 'C-007', 'A-091', 'D-233', 'B-054'];
const INTERVALO_MS = 1200;

const url = `mqtt://${config.mqttHost}:${config.mqttPort}`;
const client = mqtt.connect(url, { reconnectPeriod: 2000 });

// estado por casa: potência-base e contador de tag
const estado = new Map<string, { base: number; seq: number }>();
for (const c of CASAS) estado.set(c, { base: 150 + Math.random() * 700, seq: 0 });

client.on('connect', () => {
  console.log(`[sim] conectado a ${url} · ${CASAS.length} casas · a cada ${INTERVALO_MS}ms`);
  console.log('[sim] publicando leituras… (Ctrl+C para parar)');
});
client.on('error', (e) => console.error('[sim] erro mqtt:', e.message));

function publicarLeitura(casaId: string) {
  const st = estado.get(casaId)!;
  // caminha a potência suavemente (random walk) entre 60 e 1200 W
  st.base = Math.min(1200, Math.max(60, st.base + (Math.random() - 0.5) * 120));
  const watts = Math.round(st.base * (0.9 + Math.random() * 0.2) * 10) / 10;
  const wh = Math.round((watts * (INTERVALO_MS / 1000)) / 3600 * 1e6) / 1e6; // Wh no intervalo
  st.seq += 1;
  const payload = JSON.stringify({
    casaId,
    watts,
    wh,
    ts: Date.now(),
    tag: `${casaId}-${st.seq}`, // idempotência: monotônico por casa
  });
  client.publish(`satsmeter/${casaId}/reading`, payload);
}

// leituras
setInterval(() => {
  for (const c of CASAS) publicarLeitura(c);
}, INTERVALO_MS);

// recargas periódicas (demonstra religa após eventuais cortes)
setInterval(() => {
  const casaId = CASAS[Math.floor(Math.random() * CASAS.length)];
  const sats = 5000 + Math.floor(Math.random() * 5000);
  client.publish(`satsmeter/${casaId}/recarga`, String(sats));
  console.log(`[sim] recarga ${casaId}: +${sats} sats`);
}, 20000);

const parar = () => { console.log('\n[sim] encerrando…'); client.end(); process.exit(0); };
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
