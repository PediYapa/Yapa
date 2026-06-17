import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { interpretarMensagem } from "@/lib/integrations/openai";
import { enviarTexto, enviarImagem, enviarBotoes, type ZapiConfig } from "@/lib/integrations/zapi";
import { executarFluxo, type ProdutoInfo } from "@/lib/intel/fluxo-engine";
import type { ConversaMensagem, FluxoEstado } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/whatsapp — recebe mensagens inbound do Z-API.
 * Fase 1: registra a conversa, interpreta a mensagem com o agente e responde
 * de forma "rústica" (guiada). Operação single-tenant: resolve a org única.
 *
 * Segurança: opcional via ?secret= comparado a ZAPI_WEBHOOK_SECRET ou ao
 * zapi_webhook_secret salvo na org.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);

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

  // Carrega a org com as credenciais Z-API salvas no banco
  const { data: org } = await admin
    .from("orgs")
    .select("id, zapi_instance, zapi_token, zapi_client_token, zapi_webhook_secret")
    .limit(1)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "org não configurada" }, { status: 500 });

  // Valida o secret do webhook (env var tem precedência sobre o banco)
  const secret = process.env.ZAPI_WEBHOOK_SECRET ?? org.zapi_webhook_secret;
  if (secret && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  // Monta config Z-API: credenciais do banco têm precedência sobre env vars
  const zapiCfg: ZapiConfig | null =
    org.zapi_instance && org.zapi_token
      ? { instance: org.zapi_instance, token: org.zapi_token, clientToken: org.zapi_client_token }
      : null;

  const orgId = org.id;
  const agora = new Date().toISOString();

  // Localiza/cria conversa aberta para o telefone
  const { data: existente } = await admin
    .from("conversas")
    .select("*")
    .eq("org_id", orgId)
    .eq("telefone", phone)
    .not("status", "eq", "arquivada")
    .order("created_at", { ascending: false })
    .maybeSingle();

  const msgCliente: ConversaMensagem = { de: "cliente", texto, tipo: "texto", em: agora };

  const conversa = existente;
  const handoff = conversa?.handoff_humano ?? false;
  const novasMensagens: ConversaMensagem[] = [...(conversa?.mensagens ?? []), msgCliente];

  let fluxoEstado: FluxoEstado | null = conversa?.fluxo_estado ?? null;
  let acionarHandoff = false;
  let respondeuPorFluxo = false;
  let intencaoLabel: string | undefined;

  // 1) Fluxo ativo tem prioridade (se um humano não assumiu).
  if (!handoff) {
    const { data: fluxo } = await admin
      .from("fluxos")
      .select("id, nodes, edges")
      .eq("org_id", orgId)
      .eq("ativo", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (fluxo && (fluxo.nodes?.length ?? 0) > 0) {
      // Resolve os produtos referenciados pelo fluxo (nome/preço/imagem do catálogo).
      const produtoIds = fluxo.nodes
        .filter((n) => n.data?.tipo === "produto" && n.data.produto_id)
        .map((n) => n.data.produto_id as string);
      let produtosMap = new Map<string, ProdutoInfo>();
      if (produtoIds.length) {
        const { data: prods } = await admin
          .from("produtos")
          .select("id, nome, preco_gs, imagem_url")
          .in("id", produtoIds);
        produtosMap = new Map(
          (prods ?? []).map((p) => [p.id, { nome: p.nome, preco_gs: p.preco_gs, imagem_url: p.imagem_url }]),
        );
      }

      // Se a conversa estava noutro fluxo (ou em nenhum), começa do início.
      const estado =
        conversa?.fluxo_estado && conversa.fluxo_estado.fluxo_id === fluxo.id ? conversa.fluxo_estado : null;

      const resultado = executarFluxo(
        { nodes: fluxo.nodes, edges: fluxo.edges },
        estado,
        texto,
        (id) => produtosMap.get(id),
      );

      for (const envio of resultado.envios) {
        try {
          if (envio.tipo === "texto") await enviarTexto(phone, envio.texto, zapiCfg);
          else if (envio.tipo === "imagem") await enviarImagem(phone, envio.imagem_url, envio.caption, zapiCfg);
          else await enviarBotoes(phone, envio.texto, envio.botoes, zapiCfg);
        } catch {
          /* não-bloqueante */
        }
        const textoLog =
          envio.tipo === "texto"
            ? envio.texto
            : envio.tipo === "imagem"
              ? `[imagem] ${envio.caption ?? envio.imagem_url}`
              : `${envio.texto} [${envio.botoes.map((b) => b.label).join(" | ")}]`;
        novasMensagens.push({ de: "bot", texto: textoLog, tipo: envio.tipo, em: agora });
      }

      respondeuPorFluxo = resultado.envios.length > 0;
      acionarHandoff = resultado.handoff;
      fluxoEstado = resultado.no_atual
        ? { fluxo_id: fluxo.id, no_atual: resultado.no_atual, atualizado_em: agora }
        : null;
      if (respondeuPorFluxo) intencaoLabel = "fluxo";
    }
  }

  // 2) Fallback: sem fluxo que respondeu → agente OpenAI (comportamento anterior).
  if (!handoff && !respondeuPorFluxo) {
    const intencao = await interpretarMensagem(texto);
    intencaoLabel = intencao.intencao;
    if (intencao.resposta_sugerida) {
      novasMensagens.push({ de: "bot", texto: intencao.resposta_sugerida, tipo: "texto", em: agora });
      try {
        await enviarTexto(phone, intencao.resposta_sugerida, zapiCfg);
      } catch {
        /* não-bloqueante */
      }
    }
  }

  const handoffFinal = handoff || acionarHandoff;

  if (conversa) {
    await admin
      .from("conversas")
      .update({
        mensagens: novasMensagens,
        ultima_mensagem_em: agora,
        handoff_humano: handoffFinal,
        fluxo_estado: fluxoEstado,
        status: handoffFinal
          ? conversa.status === "arquivada"
            ? conversa.status
            : "pendente"
          : "aberta",
      })
      .eq("id", conversa.id);
  } else {
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
      status: handoffFinal ? "pendente" : "aberta",
      handoff_humano: handoffFinal,
      fluxo_estado: fluxoEstado,
      mensagens: novasMensagens,
      ultima_mensagem_em: agora,
    });
  }

  return NextResponse.json({ ok: true, intencao: intencaoLabel });
}
