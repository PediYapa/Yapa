import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { processarEventoEntregasExpressas, type WebhookPayload } from "@/lib/integrations/entregas-expressas-eventos";
import type { ZapiConfig } from "@/lib/integrations/zapi";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/entregas-expressas — eventos de status da Entregas
 * Expressas (padrão Open Delivery / ABRASEL): PENDING, ACCEPTED, REJECTED,
 * PICKUP_ONGOING, ORDER_PICKED, ORDER_DELIVERED, CANCELLED, etc.
 *
 * Precisa responder 204 em até 10s — qualquer outra coisa dispara retry com
 * backoff do lado deles. Por isso: valida, enfileira efeitos best-effort,
 * responde rápido.
 *
 * Assinatura: HMAC-SHA256 do body cru, chave = client_secret da org, no
 * header X-App-Signature. O header X-App-MerchantId identifica QUAL org
 * (é o merchant.id que enviamos na criação da entrega) — sem ele não dá pra
 * saber qual client_secret usar pra validar, então é lido ANTES do parse.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const merchantId = request.headers.get("X-App-MerchantId");
  const signature = request.headers.get("X-App-Signature");
  if (!merchantId || !signature) {
    return NextResponse.json({ error: "Headers de autenticação ausentes." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Acha a org pelo merchant.id (é o valor que NÓS geramos e enviamos —
  // ver entregas_expressas_merchant_id em yapa.orgs).
  const { data: org, error: errOrg } = await admin
    .from("orgs")
    .select("id, entregas_expressas_client_secret, zapi_instance, zapi_token, zapi_client_token")
    .eq("entregas_expressas_merchant_id", merchantId)
    .maybeSingle();
  if (errOrg || !org || !org.entregas_expressas_client_secret) {
    console.error("[yapa:entregas-expressas] merchantId desconhecido:", merchantId);
    // 401 e não 404 — não confirmar pro chamador se o merchantId "quase existe".
    return NextResponse.json({ error: "Merchant não reconhecido." }, { status: 401 });
  }

  if (!validarAssinatura(rawBody, signature, org.entregas_expressas_client_secret)) {
    console.error("[yapa:entregas-expressas] assinatura inválida", { merchantId });
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const zapiCfg: ZapiConfig | null =
    org.zapi_instance && org.zapi_token
      ? { instance: org.zapi_instance, token: org.zapi_token, clientToken: org.zapi_client_token }
      : null;

  const r = await processarEventoEntregasExpressas({ admin, orgId: org.id, zapiCfg, payload });
  if (!r.ok) {
    console.error("[yapa:entregas-expressas] processamento falhou:", r.error);
    // Ainda assim 204: retry deles não vai resolver um orderId inexistente ou
    // erro de dados nosso — evita fila de retry infinita por um bug nosso.
    // Erros transitórios (DB fora do ar) já teriam sido um throw, não um {ok:false}.
    return new NextResponse(null, { status: 204 });
  }

  console.log("[yapa:entregas-expressas] evento processado", { acao: r.acao, orderId: payload.orderId });
  return new NextResponse(null, { status: 204 });
}

function validarAssinatura(rawBody: string, headerSignature: string, clientSecret: string): boolean {
  try {
    const expected = crypto.createHmac("sha256", clientSecret).update(rawBody).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(headerSignature, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
