import "server-only";

/**
 * dLocal Go — gateway de pagamento (Payins / Checkout Link).
 *
 * Auth (oficial): header `Authorization: Bearer <API_KEY>:<SECRET_KEY>`.
 * Criar pagamento: POST {base}/v1/payments  → retorna { id, redirect_url, status }.
 * Consultar:       GET  {base}/v1/payments/{id} → { status, order_id }.
 * Status possíveis: PENDING | PAID | REJECTED | CANCELLED | EXPIRED.
 *
 * Sem libs externas — fetch nativo. Toda função trata erro e NUNCA lança:
 * retorna um objeto de resultado discriminado para o chamador decidir o fallback.
 *
 * Docs: https://docs.dlocalgo.com/integration-api
 */

// Só aceita uma URL http(s) válida; qualquer outro valor (placeholder, vazio,
// "pendente", etc.) cai no endpoint oficial de produção. Sem barra final.
const BASE_RAW = process.env.DLOCAL_API_BASE?.trim();
const BASE = BASE_RAW && /^https?:\/\//i.test(BASE_RAW)
  ? BASE_RAW.replace(/\/+$/, "")
  : "https://api.dlocalgo.com";

function credenciais(): { key: string; secret: string } | null {
  const key = process.env.DLOCAL_API_KEY;
  const secret = process.env.DLOCAL_SECRET;
  if (!key || !secret) return null;
  return { key, secret };
}

export function dlocalGoConfigurado(): boolean {
  return credenciais() !== null;
}

function authHeader(c: { key: string; secret: string }): string {
  // Formato exato exigido pela dLocal Go.
  return `Bearer ${c.key}:${c.secret}`;
}

// Webhook NUNCA pode pendurar numa chamada externa: se a dLocal demorar, o
// Z-API estoura o timeout e derruba a conexão (Status 0) + reenvia. Abortamos
// rápido e devolvemos um erro tratável.
const TIMEOUT_CRIAR_MS = 12_000;
const TIMEOUT_CONSULTA_MS = 8_000;

function ehAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

export type CriarLinkResultado =
  | { ok: true; paymentId: string; redirectUrl: string; status: string }
  | { ok: false; error: string };

/**
 * Cria um link de pagamento (payin) para o pedido. País PY, moeda PYG.
 * `pedidoId` vai em `order_id` (external reference) — usado para casar o webhook.
 */
export async function createPaymentLink(params: {
  pedidoId: string;
  amount: number;
  description: string;
  appUrl: string;
}): Promise<CriarLinkResultado> {
  const c = credenciais();
  if (!c) return { ok: false, error: "dLocal não configurado (faltam DLOCAL_API_KEY / DLOCAL_SECRET)." };

  try {
    const res = await fetch(`${BASE}/v1/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader(c) },
      body: JSON.stringify({
        amount: params.amount,
        currency: "PYG",
        country: "PY",
        order_id: params.pedidoId,
        description: params.description.slice(0, 100),
        notification_url: `${params.appUrl}/api/webhooks/dlocal`,
        success_url: `${params.appUrl}/pagamento/sucesso`,
        back_url: params.appUrl,
      }),
      signal: AbortSignal.timeout(TIMEOUT_CRIAR_MS),
    });

    if (res.status === 429) {
      return { ok: false, error: "Limite de requisições da dLocal atingido. Tente novamente em instantes." };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (data.message ?? data.error ?? data.code ?? `HTTP ${res.status}`) as string;
      return { ok: false, error: `dLocal recusou a criação (${msg}).` };
    }

    const redirectUrl = typeof data.redirect_url === "string" ? data.redirect_url : "";
    const paymentId = data.id != null ? String(data.id) : "";
    if (!redirectUrl || !paymentId) {
      return { ok: false, error: "dLocal não retornou redirect_url/id." };
    }
    return { ok: true, paymentId, redirectUrl, status: String(data.status ?? "PENDING").toUpperCase() };
  } catch (err) {
    if (ehAbort(err)) return { ok: false, error: `dLocal não respondeu em ${TIMEOUT_CRIAR_MS / 1000}s (timeout).` };
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede com a dLocal." };
  }
}

export type ConsultaPagamento =
  | { ok: true; status: string; orderId: string }
  | { ok: false; error: string };

/** Consulta autoritativa do status de um pagamento (usada pelo webhook). */
export async function getPayment(paymentId: string): Promise<ConsultaPagamento> {
  const c = credenciais();
  if (!c) return { ok: false, error: "dLocal não configurado." };
  try {
    const res = await fetch(`${BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: authHeader(c) },
      signal: AbortSignal.timeout(TIMEOUT_CONSULTA_MS),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: `dLocal GET ${res.status}` };
    return {
      ok: true,
      status: String(data.status ?? "").toUpperCase(),
      orderId: String(data.order_id ?? ""),
    };
  } catch (err) {
    if (ehAbort(err)) return { ok: false, error: `dLocal não respondeu em ${TIMEOUT_CONSULTA_MS / 1000}s (timeout).` };
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede com a dLocal." };
  }
}
