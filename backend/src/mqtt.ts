import mqtt, { MqttClient } from 'mqtt';
import { config } from './config';
import { Meter } from './meter';
import type { Reading } from './types';

/**
 * Conecta ao broker MQTT, assina as leituras do ESP32 (ou simulador) e as
 * recargas, encaminhando tudo ao Meter. Expõe `enviarRele` para o backend
 * comandar o relé de cada casa (corte/religa).
 */
export function iniciarMqtt(meter: Meter, onStatus: (online: boolean) => void): MqttClient {
  const url = `mqtt://${config.mqttHost}:${config.mqttPort}`;
  const client = mqtt.connect(url, { reconnectPeriod: 2000, connectTimeout: 4000 });

  client.on('connect', () => {
    console.log(`[mqtt] conectado a ${url}`);
    onStatus(true);
    client.subscribe([config.topicReadingWildcard, config.topicRecargaWildcard], (err) => {
      if (err) console.error('[mqtt] erro ao assinar:', err.message);
      else console.log(`[mqtt] assinando ${config.topicReadingWildcard} e ${config.topicRecargaWildcard}`);
    });
  });

  client.on('reconnect', () => onStatus(false));
  client.on('close', () => onStatus(false));
  client.on('error', (err) => console.error('[mqtt] erro:', err.message));

  client.on('message', (topic, payload) => {
    const partes = topic.split('/'); // satsmeter/<casaId>/<tipo>
    const casaId = partes[1];
    const tipo = partes[2];
    const texto = payload.toString().trim();

    if (tipo === 'reading') {
      let r: Partial<Reading> = {};
      try {
        r = JSON.parse(texto);
      } catch {
        console.warn(`[mqtt] leitura inválida em ${topic}: ${texto}`);
        return;
      }
      const reading: Reading = {
        casaId: r.casaId || casaId,
        watts: Number(r.watts) || 0,
        wh: Number(r.wh) || 0,
        ts: Number(r.ts) || Date.now(),
        tag: String(r.tag ?? `${casaId}-${r.ts ?? Date.now()}`),
      };
      meter.processarLeitura(reading);
    } else if (tipo === 'recarga') {
      const sats = parseFloat(texto);
      if (Number.isFinite(sats)) {
        console.log(`[mqtt] recarga ${casaId}: +${sats} sats`);
        meter.recarregar(casaId, sats);
      }
    }
  });

  return client;
}

/** Publica comando de relé para uma casa (retido, para o ESP32 recuperar ao reconectar). */
export function enviarRele(client: MqttClient, casaId: string, ligar: boolean) {
  if (!client.connected) return;
  client.publish(config.topicRele(casaId), ligar ? 'on' : 'off', { retain: true });
  console.log(`[mqtt] relé ${casaId} -> ${ligar ? 'ON' : 'OFF'}`);
}
