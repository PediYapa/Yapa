import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { interpretarMensagem } from "@/lib/integrations/openai";
import { enviarTexto, enviarImagem, enviarBotoes, enviarPoll, type ZapiConfig } from "@/lib/integrations/zapi";
import { executarFluxo, tipoEntidadeDoNo, type ProdutoInfo, type EntidadeTipo } from "@/lib/intel/fluxo-engine";
import { montarListaEntidade, resolverSelecaoProduto, FALLBACK_ENTIDADE } from "@/lib/intel/fluxo-entidades";
import { recuperarOuCriarSessao, salvarSessao } from "@/lib/intel/sessao-whatsapp";
import type { ConversaMensagem, FluxoEstado, FluxoNode, CarrinhoItem } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/whatsapp — recebe mensagens inbound do Z-API.
 *
 * Extração de interatividade:
 *  - ButtonsResponse: `texto` recebe o `selectedButtonId` (ID original do botão)
 *    que o engine usa para localizar a aresta pelo `sourceHandle`. O `selectedDisplayText`
 *    fica em `textoEntidade` exclusivamente para resolução de produtos/entidades.
 *  - PollUpdate: ambas as variáveis recebem o nome da opção (não há ID separado em polls).
 *  - Texto livre: ambas são iguais.
 *
 * Sanitização de telefone: `.replace(/\D/g, "")` aplicado antes de qualquer lookup.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.fromMe === true) return NextResponse.json({ ok: true, ignored: "fromMe" });

  const phone = String(body.phone || body.from || "").replace(/\D/g, "");
  if (!phone) return NextResponse.json({ error: "telefone ausente" }, { status: 400 });

  const tipoMsg = String(body.type || "").toLowerCase();

  // Log diagnóstico: mostra o que o Z-API está enviando (visível em Vercel → Functions → logs).
  console.log("[yapa:webhook]", {
    type: body.type,
    phone: phone.slice(-4),
    keys: Object.keys(body).join(","),
    buttonsResponseMessage: body.buttonsResponseMessage != null,
    buttonResponseMessage:  body.buttonResponseMessage  != null,
    listResponseMessage:    body.listResponseMessage    != null,
    text: typeof body.text === "string" ? body.text?.slice(0, 30) : typeof body.text,
    message: typeof body.message === "string" ? String(body.message).slice(0, 30) : undefined,
  });

  let texto = "";
  let textoEntidade = "";
  let respostaInterativa = false;

  // Detecta resposta de botão/lista pelo CONTEÚDO do body, não só pelo type.
  // Z-API pode enviar type="ReceivedCallback", "ButtonsResponse", "LIST_RESPONSE", etc.
  const brPayload =
    (body.buttonsResponseMessage ?? body.buttonResponseMessage ?? body.listResponseMessage) as
    | Record<string, unknown>
    | undefined;

  const ehRespostaBotao =
    brPayload != null ||
    tipoMsg === "buttonsresponse" ||
    tipoMsg === "listresponse" ||
    tipoMsg === "buttonresponse";

  if (ehRespostaBotao && brPayload) {
    // Log completo para ver exatamente o que Z-API manda dentro de buttonsResponseMessage.
    console.log("[yapa:brPayload]", JSON.stringify(brPayload));
    // Z-API usa "buttonId"/"message" (não "selectedButtonId"/"selectedDisplayText").
    const buttonId    = String(brPayload.selectedButtonId ?? brPayload.buttonId ?? brPayload.listId ?? brPayload.id    ?? "").trim();
    const displayText = String(brPayload.selectedDisplayText ?? brPayload.message ?? brPayload.title ?? brPayload.label ?? "").trim();
    texto        = buttonId   || displayText;
    textoEntidade = displayText || buttonId;
    respostaInterativa = texto.length > 0;
    console.log("[yapa:botao]", { tipoMsg, buttonId, displayText, texto, phone: phone.slice(-4) });
  } else if (tipoMsg === "pollupdate") {
    // Polls não têm ID separado — a opção selecionada é o próprio texto.
    const pu = body.pollUpdateMessage as Record<string, unknown> | undefined;
    const votes =
      ((pu?.votes ?? pu?.values) as Array<Record<string, unknown>> | undefined) ?? [];
    const votado = votes.find((v) => {
      const nome = v.name ?? v.optionName;
      const votantes = v.voterNames ?? v.voters;
      return nome != null && (votantes == null || (Array.isArray(votantes) && votantes.length > 0));
    });
    texto        = String(votado?.name ?? votado?.optionName ?? "");
    textoEntidade = texto;
    respostaInterativa = texto.length > 0;
  } else {
    // Mensagem de texto comum.
    texto =
      (typeof body.text === "object" && body.text
        ? String((body.text as Record<string, unknown>).message || "")
        : String(body.message || body.text || "")) || "";
    textoEntidade = texto;
  }

  const admin = createAdminClient();

  const { data: org } = await admin
    .from("orgs")
    .select("id, zapi_instance, zapi_token, zapi_client_token, zapi_webhook_secret")
    .limit(1)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "org não configurada" }, { status: 500 });

  const secret = process.env.ZAPI_WEBHOOK_SECRET ?? org.zapi_webhook_secret;
  if (secret && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const zapiCfg: ZapiConfig | null =
    org.zapi_instance && org.zapi_token
      ? { instance: org.zapi_instance, token: org.zapi_token, clientToken: org.zapi_client_token }
      : null;

  const orgId = org.id;
  const agora = new Date().toISOString();

  const { data: existente } = await admin
    .from("conversas")
    .select("*")
    .eq("org_id", orgId)
    .eq("telefone", phone)
    .not("status", "eq", "arquivada")
    .order("created_at", { ascending: false })
    .maybeSingle();

  // Usa textoEntidade no log (mais legível que o buttonId cru).
  const msgCliente: ConversaMensagem = { de: "cliente", texto: textoEntidade || texto, tipo: "texto", em: agora };

  const conversa = existente;
  const handoff = conversa?.handoff_humano ?? false;
  const novasMensagens: ConversaMensagem[] = [...(conversa?.mensagens ?? []), msgCliente];

  let fluxoEstado: FluxoEstado | null = conversa?.fluxo_estado ?? null;
  let acionarHandoff = false;
  let respondeuPorFluxo = false;
  let intencaoLabel: string | undefined;

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
      const inicioNode = fluxo.nodes.find((n) => n.data?.tipo === "inicio");

      // Carrinho: vem de sessoes_whatsapp se disponível (não bloqueia o fluxo se falhar).
      const sessao = await recuperarOuCriarSessao(admin, orgId, phone, inicioNode?.id ?? null);
      const carrinho: CarrinhoItem[] = sessao?.carrinho ? [...sessao.carrinho] : [];

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

      // Estado do engine: lido de conversas.fluxo_estado (tabela original, sempre disponível).
      // sessoes_whatsapp.no_atual_id é usado apenas como backup de sessão para o carrinho.
      // Isso garante que o estado de navegação persiste mesmo se sessoes_whatsapp falhar.
      const estadoConversa = conversa?.fluxo_estado ?? null;
      const estado: FluxoEstado | null =
        estadoConversa?.no_atual && getNode(estadoConversa.no_atual)
          ? estadoConversa
          : null;

      console.log("[yapa:engine-entrada]", {
        phone: phone.slice(-4),
        tipoMsg,
        texto: texto.slice(0, 30),
        no_atual: estado?.no_atual ?? "null(inicio)",
        sessao_id: sessao?.id ?? "null",
      });

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
            await enviarPoll(phone, envio.titulo, envio.opcoes, zapiCfg);
            msgLog = `[enquete] ${envio.titulo} [${envio.opcoes.join(" | ")}]`;
          }
        } catch {
          try { await enviarTexto(phone, FALLBACK_ENTIDADE, zapiCfg); } catch { /* noop */ }
          msgLog = FALLBACK_ENTIDADE;
        }
        novasMensagens.push({ de: "bot", texto: msgLog, tipo: "texto", em: agora });
      };

      let novoNoAtual: string | null = estado?.no_atual ?? null;

      const noEspera = estado?.no_atual ? getNode(estado.no_atual) : undefined;
      const entEspera = noEspera ? tipoEntidadeDoNo(noEspera) : null;
      // Para validação de seleção numérica, usa `texto` (que pode ser buttonId ou número digitado).
      const escolha = Number.parseInt(texto.trim(), 10);
      const selecaoValida = respostaInterativa || (Number.isInteger(escolha) && escolha >= 1);

      if (entEspera && noEspera && !selecaoValida) {
        await enviarLista(noEspera, entEspera);
        respondeuPorFluxo = true;
        novoNoAtual = noEspera.id;
      } else {
        if (entEspera === "produto" && noEspera && selecaoValida) {
          // Fix #2 — usa textoEntidade (label do produto, e.g. "Cerveja - Gs. 15.000")
          // para resolver o produto real; não o buttonId (e.g. "ent_0").
          const indice = respostaInterativa ? null : Number.isInteger(escolha) ? escolha : null;
          const item = await resolverSelecaoProduto(admin, orgId, { texto: textoEntidade, indice });
          if (item) carrinho.push({ produto_id: item.produto_id, quantidade: 1, preco: item.preco });
        }

        // `texto` aqui é o buttonId (para ButtonsResponse) — o engine usa casarBotao()
        // que compara contra b.id antes de b.label, resolvendo a aresta pelo sourceHandle.
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
        novoNoAtual = resultado.no_atual;

        console.log("[yapa:engine-saida]", {
          phone: phone.slice(-4),
          envios: resultado.envios.length,
          no_atual_novo: resultado.no_atual ?? "null(encerrado)",
          handoff: resultado.handoff,
        });

        if (resultado.no_atual) {
          const no = getNode(resultado.no_atual);
          const ent = no ? tipoEntidadeDoNo(no) : null;
          if (no && ent) {
            await enviarLista(no, ent);
            respondeuPorFluxo = true;
          }
        }

        if (resultado.no_atual === null) carrinho.length = 0;
      }

      fluxoEstado = novoNoAtual
        ? { fluxo_id: fluxo.id, no_atual: novoNoAtual, atualizado_em: agora }
        : null;

      // Fix #1 — salvarSessao é awaited strictamente antes do return 200;
      // a Vercel não pode matar esta mutação. O helper agora loga erros em vez de engoli-los.
      if (sessao) await salvarSessao(admin, sessao.id, { no_atual_id: novoNoAtual, carrinho });

      if (respondeuPorFluxo) intencaoLabel = "fluxo";
    }
  }

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

  // Todas as mutações de banco abaixo são awaited antes do return — nenhuma é fire-and-forget.
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
