import { config, satsForWh } from './config';
import { Ledger } from './ledger';
import { pagarProdutor } from './lightning';
import type { Reading, Evento } from './types';

type EnviarRele = (casaId: string, ligar: boolean) => void;
type OnEvento = (ev: Evento) => void;

/**
 * Núcleo de negócio do SatsMeter (regras do README):
 *  - acumula energia por casa e dispara microliquidações Lightning;
 *  - histerese: corta só após CARENCIA_LEITURAS leituras sem saldo consecutivas;
 *  - anti-flapping: religa só com saldo >= SALDO_MINIMO_RELIGA;
 *  - fail-safe: silêncio do medidor nunca corta — só saldo insuficiente confirmado;
 *  - idempotência: tag repetida devolve o ACK anterior sem nova cobrança.
 */
export class Meter {
  private fila: Promise<void> = Promise.resolve(); // serializa o processamento

  constructor(
    private ledger: Ledger,
    private enviarRele: EnviarRele,
    private onEvento: OnEvento,
  ) {}

  /** Enfileira uma leitura para processamento sequencial (evita corridas). */
  processarLeitura(r: Reading): Promise<void> {
    this.fila = this.fila.then(() => this._processar(r)).catch((err) => {
      console.error('[meter] erro processando leitura:', err);
    });
    return this.fila;
  }

  private async _processar(r: Reading) {
    // idempotência: tag já processada -> devolve o ACK anterior, sem cobrar de novo
    if (r.tag && this.ledger.tagVista(r.tag)) return;

    const c = this.ledger.casa(r.casaId);
    c.ultimaLeitura = r.ts || Date.now();

    const wh = Number(r.wh) || 0;
    if (wh <= 0) {
      this.ledger.marcarTag(r.tag);
      this.ledger.atualizarCasa(c);
      return;
    }

    const custo = satsForWh(wh);

    if (c.saldoSats >= custo) {
      // --- consumidor com saldo: debita e credita o produtor ---
      c.saldoSats -= custo;
      c.whAcumulado += wh;
      c.satsPagos += custo;
      c.semSaldoConsecutivo = 0;
      c.whPendente += wh;
      c.satsPendente += custo;

      // religa automático se estava cortado e voltou a ter saldo mínimo
      if (!c.releLigado && c.saldoSats >= config.saldoMinimoReliga) {
        c.releLigado = true;
        this.enviarRele(c.casaId, true);
        const ev = this.ledger.registrarEvento(c.casaId, 'Religa', 0, 0);
        this.onEvento(ev);
      }

      // fecha microliquidações a cada WH_POR_LIQ consumidos
      while (c.whPendente >= config.whPorLiq) {
        const whChunk = config.whPorLiq;
        const satsChunk = Math.max(1, Math.round(satsForWh(whChunk)));
        await pagarProdutor(satsChunk, `SatsMeter ${c.casaId} ${whChunk}Wh`);
        const ev = this.ledger.registrarEvento(c.casaId, 'Liquidação', whChunk, satsChunk, r.tag);
        c.whPendente -= whChunk;
        c.satsPendente = Math.max(0, c.satsPendente - satsChunk);
        this.onEvento(ev);
      }
    } else {
      // --- sem saldo suficiente: histerese antes de cortar ---
      c.semSaldoConsecutivo += 1;
      if (c.releLigado && c.semSaldoConsecutivo >= config.carenciaLeituras) {
        c.releLigado = false;
        this.enviarRele(c.casaId, false);
        const ev = this.ledger.registrarEvento(c.casaId, 'Corte', 0, 0);
        this.onEvento(ev);
      }
    }

    this.ledger.marcarTag(r.tag);
    this.ledger.atualizarCasa(c);
  }

  /** Recarga de saldo (pré-pago). Dispara religa na próxima leitura com consumo. */
  recarregar(casaId: string, sats: number): void {
    const c = this.ledger.casa(casaId);
    c.saldoSats += Math.max(0, Math.round(sats));
    // religa imediato se já dá pra religar e estava cortado
    if (!c.releLigado && c.saldoSats >= config.saldoMinimoReliga) {
      c.releLigado = true;
      this.enviarRele(casaId, true);
      const ev = this.ledger.registrarEvento(casaId, 'Religa', 0, 0);
      this.onEvento(ev);
    }
    this.ledger.atualizarCasa(c);
  }
}
