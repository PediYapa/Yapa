import "server-only";

/**
 * Confirmação de pagamento — lógica compartilhada por TODOS os webhooks de
 * gateway (hoje /api/webhooks/dlocal; futuros Dinelco/Asaas reusam isto e
 * ficam com ~30 linhas: validar a notificação, consultar o gateway via
 * adapter e chamar confirmarPagamentoPedido).
 *
 * Idempotente: pedido já 'pago'/'em_separacao' não re-dispara o despacho.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { dispararOrdemDistribuidora } from "@/lib/despacho";

export type ConfirmacaoResultado =
  | { ok: true; pedidoNumero: number; pago: boolean }
  | { ok: false; error: string; http: 404 | 500 };

export async function confirmarPagamentoPedido(input: {
  /** id do pedido (external reference do gateway), se a consulta trouxe. */
  pedidoId: string | null;
  /** id da transação no gateway (fallback de busca + persistido no pedido). */
  gatewayId: string;
  /** status cru do gateway (persistido em gateway_status). */
  status: string;
  /** true somente quando o gateway confirmou o pagamento (autoritativo). */
  pago: boolean;
}): Promise<ConfirmacaoResultado> {
  const admin = createAdminClient();

  // Identifica o pedido pelo external_reference; fallback pelo gateway_id.
  let pedidoId = input.pedidoId;
  if (!pedidoId) {
    const { data: porGateway } = await admin
      .from("pedidos").select("id").eq("gateway_id", input.gatewayId).maybeSingle();
    pedidoId = porGateway?.id ?? null;
  }
  if (!pedidoId) return { ok: false, error: "pedido não encontrado", http: 404 };

  const { data: pedido, error: errLoad } = await admin
    .from("pedidos")
    .select("id, numero, status")
    .eq("id", pedidoId)
    .maybeSingle();
  if (errLoad) return { ok: false, error: errLoad.message, http: 500 };
  if (!pedido) return { ok: false, error: "pedido não encontrado", http: 404 };

  // Registra sempre o status do gateway.
  await admin
    .from("pedidos")
    .update({ gateway_id: input.gatewayId, gateway_status: input.status })
    .eq("id", pedido.id);

  if (!input.pago) return { ok: true, pedidoNumero: pedido.numero, pago: false };

  // Pago: marca 'pago' (idempotente) e dispara o duplo despacho
  // (comanda → distribuidora + corrida → grupo de motoboys).
  if (pedido.status !== "pago" && pedido.status !== "em_separacao") {
    await admin.from("pedidos").update({ status: "pago" }).eq("id", pedido.id);
    const despacho = await dispararOrdemDistribuidora(pedido.id);
    if (!despacho.ok) console.error("[yapa:pagamentos] despacho falhou:", despacho.error);
  }

  return { ok: true, pedidoNumero: pedido.numero, pago: true };
}
