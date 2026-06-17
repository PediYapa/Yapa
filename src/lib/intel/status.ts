/**
 * Metadados de status do pedido — rótulos, cor do badge e transições válidas.
 * Fonte única para UI e Server Actions (evita strings soltas).
 */
import type { PedidoStatus, EntregaStatus, PagamentoStatus } from "@/lib/database.types";

type BadgeVariant = "default" | "primary" | "accent" | "success" | "warning" | "destructive" | "outline";

export const PEDIDO_STATUS_META: Record<PedidoStatus, { label: string; variant: BadgeVariant }> = {
  recebido: { label: "Recebido", variant: "outline" },
  aguardando_pagamento: { label: "Aguardando pagamento", variant: "warning" },
  pago: { label: "Pago", variant: "primary" },
  roteado: { label: "Roteado", variant: "primary" },
  em_separacao: { label: "Em separação", variant: "accent" },
  despachado: { label: "Despachado", variant: "accent" },
  em_entrega: { label: "Em entrega", variant: "accent" },
  entregue: { label: "Entregue", variant: "success" },
  cancelado: { label: "Cancelado", variant: "destructive" },
  estornado: { label: "Estornado", variant: "destructive" },
  quebra: { label: "Quebra de pedido", variant: "destructive" },
};

/** Fluxo feliz (ordem). Usado para o board e para sugerir o "próximo passo". */
export const PEDIDO_FLUXO: PedidoStatus[] = [
  "recebido",
  "aguardando_pagamento",
  "pago",
  "roteado",
  "em_separacao",
  "despachado",
  "em_entrega",
  "entregue",
];

/** Transições permitidas a partir de cada status. */
export const PEDIDO_TRANSICOES: Record<PedidoStatus, PedidoStatus[]> = {
  recebido: ["aguardando_pagamento", "pago", "cancelado"],
  aguardando_pagamento: ["pago", "cancelado"],
  pago: ["roteado", "estornado", "cancelado"],
  roteado: ["em_separacao", "quebra", "cancelado"],
  em_separacao: ["despachado", "quebra", "cancelado"],
  despachado: ["em_entrega", "cancelado"],
  em_entrega: ["entregue", "quebra"],
  entregue: ["estornado"],
  cancelado: [],
  estornado: [],
  quebra: ["roteado", "estornado", "cancelado"],
};

export function proximoStatus(atual: PedidoStatus): PedidoStatus | null {
  const i = PEDIDO_FLUXO.indexOf(atual);
  if (i === -1 || i === PEDIDO_FLUXO.length - 1) return null;
  return PEDIDO_FLUXO[i + 1];
}

export const ENTREGA_STATUS_META: Record<EntregaStatus, { label: string; variant: BadgeVariant }> = {
  aguardando: { label: "Aguardando motorista", variant: "warning" },
  coletado: { label: "Coletado", variant: "primary" },
  em_entrega: { label: "Em entrega", variant: "accent" },
  entregue: { label: "Entregue", variant: "success" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

export const PAGAMENTO_STATUS_META: Record<PagamentoStatus, { label: string; variant: BadgeVariant }> = {
  pendente: { label: "Pendente", variant: "warning" },
  pago: { label: "Pago", variant: "success" },
  estornado: { label: "Estornado", variant: "destructive" },
  falha: { label: "Falha", variant: "destructive" },
};

/** Gera um código de validação de entrega (4 dígitos). */
export function gerarCodigoValidacao(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
