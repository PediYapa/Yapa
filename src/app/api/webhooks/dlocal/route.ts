import { NextResponse } from "next/server";
import { dlocalGateway } from "@/lib/pagamentos/adapters/dlocal";
import { confirmarPagamentoPedido } from "@/lib/pagamentos/confirmacao";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/dlocal — notificação de pagamento da dLocal Go.
 *
 * A dLocal envia apenas `{ payment_id }`. Por segurança, NÃO confiamos no corpo:
 * consultamos o status autoritativo via adapter (GET /v1/payments/{id}). Assim,
 * mesmo um webhook forjado não consegue marcar um pedido como pago.
 *
 * A confirmação em si (achar pedido → gravar gateway_status → 'pago' →
 * duplo despacho) é compartilhada em lib/pagamentos/confirmacao.ts — um
 * gateway futuro (Dinelco/Asaas) só precisa de uma rota irmã desta.
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

  // Consulta autoritativa do status real na dLocal (GET-confirm).
  const consulta = await dlocalGateway.consultar(paymentId);
  if (!consulta.ok) {
    console.error("[yapa:dlocal] consulta falhou:", consulta.error);
    return NextResponse.json({ error: consulta.error }, { status: 502 });
  }
  console.log("[yapa:dlocal] notificação", { paymentId, status: consulta.status, pedidoId: consulta.pedidoId });

  const r = await confirmarPagamentoPedido({
    pedidoId: consulta.pedidoId,
    gatewayId: paymentId,
    status: consulta.status,
    pago: consulta.pago,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.http });

  return NextResponse.json({ ok: true, pedido: r.pedidoNumero, status: consulta.status, pago: r.pago });
}
