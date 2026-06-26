import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment } from "@/lib/dlocal";
import { dispararOrdemDistribuidora } from "@/lib/despacho";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/dlocal — notificação de pagamento da dLocal Go.
 *
 * A dLocal envia apenas `{ payment_id }`. Por segurança, NÃO confiamos no corpo:
 * consultamos o status autoritativo via GET /v1/payments/{id}. Assim, mesmo um
 * webhook forjado não consegue marcar um pedido como pago.
 *
 * Fluxo: payment_id → GET status + order_id → se PAID, pedido vira 'pago' e
 * dispara a comanda de separação para a distribuidora (em_separacao).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // A dLocal Go manda o id do pagamento (fallbacks defensivos).
  const paymentId = String(body.payment_id ?? body.id ?? "").trim();
  if (!paymentId) return NextResponse.json({ error: "payment_id ausente" }, { status: 400 });

  // Consulta autoritativa do status real na dLocal.
  const consulta = await getPayment(paymentId);
  if (!consulta.ok) {
    console.error("[yapa:dlocal] getPayment falhou:", consulta.error);
    return NextResponse.json({ error: consulta.error }, { status: 502 });
  }
  console.log("[yapa:dlocal] notificação", { paymentId, status: consulta.status, orderId: consulta.orderId });

  const admin = createAdminClient();

  // Identifica o pedido pelo external_reference (order_id = pedido_id); fallback gateway_id.
  let pedidoId = consulta.orderId || null;
  if (!pedidoId) {
    const { data: porGateway } = await admin.from("pedidos").select("id").eq("gateway_id", paymentId).maybeSingle();
    pedidoId = porGateway?.id ?? null;
  }
  if (!pedidoId) return NextResponse.json({ error: "pedido não encontrado" }, { status: 404 });

  const { data: pedido, error: errLoad } = await admin
    .from("pedidos")
    .select("id, numero, status")
    .eq("id", pedidoId)
    .maybeSingle();
  if (errLoad) return NextResponse.json({ error: errLoad.message }, { status: 500 });
  if (!pedido) return NextResponse.json({ error: "pedido não encontrado" }, { status: 404 });

  // Registra sempre o status do gateway.
  await admin.from("pedidos").update({ gateway_id: paymentId, gateway_status: consulta.status }).eq("id", pedido.id);

  if (consulta.status !== "PAID") {
    return NextResponse.json({ ok: true, pedido: pedido.numero, status: consulta.status, pago: false });
  }

  // Pago: marca 'pago' (idempotente) e dispara a comanda à distribuidora.
  if (pedido.status !== "pago" && pedido.status !== "em_separacao") {
    await admin.from("pedidos").update({ status: "pago" }).eq("id", pedido.id);
    const despacho = await dispararOrdemDistribuidora(pedido.id);
    if (!despacho.ok) console.error("[yapa:dlocal] despacho falhou:", despacho.error);
  }

  return NextResponse.json({ ok: true, pedido: pedido.numero, pago: true });
}
