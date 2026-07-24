import { useEffect, useRef, useState } from 'react';
import type { MetricasReais } from './types';

const VAZIO: MetricasReais = {
  liqTotal: 0, satsTotal: 0, energiaKwh: 0, cortes: 0, religas: 0,
  liqPorMin: 0, casasAtivas: 0, serie: [], eventos: [], casas: [],
};

export type ConnStatus = 'conectando' | 'online' | 'offline';

// URL do WebSocket: usa VITE_WS_URL (deploy no Vercel apontando pro backend Railway),
// senão same-origin (backend serve o front localmente / via proxy do Vite em dev).
function resolveWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL;
  if (env) {
    let u = env.replace(/^http/, 'ws'); // https:// -> wss://  ·  http:// -> ws://
    if (!/\/ws$/.test(u)) u = u.replace(/\/+$/, '') + '/ws';
    return u;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** Assina o stream de métricas reais (WebSocket /ws) com reconexão automática. */
export function useLiveMetrics() {
  const [metrics, setMetrics] = useState<MetricasReais>(VAZIO);
  const [status, setStatus] = useState<ConnStatus>('conectando');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;

    function conectar() {
      const ws = new WebSocket(resolveWsUrl());
      wsRef.current = ws;

      ws.onopen = () => vivo && setStatus('online');
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'metrics') setMetrics(msg.data as MetricasReais);
        } catch { /* ignora */ }
      };
      ws.onclose = () => {
        if (!vivo) return;
        setStatus('offline');
        timer = setTimeout(conectar, 1500);
      };
      ws.onerror = () => ws.close();
    }

    conectar();
    return () => {
      vivo = false;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  return { metrics, status };
}
