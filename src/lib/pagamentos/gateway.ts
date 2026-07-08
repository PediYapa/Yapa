import "server-only";

/**
 * PORTA DE PAGAMENTO — contrato único entre o bot/checkout e qualquer gateway.
 *
 * Contexto de negócio: a conta dLocal NÃO foi aprovada; o gateway definitivo
 * ainda será contratado (candidatos: Dinelco, Asaas, ou similar). O restante do
 * sistema (bot, webhooks, painéis) fala SÓ com esta porta — trocar de gateway é
 * escrever um adapter e registrá-lo aqui, sem tocar no motor do bot.
 *
 * Como plugar um gateway novo: ver docs/specs/gateway-pagamento.md (checklist).
 *
 * Seleção do gateway ativo — OPT-IN EXPLÍCITO:
 *  - env PAYMENT_GATEWAY = "dlocal" (ou slug futuro) liga o adapter, se as
 *    credenciais dele existirem; "none"/ausente = pagamento online DESLIGADO.
 *  - Por que não auto-detectar por credenciais: sobraram chaves dLocal de teste
 *    na Vercel e a conta NÃO foi aprovada — auto religaria um gateway sem
 *    contrato. Ligar gateway é decisão de negócio, não efeito colateral de env.
 */
import type { FormaPagamento } from "@/lib/database.types";
import { dlocalGateway } from "@/lib/pagamentos/adapters/dlocal";

export type GatewayLinkParams = {
  pedidoId: string;
  /** Valor TOTAL a cobrar em Guarani (produtos + frete). */
  valorGs: number;
  descricao: string;
  appUrl: string;
};

export type GatewayLinkResultado =
  | { ok: true; gatewayId: string; url: string; status: string }
  | { ok: false; error: string };

export type GatewayConsulta =
  | { ok: true; pago: boolean; status: string; pedidoId: string | null }
  | { ok: false; error: string };

export type PaymentGateway = {
  /** Slug estável (ex.: "dlocal", "dinelco", "asaas"). */
  id: string;
  /** Nome de exibição nos painéis. */
  nome: string;
  /** Valor gravado em pedidos.forma_pagamento (enum yapa.forma_pagamento). */
  formaPagamento: FormaPagamento;
  configurado(): boolean;
  criarLink(params: GatewayLinkParams): Promise<GatewayLinkResultado>;
  /** Consulta AUTORITATIVA na API do gateway (padrão GET-confirm dos webhooks). */
  consultar(gatewayId: string): Promise<GatewayConsulta>;
};

/** Registro de adapters disponíveis. Gateway novo = 1 linha aqui + 1 arquivo em adapters/. */
const ADAPTERS: Record<string, PaymentGateway> = {
  dlocal: dlocalGateway,
};

/** Gateway ativo, ou null se pagamento online está desligado/indisponível. */
export function getGateway(): PaymentGateway | null {
  const slug = process.env.PAYMENT_GATEWAY?.trim().toLowerCase();
  if (!slug || slug === "none" || slug === "off") return null;
  const gw = ADAPTERS[slug];
  if (!gw) {
    console.error(`[yapa:pagamentos] PAYMENT_GATEWAY="${slug}" não tem adapter registrado.`);
    return null;
  }
  return gw.configurado() ? gw : null;
}

/** Status para painéis (ex.: card de integrações em /configuracoes). */
export function gatewayStatus(): { nome: string; ok: boolean } {
  const gw = getGateway();
  return gw
    ? { nome: `${gw.nome} (pagamento online)`, ok: true }
    : { nome: "Gateway de pagamento (online)", ok: false };
}
