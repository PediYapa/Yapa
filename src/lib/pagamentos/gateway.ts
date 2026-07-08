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
 * Seleção do gateway ativo:
 *  - env PAYMENT_GATEWAY = "dlocal" | "none" força a escolha ("none" desliga o
 *    pagamento online mesmo com credenciais presentes);
 *  - sem a env: usa o primeiro adapter com credenciais configuradas;
 *  - nenhum configurado → null: o bot oferece só dinheiro na entrega, com
 *    mensagem honesta (nunca gera link que vai falhar).
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

/** Gateway ativo, ou null se pagamento online está indisponível. */
export function getGateway(): PaymentGateway | null {
  const forcado = process.env.PAYMENT_GATEWAY?.trim().toLowerCase();
  if (forcado === "none" || forcado === "off") return null;
  if (forcado) {
    const gw = ADAPTERS[forcado];
    return gw?.configurado() ? gw : null;
  }
  for (const gw of Object.values(ADAPTERS)) {
    if (gw.configurado()) return gw;
  }
  return null;
}

/** Status para painéis (ex.: card de integrações em /configuracoes). */
export function gatewayStatus(): { nome: string; ok: boolean } {
  const gw = getGateway();
  return gw
    ? { nome: `${gw.nome} (pagamento online)`, ok: true }
    : { nome: "Gateway de pagamento (online)", ok: false };
}
