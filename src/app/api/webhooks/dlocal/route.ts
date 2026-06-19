import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarWebhook } from "@/lib/integrations/dlocal";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/dlocal — callback de status de cobrança da DLocal.
 * Localiza o pedido pelo id da transação (gateway_id) e, quando a DLocal
 * confirma o pagamento (status PAID), marca gateway_status = 'pago'.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const assinatura = request.headers.get("x-dlocal-signature");
  if (!validarWebhook(raw, assinatura)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // A DLocal envia o id da transação em `id` (fallbacks defensivos).
  const gatewayId = String(body.id ?? body.payment_id ?? body.transaction_id ?? "");
  const status = String(body.status ?? "").toUpperCase();
  if (!gatewayId) {
    return NextResponse.json({ error: "id da transação ausente" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: pedido, error: errLoad } = await admin
    .from("pedidos")
    .select("id, numero, gateway_status")
    .eq("gateway_id", gatewayId)
    .maybeSingle();
  if (errLoad) return NextResponse.json({ error: errLoad.message }, { status: 500 });
  if (!pedido) return NextResponse.json({ error: "pedido não encontrado" }, { status: 404 });

  const pago = status === "PAID";
  if (pago) {
    const { error: errUpd } = await admin
      .from("pedidos")
      .update({ gateway_status: "pago" })
      .eq("id", pedido.id);
    if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pedido: pedido.numero, pago });
}
