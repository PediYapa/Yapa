import "server-only";

/**
 * Tradução do webhook Open Delivery (Entregas Expressas) pro estado interno.
 *
 * Dois níveis:
 *  - yapa.entregas.evento_externo → grava o event.type BRUTO, 1:1, sempre.
 *    É a fonte de verdade fina (pro histórico e pra UI mostrar "chegou no
 *    estabelecimento" vs "saiu pra entregar", por exemplo).
 *  - yapa.pedidos.status / yapa.entregas.status → só avançam no fluxo MACRO
 *    (o board e PEDIDO_TRANSICOES em lib/intel/status.ts), então mapeamos
 *    pros status já existentes em vez de inflar o enum principal.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto } from "@/lib/integrations/zapi";
import type { ZapiConfig } from "@/lib/integrations/zapi";
import type { EntregaEventoExterno, PedidoStatus, EntregaStatus, EntregaRow } from "@/lib/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/** event.type → status macro do pedido. null = não avança o status do pedido (só grava o evento fino). */
const EVENTO_PARA_PEDIDO_STATUS: Record<EntregaEventoExterno, PedidoStatus | null> = {
  PENDING: null, // já é 'em_separacao'/'despachado' quando criamos a entrega
  ACCEPTED: "despachado",
  REJECTED: null, // tratado à parte — pode acionar fallback
  PICKUP_ONGOING: "despachado",
  ARRIVED_AT_MERCHANT: "despachado",
  ORDER_PICKED: "em_entrega",
  DELIVERY_ONGOING: "em_entrega",
  ARRIVED_AT_CUSTOMER: "em_entrega",
  ORDER_DELIVERED: "entregue",
  RETURNING_TO_MERCHANT: "em_entrega",
  RETURNED_TO_MERCHANT: "despachado",
  DELIVERY_FINISHED: "entregue",
  CANCELLED: null, // tratado à parte
};

/** event.type → status macro da entrega (yapa.entregas.status, enum já existente). */
const EVENTO_PARA_ENTREGA_STATUS: Record<EntregaEventoExterno, EntregaStatus | null> = {
  PENDING: "aguardando",
  ACCEPTED: "aguardando",
  REJECTED: "cancelada",
  PICKUP_ONGOING: "aguardando",
  ARRIVED_AT_MERCHANT: "aguardando",
  ORDER_PICKED: "coletado",
  DELIVERY_ONGOING: "em_entrega",
  ARRIVED_AT_CUSTOMER: "em_entrega",
  ORDER_DELIVERED: "entregue",
  RETURNING_TO_MERCHANT: "em_entrega",
  RETURNED_TO_MERCHANT: "cancelada",
  DELIVERY_FINISHED: "entregue",
  CANCELLED: "cancelada",
};

export type WebhookPayload = {
  deliveryId: string;
  orderId: string;
  orderDisplayId: string;
  merchant: { id: string; name: string };
  event: {
    type: EntregaEventoExterno;
    datetime: string;
    message?: string;
    rejectionInfo?: { reason: string };
  };
  customerName: string;
  vehicle?: { type: string; container: string; containerSize?: string; instruction?: string };
  deliveryPrice?: { price: { value: number; currency: string }; pricingList: string; additionalPricePercentual: number };
  eta?: Record<string, unknown>;
  deliveryPerson?: { id: string; name: string; phone?: string; pictureURL?: string };
  externalTrackingURL?: string;
  combinedOrdersIds?: string[];
};

export type ProcessarEventoResult = { ok: true; acao: string } | { ok: false; error: string };

