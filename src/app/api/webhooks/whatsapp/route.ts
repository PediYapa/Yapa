import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { interpretarMensagem } from "@/lib/integrations/openai";
import { enviarTexto, enviarImagem, enviarBotoes, enviarPoll, type ZapiConfig } from "@/lib/integrations/zapi";
import { executarFluxo, tipoEntidadeDoNo, type ProdutoInfo, type EntidadeTipo } from "@/lib/intel/fluxo-engine";
import { montarListaEntidade, FALLBACK_ENTIDADE } from "@/lib/intel/fluxo-entidades";
import type { ConversaMensagem, FluxoEstado, FluxoNode } from "@/lib/database.types";

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
  if (!phone) return NextResponse.json({ error: "telefone ausente" }, { status: 400 });

  // Extrai o texto efetivo e detecta respostas interativas (clique em botão ou voto em enquete).
  // Ambos os casos são tratados como entrada válida sem precisar de número digitado.
  const tipoMsg = String(body.type || "").toLowerCase();
  let texto = "";
  let respostaInterativa = false;

  if (tipoMsg === "buttonsresponse") {
    // Usuário clicou num botão interativo (send-button-list).
    const br = body.buttonsResponseMessage as Record<string, unknown> | undefined;
    texto = String(br?.selectedDisplayText ?? br?.selectedButtonId ?? "");
    respostaInterativa = texto.length > 0;
  } else if (tipoMsg === "pollupdate") {
    // Usuário votou numa enquete (send-poll). Z-API devolve os votos em `votes` ou `values`.
    const pu = body.pollUpdateMessage as Record<string, unknown> | undefined;
    const votes =
      ((pu?.votes ?? pu?.values) as Array<Record<string, unknown>> | undefined) ?? [];
    // Pega a primeira opção que tenha pelo menos um voto (evita desvotes / recuo).
    const votado = votes.find((v) => {
      const nome = v.name ?? v.optionName;
      const votantes = v.voterNames ?? v.voters;
      return nome != null && (votantes == null || (Array.isArray(votantes) && votantes.length > 0));
    });
    texto = String(votado?.name ?? votado?.optionName ?? "");
    respostaInterativa = texto.length > 0;
  } else {
    // Mensagem de texto comum.
    texto =
      (typeof body.text === "object" && body.text
        ? String((body.text as Record<string, unknown>).message || "")
        : String(body.message || body.text || "")) || "";
  }

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
      const getNode = (id: string): FluxoNode | undefined => fluxo.nodes.find((n) => n.id === id);

      // Resolve os produtos de nós de PRODUTO ÚNICO (com produto_id) — nome/preço/imagem.
      // Nós de catálogo (produto sem produto_id) são resolvidos dinamicamente mais abaixo.
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

      // Estado só vale se for do mesmo fluxo ativo; senão recomeça do início.
      const estado =
        conversa?.fluxo_estado && conversa.fluxo_estado.fluxo_id === fluxo.id ? conversa.fluxo_estado : null;

      // Envia a lista de entidade no formato rico adequado (botões / enquete / texto)
      // e registra no histórico. Fallback amigável se o Supabase ou Z-API falhar.
      const enviarLista = async (no: FluxoNode, ent: EntidadeTipo): Promise<void> => {
        const envio = await montarListaEntidade(admin, orgId, no, ent);
        let msgLog: string;
        try {
          if (!envio) {
            await enviarTexto(phone, FALLBACK_ENTIDADE, zapiCfg);
            msgLog = FALLBACK_ENTIDADE;
          } else if (envio.modo === "texto") {
            await enviarTexto(phone, envio.mensagem, zapiCfg);
            msgLog = envio.mensagem;
          } else if (envio.modo === "botoes") {
            await enviarBotoes(phone, envio.titulo, envio.botoes, zapiCfg);
            msgLog = `[botões] ${envio.titulo} [${envio.botoes.map((b) => b.label).join(" | ")}]`;
          } else {
            // poll
            await enviarPoll(phone, envio.titulo, envio.opcoes, zapiCfg);
            msgLog = `[enquete] ${envio.titulo} [${envio.opcoes.join(" | ")}]`;
          }
        } catch {
          // Qualquer falha de envio → texto de fallback, não-bloqueante
          try { await enviarTexto(phone, FALLBACK_ENTIDADE, zapiCfg); } catch { /* noop */ }
          msgLog = FALLBACK_ENTIDADE;
        }
        novasMensagens.push({ de: "bot", texto: msgLog, tipo: "texto", em: agora });
      };

      // (A) Já estávamos pausados num nó de entidade?
      //     • Resposta interativa (botão/poll) → sempre válida, avança o fluxo.
      //     • Número digitado → válido, avança.
      //     • Texto livre → inválido, reapresenta a lista e aguarda.
      const noEspera = estado?.no_atual ? getNode(estado.no_atual) : undefined;
      const entEspera = noEspera ? tipoEntidadeDoNo(noEspera) : null;
      const escolha = Number.parseInt(texto.trim(), 10);
      const selecaoValida = respostaInterativa || (Number.isInteger(escolha) && escolha >= 1);

      if (entEspera && noEspera && !selecaoValida) {
        await enviarLista(noEspera, entEspera);
        respondeuPorFluxo = true;
        fluxoEstado = { fluxo_id: fluxo.id, no_atual: noEspera.id, atualizado_em: agora };
      } else {
        // (B) Navegação normal pelo engine (puro). Uma seleção válida num nó de entidade
        //     faz o engine avançar pela aresta padrão a partir dele.
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

        // (C) Roteamento por tipo de nó: o engine pausou num nó de entidade
        //     (produto-catálogo / hub / entregador)? Consulta o banco, envia a lista
        //     numerada e mantém o estado nesse nó, aguardando a seleção numérica.
        if (resultado.no_atual) {
          const no = getNode(resultado.no_atual);
          const ent = no ? tipoEntidadeDoNo(no) : null;
          if (no && ent) {
            await enviarLista(no, ent);
            respondeuPorFluxo = true;
          }
        }
      }

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
