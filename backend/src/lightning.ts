import { config } from './config';

export interface PagamentoResultado {
  ok: boolean;
  modo: 'lnbits' | 'simulado';
  ref: string;        // hash/id do pagamento
  sats: number;
  motivo?: string;    // preenchido quando ok=false (pagamento recusado)
}

let contador = 0;

/** Saldos das carteiras Lightning — distintos do saldo pré-pago do ledger. */
export interface SaldosLightning {
  produtorSats: number | null;     // null = carteira não configurada ou inacessível
  consumidorSats: number | null;
  atualizadoEm: number;            // epoch ms da última leitura bem-sucedida
  online: boolean;
}

let saldos: SaldosLightning = {
  produtorSats: null, consumidorSats: null, atualizadoEm: 0, online: false,
};

/** Último snapshot conhecido (síncrono — o refresh roda em background). */
export const saldosLightning = (): SaldosLightning => saldos;

async function saldoDaCarteira(chave: string): Promise<number | null> {
  if (!chave) return null;
  const resp = await fetch(`${config.lnbitsUrl}/api/v1/wallet`, {
    headers: { 'X-Api-Key': chave },
    signal: AbortSignal.timeout(3000),
  });
  if (!resp.ok) return null;
  const j: any = await resp.json();
  return Number.isFinite(j?.balance) ? j.balance / 1000 : null; // msat -> sats
}

/**
 * Relê os saldos das carteiras. Falha é silenciosa: mantém o último valor
 * conhecido e marca online=false, para o painel distinguir "sem dado" de "zero".
 */
export async function atualizarSaldosLightning(): Promise<void> {
  if (!config.lnbitsUrl) {
    saldos = { ...saldos, online: false };
    return;
  }
  try {
    const [produtor, consumidor] = await Promise.all([
      saldoDaCarteira(config.lnbitsProdutorInvoiceKey),
      saldoDaCarteira(config.lnbitsAdminKey || config.lnbitsInvoiceKey),
    ]);
    saldos = {
      produtorSats: produtor, consumidorSats: consumidor,
      atualizadoEm: Date.now(), online: true,
    };
    if (consumidor !== null) await recarregarSeNecessario(consumidor);
  } catch {
    saldos = { ...saldos, online: false };
  }
}

// ---- recarga automática da carteira do consumidor (demo) ----

let token: string | null = null;
let recargaEmCurso = false;

const recargaHabilitada = () =>
  config.lnbitsRecargaLimiar > 0 &&
  config.lnbitsRecargaValor > 0 &&
  !!config.lnbitsUsuario && !!config.lnbitsSenha && !!config.lnbitsWalletConsumidor;

/** Autentica no LNbits e guarda o token; devolve null se as credenciais falharem. */
async function obterToken(): Promise<string | null> {
  if (token) return token;
  const resp = await fetch(`${config.lnbitsUrl}/api/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.lnbitsUsuario, password: config.lnbitsSenha }),
    signal: AbortSignal.timeout(4000),
  });
  if (!resp.ok) {
    console.warn(`[lightning] login da recarga falhou (HTTP ${resp.status})`);
    return null;
  }
  const j: any = await resp.json();
  token = j?.access_token || null;
  return token;
}

/**
 * Credita a carteira do consumidor quando ela cai abaixo do limiar, para a demo
 * não parar. Requer conta com superusuário (PUT /users/api/v1/balance).
 *
 * Só faz sentido em demo com FakeWallet: cria saldo do nada. Em produção o
 * consumidor é recarregado por um pagamento Lightning de verdade.
 */
async function recarregarSeNecessario(saldoAtual: number): Promise<void> {
  if (!recargaHabilitada() || recargaEmCurso) return;
  if (saldoAtual >= config.lnbitsRecargaLimiar) return;

  recargaEmCurso = true;
  try {
    for (const tentativa of [1, 2]) {
      const tk = await obterToken();
      if (!tk) return;

      const resp = await fetch(`${config.lnbitsUrl}/users/api/v1/balance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({
          id: config.lnbitsWalletConsumidor,
          amount: Math.round(config.lnbitsRecargaValor),
        }),
        signal: AbortSignal.timeout(5000),
      });

      // token expirado: descarta e tenta uma vez mais
      if ((resp.status === 401 || resp.status === 403) && tentativa === 1) {
        token = null;
        continue;
      }
      if (!resp.ok) {
        console.warn(`[lightning] recarga automática falhou (HTTP ${resp.status})`);
        return;
      }
      console.log(
        `[lightning] carteira do consumidor recarregada: ${saldoAtual.toFixed(0)} -> ` +
          `~${(saldoAtual + config.lnbitsRecargaValor).toFixed(0)} sats ` +
          `(limiar ${config.lnbitsRecargaLimiar})`,
      );
      return;
    }
  } catch (err) {
    console.warn(`[lightning] recarga automática indisponível: ${(err as Error).message}`);
  } finally {
    recargaEmCurso = false;
  }
}

