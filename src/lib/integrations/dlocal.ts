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
