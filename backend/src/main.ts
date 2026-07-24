import { config } from './config';
import { Ledger } from './ledger';
import { Meter } from './meter';
import { iniciarMqtt, enviarRele } from './mqtt';
import { criarServidor } from './server';
import type { MqttClient } from 'mqtt';

/**
 * SatsMeter — entrypoint.
 * Costura ledger + meter + MQTT (ESP32) + HTTP/WebSocket (dashboard),
 * tudo integrado e empurrando atualizações em tempo real.
 */

let mqttClient: MqttClient | null = null;
let mqttOnline = false;

const ledger = new Ledger();

// broadcast com throttle: agrupa rajadas de eventos numa atualização a cada ~250ms
let broadcastAgendado = false;
let broadcastFn: () => void = () => {};
function agendarBroadcast() {
  if (broadcastAgendado) return;
  broadcastAgendado = true;
  setTimeout(() => {
    broadcastAgendado = false;
    broadcastFn();
  }, 250);
}

const meter = new Meter(
  ledger,
  (casaId, ligar) => {
    if (mqttClient) enviarRele(mqttClient, casaId, ligar);
  },
  () => agendarBroadcast(), // cada evento agenda um push
);

const servidor = criarServidor(ledger, meter, () => ({ mqttOnline }));
broadcastFn = servidor.broadcast;

mqttClient = iniciarMqtt(meter, (online) => {
  mqttOnline = online;
});

servidor.ouvir();

// tick periódico: mantém "liquidações/min", casas ativas e séries frescas no front
setInterval(() => servidor.broadcast(), 1000);

console.log(`[satsmeter] tarifa=${config.satsPorMwh} sats/mWh · carência=${config.carenciaLeituras} · religa≥${config.saldoMinimoReliga} sats · ${config.whPorLiq} Wh/liquidação`);
console.log(`[satsmeter] Lightning: ${config.lnbitsUrl ? config.lnbitsUrl : 'modo simulado'}`);

const encerrar = () => {
  console.log('\n[satsmeter] encerrando…');
  mqttClient?.end();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