/**
 * O LNbits responde 520 para falha de pagamento — saldo insuficiente, invoice
 * inválida, sem rota. É recusa de negócio, não indisponibilidade, e por isso
 * entra na contagem de corte junto com os 4xx.
 */
const ehRecusa = (status: number) => (status >= 400 && status < 500) || status === 520;

interface Resposta { status: number; json: any; texto: string }

async function chamarLnbits(caminho: string, chave: string, corpo: unknown): Promise<Resposta> {
  const resp = await fetch(`${config.lnbitsUrl}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': chave },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(4000),
  });
  const texto = await resp.text().catch(() => '');
  let json: any = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo não-JSON */ }
  return { status: resp.status, json, texto };
}

const detalhe = (r: Resposta) => r.json?.detail || r.texto.slice(0, 160) || `HTTP ${r.status}`;

const recusado = (sats: number, motivo: string): PagamentoResultado => {
  console.warn(`[lightning] ${motivo}`);
  return { ok: false, modo: 'lnbits', ref: '', sats, motivo };
};

/**
 * Liquidação real entre carteiras: gera a invoice na carteira do PRODUTOR e a
 * paga com a admin key do CONSUMIDOR. O LNbits reconhece que a invoice é interna
 * e move os dois saldos na hora — funciona com FakeWallet, sem nó Lightning
 * externo. Requer LNBITS_ADMIN_KEY + LNBITS_PRODUTOR_INVOICE_KEY.
 */
async function liquidarEntreCarteiras(sats: number, memo: string): Promise<PagamentoResultado> {
  const inv = await chamarLnbits(
    '/api/v1/payments', config.lnbitsProdutorInvoiceKey, { out: false, amount: sats, memo },
  );
  if (ehRecusa(inv.status)) return recusado(sats, `invoice do produtor recusada: ${detalhe(inv)}`);
  if (inv.status >= 500) throw new Error(`LNbits HTTP ${inv.status} ao gerar invoice`);

  const bolt11 = inv.json?.bolt11 || inv.json?.payment_request;
  if (!bolt11) throw new Error('LNbits não devolveu bolt11');

  const pag = await chamarLnbits('/api/v1/payments', config.lnbitsAdminKey, { out: true, bolt11 });
  if (ehRecusa(pag.status)) return recusado(sats, `pagamento recusado: ${detalhe(pag)}`);
  if (pag.status >= 500) throw new Error(`LNbits HTTP ${pag.status} ao pagar`);

  return {
    ok: true, modo: 'lnbits', sats,
    ref: pag.json?.payment_hash || inv.json?.payment_hash || '',
  };
}

/** MVP: só registra a invoice como prova de liquidação. NÃO move saldo algum. */
async function registrarInvoice(sats: number, memo: string, refSim: string): Promise<PagamentoResultado> {
  const inv = await chamarLnbits(
    '/api/v1/payments', config.lnbitsInvoiceKey, { out: false, amount: sats, memo },
  );
  if (ehRecusa(inv.status)) return recusado(sats, `LNbits recusou: ${detalhe(inv)}`);
  if (inv.status >= 500) throw new Error(`LNbits HTTP ${inv.status}`);
  return {
    ok: true, modo: 'lnbits', sats,
    ref: inv.json?.payment_hash || inv.json?.checking_id || refSim,
  };
}

/**
 * Liquida `sats` ao produtor de energia.
 *
 * - Com LNBITS_ADMIN_KEY + LNBITS_PRODUTOR_INVOICE_KEY: transferência real entre
 *   as carteiras do consumidor e do produtor (o saldo de ambas se move).
 * - Só com LNBITS_INVOICE_KEY: cai no MVP, que apenas registra a invoice.
 * - Sem LNBITS_URL: modo simulado.
 *
 * **Recusa** (4xx ou 520) devolve `ok: false` — é inadimplência de verdade e
 * alimenta a contagem de corte no Meter. **Indisponibilidade** (timeout, rede
 * fora, 5xx que não 520) degrada para simulado com `ok: true`: a contabilidade
 * não pode ser bloqueada — nem o consumidor cortado — por falha de
 * infraestrutura (fail-safe do README: queda de rede ≠ inadimplência).
 *
 * Nunca lança.
 */
export async function pagarProdutor(sats: number, memo: string): Promise<PagamentoResultado> {
  contador += 1;
  const refSim = `sim-${Date.now().toString(36)}-${contador}`;
  const valor = Math.max(1, Math.round(sats));

  if (!config.lnbitsUrl || !config.lnbitsInvoiceKey) {
    return { ok: true, modo: 'simulado', ref: refSim, sats };
  }

  try {
    return config.lnbitsAdminKey && config.lnbitsProdutorInvoiceKey
      ? await liquidarEntreCarteiras(valor, memo)
      : await registrarInvoice(valor, memo, refSim);
  } catch (err) {
    // Indisponibilidade: degrada para simulado sem cortar ninguém.
    console.warn(`[lightning] LNbits indisponível, liquidando em modo simulado: ${(err as Error).message}`);
    return { ok: true, modo: 'simulado', ref: refSim, sats };
  }
}
