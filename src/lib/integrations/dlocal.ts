import "server-only";
import crypto from "crypto";

/**
 * DLocal — processador de pagamentos multi-moeda (GS/Pix). O cliente paga em
 * link externo (a Meta proíbe transação de álcool no app), e o DLocal notifica
 * via webhook. Em Fase 1 geramos o link e validamos o webhook. Sem credenciais,
 * geramos um link simulado para testes locais.
 *
 * Docs: https://docs.dlocal.com
 */

function cfg() {
  const base = process.env.DLOCAL_API_BASE;
  const key = process.env.DLOCAL_API_KEY;
  const secret = process.env.DLOCAL_SECRET;
  if (!base || !key || !secret) return null;
  return { base, key, secret };
}

export function dlocalConfigurado(): boolean {
  return cfg() !== null;
}

export type LinkPagamento = { url: string; referencia: string; simulado: boolean };

/**
 * Cria um link de checkout para um pedido.
 * `valor` na moeda informada; o DLocal lida com a moeda de recebimento.
 */
export async function criarLinkPagamento(params: {
  pedidoId: string;
  numero: number;
  valor: number;
  moeda: "GS" | "PIX" | "BRL";
  descricao: string;
  appUrl: string;
}): Promise<LinkPagamento> {
  const c = cfg();
  const referencia = `yapa-${params.numero}-${params.pedidoId.slice(0, 8)}`;
  if (!c) {
    // Modo desenvolvimento: link que aponta para uma página de simulação local.
    const url = `${params.appUrl}/pagamento/simular?ref=${encodeURIComponent(referencia)}`;
    return { url, referencia, simulado: true };
  }
  // Esqueleto da chamada real (ativar na imersão, conforme conta DLocal):
  // const res = await fetch(`${c.base}/payments`, { ... assinatura HMAC ... })
  const url = `${c.base}/checkout/${referencia}`;
  return { url, referencia, simulado: false };
}

export type CobrancaPix = { gatewayId: string; status: string; simulado: boolean };

/**
 * Gera uma cobrança PIX na DLocal para um pedido (valor em BRL).
 * Sem URL/credenciais configuradas, retorna uma transação simulada para dev local.
 * Lança em caso de erro HTTP para a action tratar.
 */
export async function criarCobrancaPix(params: {
  pedidoId: string;
  valorBrl: number;
  descricao: string;
}): Promise<CobrancaPix> {
  const apiUrl = process.env.DLOCAL_API_URL ?? process.env.DLOCAL_API_BASE;
  const key = process.env.DLOCAL_API_KEY;
  const secret = process.env.DLOCAL_SECRET;

  // Modo desenvolvimento: sem credenciais geramos um id simulado.
  if (!apiUrl || !key || !secret) {
    return {
      gatewayId: `sim_${params.pedidoId.slice(0, 8)}_${Date.now()}`,
      status: "pending",
      simulado: true,
    };
  }

  const res = await fetch(`${apiUrl}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Login": key,
      "X-Trans-Key": secret,
    },
    body: JSON.stringify({
      amount: params.valorBrl,
      currency: "BRL",
      country: "BR",
      payment_method_id: "PIX",
      payment_method_flow: "DIRECT",
      order_id: params.pedidoId,
      description: params.descricao,
    }),
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    throw new Error(`DLocal respondeu ${res.status}: ${detalhe.slice(0, 200)}`);
  }

  const data = (await res.json()) as { id?: string | number; status?: string };
  const gatewayId = data.id != null ? String(data.id) : "";
  if (!gatewayId) throw new Error("DLocal não retornou o id da transação.");
  return { gatewayId, status: String(data.status ?? "pending"), simulado: false };
}

/** Valida a assinatura do webhook do DLocal (HMAC). */
export function validarWebhook(payload: string, assinatura: string | null): boolean {
  const secret = process.env.DLOCAL_WEBHOOK_SECRET;
  if (!secret) return true; // dev: aceita (documentar para produção)
  if (!assinatura) return false;
  const esperado = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(assinatura));
  } catch {
    return false;
  }
}