export async function processarEventoEntregasExpressas(input: {
  admin: AdminClient;
  orgId: string;
  zapiCfg: ZapiConfig | null;
  payload: WebhookPayload;
}): Promise<ProcessarEventoResult> {
  const { admin, orgId, zapiCfg, payload } = input;
  const { deliveryId, orderId, event } = payload;

  // 1) Idempotência — grava no log de dedupe ANTES de processar. Se a chave
  //    (delivery_id, event_type, event_datetime) já existe, é reentrega: sai.
  const { error: errLog } = await admin.from("entregas_expressas_webhook_log").insert({
    org_id: orgId,
    delivery_id: deliveryId,
    event_type: event.type,
    event_datetime: event.datetime,
    payload,
  });
  if (errLog) {
    // unique_violation (23505) = já processamos este evento exato. Não é erro.
    if (errLog.code === "23505") return { ok: true, acao: "evento-duplicado-ignorado" };
    console.error("[yapa:entregas-expressas] falha ao gravar log webhook:", errLog.message);
    return { ok: false, error: errLog.message };
  }

  // 2) Localiza a entrega pelo orderId que NÓS geramos (provedor_order_id).
  const { data: entrega, error: errEntrega } = await admin
    .from("entregas")
    .select("id, pedido_id, status")
    .eq("org_id", orgId)
    .eq("provedor_order_id", orderId)
    .maybeSingle();
  if (errEntrega) return { ok: false, error: errEntrega.message };
  if (!entrega) {
    console.warn("[yapa:entregas-expressas] webhook para orderId desconhecido:", orderId);
    return { ok: false, error: "orderId não corresponde a nenhuma entrega registrada." };
  }

  // 3) Atualiza a entrega com o evento fino + campos operacionais condicionais.
  const updateEntrega: Partial<EntregaRow> = {
    provedor_delivery_id: deliveryId,
    evento_externo: event.type,
    evento_externo_em: event.datetime,
  };
  const statusEntrega = EVENTO_PARA_ENTREGA_STATUS[event.type];
  if (statusEntrega) updateEntrega.status = statusEntrega;
  if (event.rejectionInfo?.reason) updateEntrega.rejeicao_motivo = event.rejectionInfo.reason;
  if (payload.deliveryPerson) {
    updateEntrega.entregador_provedor_id = payload.deliveryPerson.id;
    updateEntrega.entregador_nome = payload.deliveryPerson.name;
    updateEntrega.entregador_telefone = payload.deliveryPerson.phone ?? null;
    updateEntrega.entregador_foto_url = payload.deliveryPerson.pictureURL ?? null;
  }
  if (payload.externalTrackingURL) updateEntrega.tracking_url = payload.externalTrackingURL;
  if (payload.deliveryPrice?.price?.value != null) updateEntrega.preco_gs = payload.deliveryPrice.price.value;
  if (event.type === "ORDER_PICKED") updateEntrega.horario_coleta = event.datetime;
  if (event.type === "ORDER_DELIVERED" || event.type === "DELIVERY_FINISHED") updateEntrega.horario_entrega_realizado = event.datetime;

  const { error: errUpdateEntrega } = await admin.from("entregas").update(updateEntrega).eq("id", entrega.id);
  if (errUpdateEntrega) return { ok: false, error: errUpdateEntrega.message };

  // 4) Atualiza o status macro do pedido, respeitando PEDIDO_TRANSICOES —
  //    nunca fazemos update "cego": se a transição não é válida a partir do
  //    status atual, ignoramos silenciosamente (evento fora de ordem/atrasado).
  const novoStatusPedido = EVENTO_PARA_PEDIDO_STATUS[event.type];
  if (novoStatusPedido) {
    const { data: pedidoAtual } = await admin.from("pedidos").select("status, numero, cliente_id, codigo_validacao").eq("id", entrega.pedido_id).single();
    if (pedidoAtual) {
      const { PEDIDO_TRANSICOES } = await import("@/lib/intel/status");
      if (PEDIDO_TRANSICOES[pedidoAtual.status]?.includes(novoStatusPedido)) {
        await admin.from("pedidos").update({ status: novoStatusPedido }).eq("id", entrega.pedido_id);

        // Notificação ao cliente — só nos marcos que importam pra ele, best-effort.
        const { data: cliente } = pedidoAtual.cliente_id
          ? await admin.from("clientes").select("telefone").eq("id", pedidoAtual.cliente_id).maybeSingle()
          : { data: null };
        if (cliente?.telefone) {
          const msg = mensagemClientePorEvento(event.type, pedidoAtual.numero, payload.deliveryPerson?.name ?? null);
          if (msg) {
            try { await enviarTexto(cliente.telefone, msg, zapiCfg); } catch { /* não-bloqueante */ }
          }
        }
      }
    }
  }

  // 5) REJECTED/CANCELLED: pedido substituição foi decisão explícita, então
  //    NÃO fazemos fallback automático pro WhatsApp — só marcamos "quebra"
  //    pra alguém tratar manualmente no painel (rota de fallback fica pro
  //    time decidir depois, conforme conversamos).
  if (event.type === "REJECTED" || event.type === "CANCELLED") {
    const { data: pedidoAtual } = await admin.from("pedidos").select("status").eq("id", entrega.pedido_id).single();
    if (pedidoAtual) {
      const { PEDIDO_TRANSICOES } = await import("@/lib/intel/status");
      if (PEDIDO_TRANSICOES[pedidoAtual.status]?.includes("quebra")) {
        await admin.from("pedidos").update({ status: "quebra" }).eq("id", entrega.pedido_id);
      }
    }
    console.warn("[yapa:entregas-expressas] entrega rejeitada/cancelada", {
      orderId, motivo: event.rejectionInfo?.reason, mensagem: event.message,
    });
  }

  return { ok: true, acao: `evento-${event.type.toLowerCase()}` };
}

function mensagemClientePorEvento(tipo: EntregaEventoExterno, numeroPedido: number, entregadorNome: string | null): string | null {
  switch (tipo) {
    case "ACCEPTED":
      return `✅ Seu pedido #${numeroPedido} foi aceito e logo sai para entrega. 🛵🍻`;
    case "ORDER_PICKED":
      return `📦 Seu pedido #${numeroPedido} foi coletado${entregadorNome ? ` por ${entregadorNome}` : ""} e está a caminho!`;
    case "ARRIVED_AT_CUSTOMER":
      return `🚪 O entregador chegou com seu pedido #${numeroPedido}! Informe o código de confirmação na porta.`;
    case "ORDER_DELIVERED":
    case "DELIVERY_FINISHED":
      return `✅ Pedido #${numeroPedido} entregue! Obrigado pela preferência. 🍻`;
    default:
      return null;
  }
}
