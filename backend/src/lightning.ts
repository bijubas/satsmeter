import { config } from './config';

export interface PagamentoResultado {
  ok: boolean;
  modo: 'lnbits' | 'simulado';
  ref: string;        // hash/id do pagamento
  sats: number;
}

let contador = 0;

/**
 * Liquida `sats` ao produtor de energia.
 *
 * - Se LNBITS_URL estiver configurado, tenta uma chamada real ao LNbits.
 * - Caso contrário (ou se a chamada falhar), cai no modo simulado — o evento
 *   ainda é registrado no ledger. Nunca lança: a contabilidade não pode ser
 *   bloqueada por indisponibilidade do nó Lightning (fail-safe do README).
 */
export async function pagarProdutor(sats: number, memo: string): Promise<PagamentoResultado> {
  contador += 1;
  const refSim = `sim-${Date.now().toString(36)}-${contador}`;

  if (!config.lnbitsUrl || !config.lnbitsInvoiceKey) {
    return { ok: true, modo: 'simulado', ref: refSim, sats };
  }

  try {
    // MVP: cria um invoice interno no LNbits como prova de liquidação.
    // Em produção, troque por keysend/BOLT11 para a carteira do produtor.
    const resp = await fetch(`${config.lnbitsUrl}/api/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.lnbitsInvoiceKey },
      body: JSON.stringify({ out: false, amount: Math.max(1, Math.round(sats)), memo }),
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) throw new Error(`LNbits HTTP ${resp.status}`);
    const data: any = await resp.json();
    const ref = data.payment_hash || data.checking_id || refSim;
    return { ok: true, modo: 'lnbits', ref, sats };
  } catch (err) {
    // Degrada para simulado sem quebrar o fluxo.
    console.warn(`[lightning] LNbits indisponível, liquidando em modo simulado: ${(err as Error).message}`);
    return { ok: true, modo: 'simulado', ref: refSim, sats };
  }
}
