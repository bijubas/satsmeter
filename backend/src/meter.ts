import { config, satsForWh } from './config';
import { Ledger } from './ledger';
import { pagarProdutor } from './lightning';
import type { Evento, CasaEstado } from './types';

type EnviarRele = (casaId: string, ligar: boolean) => void;
type OnEvento = (ev: Evento) => void;

/**
 * Núcleo de negócio do SatsMeter (regras do README):
 *  - recebe energia ACUMULADA do firmware, calcula o delta e dispara
 *    microliquidações Lightning;
 *  - histerese: corta só após CARENCIA_LEITURAS pagamentos RECUSADOS consecutivos;
 *  - anti-flapping: religa só com saldo >= SALDO_MINIMO_RELIGA;
 *  - fail-safe: nem o silêncio do medidor nem o LNbits fora do ar cortam —
 *    só recusa explícita do Lightning (HTTP 4xx) conta como inadimplência;
 *  - idempotência: tag (casa|data_hora) repetida devolve o ACK anterior sem cobrar.
 */
export class Meter {
  private fila: Promise<void> = Promise.resolve(); // serializa o processamento

  constructor(
    private ledger: Ledger,
    private enviarRele: EnviarRele,
    private onEvento: OnEvento,
  ) {}

  /**
   * Processa uma leitura do firmware (energia acumulada em kWh).
   * Enfileira para execução sequencial (evita corridas).
   */
  processarEnergiaAcumulada(
    casaId: string, energiaKwhAcum: number, watts: number, ts: number, tag: string,
  ): Promise<void> {
    this.fila = this.fila
      .then(() => this._processar(casaId, energiaKwhAcum, watts, ts, tag))
      .catch((err) => console.error('[meter] erro processando leitura:', err));
    return this.fila;
  }

  private async _processar(
    casaId: string, energiaKwhAcum: number, _watts: number, ts: number, tag: string,
  ) {
    // idempotência: mesma leitura reenviada -> ignora
    if (tag && this.ledger.tagVista(tag)) return;

    const c = this.ledger.casa(casaId);
    c.ultimaLeitura = ts || Date.now();

    // primeira leitura da casa (ou após reboot do device): só calibra o baseline
    if (!Number.isFinite(c.ultimoKwhAcum) || energiaKwhAcum < c.ultimoKwhAcum) {
      c.ultimoKwhAcum = energiaKwhAcum;
      this.ledger.marcarTag(tag);
      this.ledger.atualizarCasa(c);
      return;
    }

    const deltaWh = Math.max(0, (energiaKwhAcum - c.ultimoKwhAcum) * 1000);
    c.ultimoKwhAcum = energiaKwhAcum;

    if (deltaWh > 0) await this._cobrar(c, deltaWh, tag);

    this.ledger.marcarTag(tag);
    this.ledger.atualizarCasa(c);
  }

  /** Aplica a cobrança de `wh` de energia consumida à casa `c`. */
  private async _cobrar(c: CasaEstado, wh: number, tag: string) {
    const custo = satsForWh(wh);

    // Sem crédito para pagar: é uma tentativa de pagamento inválida, e entra na
    // MESMA contagem da recusa do LNbits (ver loop abaixo). Corta na CARENCIA_LEITURAS.
    if (c.saldoSats < custo) {
      c.semSaldoConsecutivo += 1;
      c.falhasPagamento += 1;
      console.warn(
        `[meter] pagamento inválido (${c.casaId}) ${c.falhasPagamento}/${config.carenciaLeituras}: ` +
          `saldo ${c.saldoSats.toFixed(0)} < custo ${custo.toFixed(0)} sats`,
      );
      if (c.releLigado && c.falhasPagamento >= config.carenciaLeituras) {
        c.releLigado = false;
        this.enviarRele(c.casaId, false);
        this.onEvento(this.ledger.registrarEvento(c.casaId, 'Corte', 0, 0));
      }
      return;
    }

    // consumidor com saldo: debita e credita o produtor
    c.saldoSats -= custo;
    c.whAcumulado += wh;
    c.satsPagos += custo;
    c.semSaldoConsecutivo = 0;
    c.whPendente += wh;
    c.satsPendente += custo;

    // fecha microliquidações a cada WH_POR_LIQ consumidos
    while (c.whPendente >= config.whPorLiq) {
      const whChunk = config.whPorLiq;
      const satsChunk = Math.max(1, Math.round(satsForWh(whChunk)));
      const res = await pagarProdutor(satsChunk, `SatsMeter ${c.casaId} ${whChunk}Wh`);

      if (!res.ok) {
        // Pagamento recusado: estorna o chunk (não houve liquidação), conta a
        // falha e corta após CARENCIA_LEITURAS recusas consecutivas. A energia
        // segue pendente e será retentada na próxima leitura.
        c.saldoSats += satsChunk;
        c.satsPagos = Math.max(0, c.satsPagos - satsChunk);
        c.falhasPagamento += 1;
        console.warn(
          `[meter] pagamento inválido (${c.casaId}) ${c.falhasPagamento}/${config.carenciaLeituras}: ${res.motivo ?? 'recusado'}`,
        );
        if (c.releLigado && c.falhasPagamento >= config.carenciaLeituras) {
          c.releLigado = false;
          this.enviarRele(c.casaId, false);
          this.onEvento(this.ledger.registrarEvento(c.casaId, 'Corte', 0, 0));
        }
        break; // não insiste nos demais chunks desta leitura
      }

      c.falhasPagamento = 0;
      const ev = this.ledger.registrarEvento(c.casaId, 'Liquidação', whChunk, satsChunk, tag);
      c.whPendente -= whChunk;
      c.satsPendente = Math.max(0, c.satsPendente - satsChunk);
      this.onEvento(ev);

      // religa: pagamento voltou a ser aceito e há saldo mínimo (anti-flapping)
      if (!c.releLigado && c.saldoSats >= config.saldoMinimoReliga) {
        c.releLigado = true;
        this.enviarRele(c.casaId, true);
        this.onEvento(this.ledger.registrarEvento(c.casaId, 'Religa', 0, 0));
      }
    }
  }

  /** Recarga de saldo (pré-pago). Dispara religa se já der pra religar. */
  recarregar(casaId: string, sats: number): void {
    const c = this.ledger.casa(casaId);
    c.saldoSats += Math.max(0, Math.round(sats));
    c.falhasPagamento = 0; // recarga dá crédito novo: zera as recusas anteriores
    if (!c.releLigado && c.saldoSats >= config.saldoMinimoReliga) {
      c.releLigado = true;
      this.enviarRele(casaId, true);
      this.onEvento(this.ledger.registrarEvento(casaId, 'Religa', 0, 0));
    }
    this.ledger.atualizarCasa(c);
  }
}
