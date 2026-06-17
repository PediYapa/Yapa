import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { interpretarMensagem } from "@/lib/integrations/openai";
import { enviarTexto } from "@/lib/integrations/zapi";
import type { ConversaMensagem } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/whatsapp — recebe mensagens inbound do Z-API.
 * Fase 1: registra a conversa, interpreta a mensagem com o agente e responde
 * de forma "rústica" (guiada). Operação single-tenant: resolve a org única.
 *
 * Segurança: opcional via ?secret= comparado a ZAPI_WEBHOOK_SECRET.
 * Em produção, restringir por IP/secret do Z-API.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.ZAPI_WEBHOOK_SECRET;
  if (secret && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Ignora mensagens enviadas por nós mesmos
  if (body.fromMe === true) return NextResponse.json({ ok: true, ignored: "fromMe" });

  const phone = String(body.phone || body.from || "").replace(/\D/g, "");
  const texto =
    (typeof body.text === "object" && body.text
      ? String((body.text as Record<string, unknown>).message || "")
      : String(body.message || body.text || "")) || "";
  if (!phone) return NextResponse.json({ error: "telefone ausente" }, { status: 400 });

  const admin = createAdminClient();
  const { data: org } = await admin.from("orgs").select("id").limit(1).maybeSingle();
  if (!org) return NextResponse.json({ error: "org não configurada" }, { status: 500 });
  const orgId = org.id;
  const agora = new Date().toISOString();

  // localiza/cria conversa aberta para o telefone
  const { data: existente } = await admin
    .from("conversas")
    .select("*")
    .eq("org_id", orgId)
    .eq("telefone", phone)
    .not("status", "eq", "arquivada")
    .order("created_at", { ascending: false })
    .maybeSingle();

  const msgCliente: ConversaMensagem = { de: "cliente", texto, tipo: "texto", em: agora };

  // agente interpreta (no-op heurístico se OPENAI ausente)
  const intencao = await interpretarMensagem(texto);
  const conversa = existente;
  const handoff = conversa?.handoff_humano ?? false;

  const novasMensagens: ConversaMensagem[] = [...(conversa?.mensagens ?? []), msgCliente];

  // só responde automaticamente se um humano não assumiu
  if (!handoff && intencao.resposta_sugerida) {
    novasMensagens.push({ de: "bot", texto: intencao.resposta_sugerida, tipo: "texto", em: agora });
    try {
      await enviarTexto(phone, intencao.resposta_sugerida);
    } catch {
      /* não-bloqueante */
    }
  }

  if (conversa) {
    await admin
      .from("conversas")
      .update({
        mensagens: novasMensagens,
        ultima_mensagem_em: agora,
        status: handoff ? conversa.status : "aberta",
      })
      .eq("id", conversa.id);
  } else {
    // tenta vincular a um cliente existente
    const { data: cli } = await admin
      .from("clientes")
      .select("id")
      .eq("org_id", orgId)
      .eq("telefone", phone)
      .maybeSingle();
    await admin.from("conversas").insert({
      org_id: orgId,
      cliente_id: cli?.id ?? null,
      telefone: phone,
      canal: "whatsapp",
      status: "aberta",
      mensagens: novasMensagens,
      ultima_mensagem_em: agora,
    });
  }

  return NextResponse.json({ ok: true, intencao: intencao.intencao });
}
