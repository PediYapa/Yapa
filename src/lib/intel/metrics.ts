/**
 * Métricas do dashboard — núcleo determinístico e puro (sem banco).
 * Recebe linhas já carregadas e calcula os KPIs das três visões
 * (comercial, operacional, financeiro).
 */
import type { PedidoRow, PedidoStatus } from "@/lib/database.types";

const ABERTOS: PedidoStatus[] = [
  "recebido", "aguardando_pagamento", "pago", "roteado", "em_separacao", "despachado", "em_entrega",
];

export type Kpis = {
  pedidosHoje: number;
  faturamentoHojeGs: number;
  ticketMedioGs: number;
  emAndamento: number;
  entreguesHoje: number;
  aguardandoPagamento: number;
  quebras: number;
  taxaConclusao: number; // % entregue sobre não-cancelado (período carregado)
};

function isHoje(iso: string, hojeISO: string): boolean {
  return iso.slice(0, 10) === hojeISO;
}

export function calcularKpis(pedidos: PedidoRow[], hojeISO: string): Kpis {
  const doDia = pedidos.filter((p) => isHoje(p.created_at, hojeISO));
  const pagosDoDia = doDia.filter((p) =>
    ["pago", "roteado", "em_separacao", "despachado", "em_entrega", "entregue"].includes(p.status),
  );
  const faturamentoHojeGs = pagosDoDia.reduce((s, p) => s + Number(p.valor_total_gs || 0), 0);
  const entreguesHoje = doDia.filter((p) => p.status === "entregue").length;
  const emAndamento = pedidos.filter((p) => ABERTOS.includes(p.status)).length;
  const aguardandoPagamento = pedidos.filter((p) => p.status === "aguardando_pagamento").length;
  const quebras = pedidos.filter((p) => p.status === "quebra").length;

  const naoCancelados = pedidos.filter((p) => p.status !== "cancelado" && p.status !== "estornado");
  const entregues = pedidos.filter((p) => p.status === "entregue").length;
  const taxaConclusao = naoCancelados.length ? (entregues / naoCancelados.length) * 100 : 0;

  return {
    pedidosHoje: doDia.length,
    faturamentoHojeGs,
    ticketMedioGs: pagosDoDia.length ? faturamentoHojeGs / pagosDoDia.length : 0,
    emAndamento,
    entreguesHoje,
    aguardandoPagamento,
    quebras,
    taxaConclusao,
  };
}

/** Série dos últimos N dias: { dia: 'YYYY-MM-DD', pedidos, faturamentoGs }. */
export function serieDiaria(pedidos: PedidoRow[], dias: string[]): {
  dia: string;
  pedidos: number;
  faturamentoGs: number;
}[] {
  return dias.map((dia) => {
    const doDia = pedidos.filter((p) => p.created_at.slice(0, 10) === dia);
    const fat = doDia
      .filter((p) => ["pago", "roteado", "em_separacao", "despachado", "em_entrega", "entregue"].includes(p.status))
      .reduce((s, p) => s + Number(p.valor_total_gs || 0), 0);
    return { dia, pedidos: doDia.length, faturamentoGs: fat };
  });
}
