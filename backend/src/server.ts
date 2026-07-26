import express from 'express';
import * as http from 'http';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config';
import { Ledger } from './ledger';
import { Meter } from './meter';
import { projetar, DEFAULT_ASSUMPTIONS, Assumptions } from './projection';
import { saldosLightning } from './lightning';

export interface Servidor {
  broadcast: () => void;
  ouvir: () => void;
}

export function criarServidor(
  ledger: Ledger,
  meter: Meter,
  status: () => { mqttOnline: boolean },
): Servidor {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '..', 'public')));

  /** Payload do painel: métricas do ledger + saldos das carteiras Lightning. */
  const payload = () => ({ ...ledger.metricas(), lightning: saldosLightning() });

  // --- REST ---
  app.get('/api/metrics', (_req, res) => {
    res.json(payload());
  });

  app.get('/api/state', (_req, res) => {
    res.json({
      ...status(),
      modoLightning: config.lnbitsUrl ? 'lnbits' : 'simulado',
      regras: {
        satsPorMwh: config.satsPorMwh,
        carenciaLeituras: config.carenciaLeituras,
        saldoMinimoReliga: config.saldoMinimoReliga,
        whPorLiq: config.whPorLiq,
      },
    });
  });

  // projeção do pitch (fonte de verdade também no servidor)
  app.get('/api/projection', (req, res) => {
    const a: Assumptions = { ...DEFAULT_ASSUMPTIONS };
    for (const k of Object.keys(DEFAULT_ASSUMPTIONS) as (keyof Assumptions)[]) {
      const v = req.query[k];
      if (v !== undefined) {
        const n = parseFloat(String(v));
        if (Number.isFinite(n)) a[k] = n;
      }
    }
    res.json(projetar(a));
  });

  // recarga (demo sem MQTT)
  app.post('/api/recarga', (req, res) => {
    const { casaId, sats } = req.body || {};
    if (!casaId || !Number.isFinite(Number(sats))) {
      return res.status(400).json({ erro: 'casaId e sats são obrigatórios' });
    }
    meter.recarregar(String(casaId), Number(sats));
    broadcast();
    res.json({ ok: true });
  });

  // --- HTTP + WebSocket ---
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'metrics', data: payload() }));
  });

  function broadcast() {
    if (wss.clients.size === 0) return;
    const msg = JSON.stringify({ type: 'metrics', data: payload() });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  function ouvir() {
    server.listen(config.port, () => {
      console.log(`[http] dashboard em http://localhost:${config.port}`);
    });
  }

  return { broadcast, ouvir };
}
