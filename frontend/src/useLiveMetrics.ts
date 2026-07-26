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

/** Base HTTP da API: mesma origem em dev (proxy do Vite) ou o backend do VITE_WS_URL. */
function resolveApiBase(): string {
  const env = import.meta.env.VITE_WS_URL;
  if (!env) return ''; // same-origin: o proxy do Vite (dev) ou o Express (:8000) resolvem
  return env.replace(/^ws/, 'http').replace(/\/ws$/, '').replace(/\/+$/, '');
}

export interface Regras {
  satsPorMwh: number;
  carenciaLeituras: number;
  saldoMinimoReliga: number;
  whPorLiq: number;
}

const REGRAS_PADRAO: Regras = {
  satsPorMwh: 0, carenciaLeituras: 3, saldoMinimoReliga: 0, whPorLiq: 0,
};

/** Lê as regras de negócio vigentes no backend (/api/state) uma vez, no mount. */
export function useRegras(): Regras {
  const [regras, setRegras] = useState<Regras>(REGRAS_PADRAO);

  useEffect(() => {
    let vivo = true;
    fetch(`${resolveApiBase()}/api/state`)
      .then((r) => r.json())
      .then((j) => { if (vivo && j?.regras) setRegras(j.regras as Regras); })
      .catch(() => { /* mantém o padrão */ });
    return () => { vivo = false; };
  }, []);

  return regras;
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
