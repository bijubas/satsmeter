import * as fs from 'fs';
import { config } from './config';
import type { Evento, CasaEstado, MetricasReais, SeriePonto, EventoTipo } from './types';

interface LedgerData {
  nextId: number;
  eventos: Evento[];
  casas: Record<string, CasaEstado>;
  tags: Record<string, number>; // tag -> id do evento (idempotência)
}

const MAX_EVENTOS = 500;   // mantém o arquivo enxuto
const MAX_PONTOS = 48;     // amostras da série temporal

export class Ledger {
  private data: LedgerData = { nextId: 1, eventos: [], casas: {}, tags: {} };
  private salvarAgendado = false;

  constructor() {
    this.carregar();
  }

  private carregar() {
    try {
      if (fs.existsSync(config.ledgerFile)) {
        const raw = JSON.parse(fs.readFileSync(config.ledgerFile, 'utf8'));
        this.data = { nextId: 1, eventos: [], casas: {}, tags: {}, ...raw };
        console.log(`[ledger] carregado: ${this.data.eventos.length} eventos, ${Object.keys(this.data.casas).length} casas`);
      }
    } catch (err) {
      console.warn(`[ledger] falha ao carregar (${(err as Error).message}); começando vazio`);
    }
  }

  /** Persistência com debounce para não escrever a cada leitura. */
  private agendarSalvar() {
    if (this.salvarAgendado) return;
    this.salvarAgendado = true;
    setTimeout(() => {
      this.salvarAgendado = false;
      try {
        // poda eventos antigos antes de gravar
        if (this.data.eventos.length > MAX_EVENTOS) {
          this.data.eventos = this.data.eventos.slice(-MAX_EVENTOS);
        }
        fs.writeFileSync(config.ledgerFile, JSON.stringify(this.data));
      } catch (err) {
        console.warn(`[ledger] falha ao salvar: ${(err as Error).message}`);
      }
    }, 800);
  }

  // ---- casas ----
  casa(casaId: string): CasaEstado {
    let c = this.data.casas[casaId];
    if (!c) {
      c = {
        casaId,
        saldoSats: config.saldoInicial,
        releLigado: true,
        semSaldoConsecutivo: 0,
        ultimaLeitura: 0,
        whAcumulado: 0,
        satsPagos: 0,
        whPendente: 0,
        satsPendente: 0,
        ultimoKwhAcum: NaN, // NaN = ainda sem baseline (primeira leitura só calibra)
      };
      this.data.casas[casaId] = c;
    }
    return c;
  }

  atualizarCasa(c: CasaEstado) {
    this.data.casas[c.casaId] = c;
    this.agendarSalvar();
  }

  // ---- idempotência ----
  tagVista(tag: string): boolean {
    return tag != null && tag !== '' && this.data.tags[tag] !== undefined;
  }

  /** Marca uma tag como processada mesmo quando a leitura não gera evento. */
  marcarTag(tag: string) {
    if (tag) {
      this.data.tags[tag] = this.data.tags[tag] ?? 0;
      this.agendarSalvar();
    }
  }

  // ---- eventos ----
  registrarEvento(casa: string, tipo: EventoTipo, wh: number, sats: number, tag?: string): Evento {
    const ev: Evento = { id: this.data.nextId++, ts: Date.now(), casa, tipo, wh, sats, tag };
    this.data.eventos.push(ev);
    if (tag) this.data.tags[tag] = ev.id;
    this.agendarSalvar();
    return ev;
  }

  // ---- derivados / métricas ----
  private serieTemporal(): SeriePonto[] {
    const liqs = this.data.eventos
      .filter((e) => e.tipo === 'Liquidação')
      .sort((a, b) => a.ts - b.ts);
    if (liqs.length === 0) return [];

    // acumula kWh e sats
    const acc: SeriePonto[] = [];
    let kwh = 0;
    let sats = 0;
    for (const e of liqs) {
      kwh += e.wh / 1000;
      sats += e.sats;
      acc.push({ t: e.ts, kwh, sats });
    }
    // downsample para no máximo MAX_PONTOS pontos, mantendo o último
    if (acc.length <= MAX_PONTOS) return acc;
    const passo = acc.length / MAX_PONTOS;
    const out: SeriePonto[] = [];
    for (let i = 0; i < MAX_PONTOS; i++) out.push(acc[Math.floor(i * passo)]);
    out[out.length - 1] = acc[acc.length - 1];
    return out;
  }

  metricas(): MetricasReais {
    const eventos = this.data.eventos;
    const liqs = eventos.filter((e) => e.tipo === 'Liquidação');
    const satsTotal = liqs.reduce((s, e) => s + e.sats, 0);
    const whTotal = liqs.reduce((s, e) => s + e.wh, 0);
    const cortes = eventos.filter((e) => e.tipo === 'Corte').length;
    const religas = eventos.filter((e) => e.tipo === 'Religa').length;

    // liquidações por minuto: janela dos últimos 60s
    const agora = Date.now();
    const ultMin = liqs.filter((e) => agora - e.ts <= 60_000).length;

    const casas = Object.values(this.data.casas);
    const ativas = casas.filter((c) => agora - c.ultimaLeitura <= 30_000).length;

    return {
      liqTotal: liqs.length,
      satsTotal,
      energiaKwh: whTotal / 1000,
      cortes,
      religas,
      liqPorMin: ultMin,
      casasAtivas: ativas,
      serie: this.serieTemporal(),
      eventos: eventos.slice(-30).reverse(), // mais recentes primeiro
      casas,
    };
  }
}
