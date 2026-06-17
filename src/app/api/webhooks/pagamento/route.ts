import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarWebhook } from "@/lib/integrations/dlocal";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/pagamento — confirmação de pagamento do DLocal.
 * Localiza o pedido pela referência (yapa-<numero>-<prefixo>), registra o
 * pagamento (normalizado em GS) e marca o pedido como pago.
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

  const referencia = String(body.reference || body.order_id || "");
  const status = String(body.status || "").toUpperCase();
  const valor = Number(body.amount || 0);
  const moedaPg = String(body.currency || "GS").toUpperCase();
  const moeda = (["GS", "PIX", "BRL"].includes(moedaPg) ? moedaPg : "GS") as "GS" | "PIX" | "BRL";

  // referência: yapa-<numero>-<prefixo>
  const m = /^yapa-(\d+)-/.exec(referencia);
  if (!m) return NextResponse.json({ error: "referência inválida" }, { status: 400 });
  const numero = Number(m[1]);

  const admin = createAdminClient();
  const { data: org } = await admin.from("orgs").select("id").limit(1).maybeSingle();
  if (!org) return NextResponse.json({ error: "org não configurada" }, { status: 500 });

  const { data: pedido } = await admin
    .from("pedidos")
    .select("*")
    .eq("org_id", org.id)
    .eq("numero", numero)
    .maybeSingle();
  if (!pedido) return NextResponse.json({ error: "pedido não encontrado" }, { status: 404 });

  const pago = status === "PAID" || status === "APPROVED" || status === "COMPLETED";

  await admin.from("pagamentos").insert({
    org_id: org.id,
    pedido_id: pedido.id,
    provedor: "dlocal",
    moeda,
    valor: valor || Number(pedido.valor_total_gs),
    valor_gs: Number(pedido.valor_total_gs),
    status: pago ? "pago" : "falha",
    referencia_externa: referencia,
  });

  if (pago) {
    await admin
      .from("pedidos")
      .update({ status: "pago", forma_pagamento: "dlocal" })
      .eq("id", pedido.id);
  }

  return NextResponse.json({ ok: true, pedido: pedido.numero, pago });
}
