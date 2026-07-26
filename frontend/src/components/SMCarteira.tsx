import type { CasaEstado, SaldosLightning } from '../types';
import { fmtInt, fmtHora, fmtEnergia } from '../format';

/** Uma casa sem leitura há mais que isso é considerada silenciosa. */
const SILENCIO_MS = 30_000;

interface Props {
  casas: CasaEstado[];
  /** recusas consecutivas até o corte (CARENCIA_LEITURAS do backend) */
  carencia: number;
  /** saldos reais das carteiras LNbits (custódia), não o pré-pago do ledger */
  lightning?: SaldosLightning;
}

/**
 * SM-Carteira — saldo pré-pago por casa, ao vivo.
 * Alimentado pelo mesmo push de WebSocket do extrato (backend emite a cada 1s),
 * então saldo, relé e recusas refletem o estado real do medidor.
 */
export function SMCarteira({ casas, carencia, lightning }: Props) {
  const agora = Date.now();
  const ordenadas = [...casas].sort((a, b) => a.casaId.localeCompare(b.casaId));
  const saldoTotal = ordenadas.reduce((s, c) => s + c.saldoSats, 0);
  const ln = lightning;
  const lnAtivo = !!ln && ln.produtorSats !== null;

  return (
    <div className="card carteira">
      <div className="ext-head">
        <span className="ext-title">
          Carteira · saldo pré-pago
          {ordenadas.length > 1 && (
            <span className="cart-total">{fmtInt(saldoTotal)} sats no total</span>
          )}
        </span>
        <span className="ext-live"><span className="dot dot-green" />ao vivo</span>
      </div>

      {/* Custódia Lightning — números da carteira LNbits, não do ledger */}
      {lnAtivo && (
        <div className={'cart-ln' + (ln!.online ? '' : ' off')}>
          <span className="cart-ln-label">
            <span className={'dot ' + (ln!.online ? 'dot-green' : 'off')} />
            Carteiras Lightning (LNbits)
          </span>
          <span className="cart-ln-item">
            Produtor recebeu <strong>{fmtInt(ln!.produtorSats ?? 0)}</strong> sats
          </span>
          {ln!.consumidorSats !== null && (
            <span className="cart-ln-item">
              Consumidor custodia <strong>{fmtInt(ln!.consumidorSats)}</strong> sats
            </span>
          )}
          <span className="cart-ln-nota">
            {ln!.online ? 'liquidação real entre carteiras' : 'LNbits offline · último valor conhecido'}
          </span>
        </div>
      )}

      <div className="cart-grid cart-colhead">
        <span>Casa</span>
        <span className="text-right">Saldo</span>
        <span className="text-right">Pago ao produtor</span>
        <span className="text-right">Consumo</span>
        <span className="text-right">Última leitura</span>
        <span className="text-right">Relé</span>
      </div>

      {ordenadas.length === 0 ? (
        <div className="ext-empty">nenhuma casa reportando…</div>
      ) : (
        ordenadas.map((c) => {
          const falhas = c.falhasPagamento ?? 0;
          const silencio = !c.ultimaLeitura || agora - c.ultimaLeitura > SILENCIO_MS;
          const energia = fmtEnergia((c.whAcumulado ?? 0) / 1000);

          return (
            <div className="cart-grid cart-row" key={c.casaId}>
              <span className="cart-casa">
                <span className={'dot ' + (c.releLigado ? 'dot-green' : 'off')} />
                <span className="cart-id">{c.casaId}</span>
                {falhas > 0 && (
                  <span className="cart-falhas" title="recusas de pagamento consecutivas">
                    {falhas}/{carencia} recusas
                  </span>
                )}
              </span>
              <span className={'cart-saldo' + (c.saldoSats <= 0 ? ' zerado' : '')}>
                {fmtInt(c.saldoSats)}<em> sats</em>
              </span>
              <span className="cart-num">{fmtInt(c.satsPagos ?? 0)}</span>
              <span className="cart-num">{energia.valor}<em> {energia.unidade}</em></span>
              <span className={'cart-hora' + (silencio ? ' stale' : '')}>
                {c.ultimaLeitura ? fmtHora(c.ultimaLeitura) : '—'}
              </span>
              <span className={'cart-rele ' + (c.releLigado ? 'on' : 'off')}>
                {c.releLigado ? 'Ligado' : 'Cortado'}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
