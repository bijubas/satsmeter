import mqtt, { MqttClient } from 'mqtt';
import { config } from './config';
import { Meter } from './meter';
import type { Leitura } from './types';

/**
 * Conecta ao broker (Mosquitto local ou HiveMQ Cloud), assina as leituras do
 * firmware em `satsmeter/leituras` e as recargas, encaminhando ao Meter.
 * Expõe `enviarRele` para o backend comandar o relé via `satsmeter/comandos`
 * (payload "1" liga / "0" corta — contrato do firmware).
 */
export function iniciarMqtt(meter: Meter, onStatus: (online: boolean) => void): MqttClient {
  const client = mqtt.connect(config.mqttUrl, {
    reconnectPeriod: 2000,
    connectTimeout: 6000,
    username: config.mqttUsername || undefined,
    password: config.mqttPassword || undefined,
  });

  client.on('connect', () => {
    console.log(`[mqtt] conectado a ${config.mqttUrl}`);
    onStatus(true);
    client.subscribe([config.topicLeituras, config.topicRecarga], (err) => {
      if (err) console.error('[mqtt] erro ao assinar:', err.message);
      else console.log(`[mqtt] assinando ${config.topicLeituras} e ${config.topicRecarga}`);
    });
  });

  client.on('reconnect', () => onStatus(false));
  client.on('close', () => onStatus(false));
  client.on('error', (err) => console.error('[mqtt] erro:', err.message));

  client.on('message', (topic, payload) => {
    const texto = payload.toString().trim();

    if (topic === config.topicLeituras) {
      let l: Leitura;
      try {
        l = JSON.parse(texto);
      } catch {
        console.warn(`[mqtt] leitura inválida: ${texto.slice(0, 120)}`);
        return;
      }
      const casaId = (l.casaId && String(l.casaId)) || config.deviceId;
      const watts = (Number(l.tensao_v) || 0) * (Number(l.corrente_a) || 0); // P = V·I
      const energiaKwh = Number(l.energia_kwh);
      if (!Number.isFinite(energiaKwh)) return;
      const ts = Number(l.ts) || Date.now();
      const tag = `${casaId}|${l.data_hora ?? energiaKwh}`;
      meter.processarEnergiaAcumulada(casaId, energiaKwh, watts, ts, tag);
    } else if (topic === config.topicRecarga) {
      // aceita número puro ou JSON {casaId?, sats}
      let casaId = config.deviceId;
      let sats = NaN;
      try {
        const j = JSON.parse(texto);
        if (typeof j === 'number') sats = j;
        else { sats = Number(j.sats); if (j.casaId) casaId = String(j.casaId); }
      } catch {
        sats = parseFloat(texto);
      }
      if (Number.isFinite(sats)) {
        console.log(`[mqtt] recarga ${casaId}: +${sats} sats`);
        meter.recarregar(casaId, sats);
      }
    }
  });

  return client;
}

/**
 * Comanda o relé via `satsmeter/comandos` (contrato do firmware: "1"=liga, "0"=corta).
 * Retido para o ESP32 recuperar o último estado ao reconectar.
 */
export function enviarRele(client: MqttClient, casaId: string, ligar: boolean) {
  if (!client.connected) return;
  client.publish(config.topicComandos, ligar ? '1' : '0', { retain: true });
  console.log(`[mqtt] comando relé (${casaId}) -> ${ligar ? '1 (liga)' : '0 (corta)'}`);
}
