import { useEffect, useRef, useState } from 'react';
import type { MetricasReais } from './types';

const VAZIO: MetricasReais = {
  liqTotal: 0, satsTotal: 0, energiaKwh: 0, cortes: 0, religas: 0,
  liqPorMin: 0, casasAtivas: 0, serie: [], eventos: [], casas: [],
};

export type ConnStatus = 'conectando' | 'online' | 'offline';

/** Assina o stream de métricas reais (WebSocket /ws) com reconexão automática. */
export function useLiveMetrics() {
  const [metrics, setMetrics] = useState<MetricasReais>(VAZIO);
  const [status, setStatus] = useState<ConnStatus>('conectando');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;

    function conectar() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
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
