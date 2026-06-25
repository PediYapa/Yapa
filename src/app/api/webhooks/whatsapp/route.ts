import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { interpretarMensagem } from "@/lib/integrations/openai";
import { enviarTexto, enviarImagem, enviarBotoes, enviarPoll, type ZapiConfig } from "@/lib/integrations/zapi";
import { executarFluxo, tipoEntidadeDoNo, montarResumoCheckout, type ProdutoInfo, type EntidadeTipo } from "@/lib/intel/fluxo-engine";
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
    pollVote:               body.pollVote               != null,
    text: typeof body.text === "string" ? body.text?.slice(0, 30) : typeof body.text,
    message: typeof body.message === "string" ? String(body.message).slice(0, 30) : undefined,
  });

  let texto = "";
  let textoEntidade = "";
  let respostaInterativa = false;
  // Localização recebida (PIN do WhatsApp) — consumida pelo nó location_capture do engine.
  let localizacao: { latitude: number; longitude: number; endereco?: string } | null = null;

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
  } else if (body.pollVote != null || tipoMsg === "pollvote" || tipoMsg === "pollupdate") {
    // Voto de enquete. Z-API envia body.pollVote.options[].name (seleção única → [0]).
    // Polls não têm ID separado — a opção selecionada é o próprio texto (label do produto).
    console.log("[yapa:pollVote]", JSON.stringify(body.pollVote ?? body.pollUpdateMessage));
    const pv = (body.pollVote ?? body.pollUpdateMessage) as Record<string, unknown> | undefined;
    const options =
      ((pv?.options ?? pv?.votes ?? pv?.values) as Array<Record<string, unknown>> | undefined) ?? [];
    const votado = options.find((v) => (v.name ?? v.optionName) != null) ?? options[0];
    texto        = String(votado?.name ?? votado?.optionName ?? "");
    textoEntidade = texto;
    respostaInterativa = texto.length > 0;
    console.log("[yapa:poll]", { tipoMsg, texto, phone: phone.slice(-4) });
  } else if (body.location != null || tipoMsg === "location") {
    // Localização (PIN). Z-API: body.location = { latitude, longitude, address, url }.
    const loc = body.location as Record<string, unknown> | undefined;
    const lat = Number(loc?.latitude);
    const lng = Number(loc?.longitude);
    const endereco = typeof loc?.address === "string" ? loc.address.trim() : "";
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      localizacao = { latitude: lat, longitude: lng, ...(endereco ? { endereco } : {}) };
      texto = endereco || `${lat},${lng}`;
      textoEntidade = texto;
      respostaInterativa = true;
    }
    console.log("[yapa:location]", { lat, lng, endereco, phone: phone.slice(-4) });
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

  // .limit(1) é OBRIGATÓRIO: sem ele, .maybeSingle() ERRA quando há 2+ conversas
  // não-arquivadas do mesmo telefone → retorna null → o webhook cria uma conversa
  // nova a cada mensagem (loop de duplicatas, sempre reiniciando do "Bem-vindo").
  const { data: existente } = await admin
    .from("conversas")
    .select("*")
    .eq("org_id", orgId)
    .eq("telefone", phone)
    .not("status", "eq", "arquivada")
    .order("created_at", { ascending: false })
    .limit(1)
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
          .select("id, nome, preco_gs, imagem_url, preco_caixa, unidades_por_caixa, opcoes_variacao")
          .in("id", produtoIds);
        produtosMap = new Map(
          (prods ?? []).map((p) => [
            p.id,
            {
              nome: p.nome,
              preco_gs: p.preco_gs,
              imagem_url: p.imagem_url,
              preco_caixa: p.preco_caixa,
              unidades_por_caixa: p.unidades_por_caixa,
              opcoes_variacao: p.opcoes_variacao,
            },
          ]),
        );
      }

      // Estado do engine: lido de conversas.fluxo_estado (tabela original, sempre disponível).
      // sessoes_whatsapp.no_atual_id é usado apenas como backup de sessão para o carrinho.
      // Isso garante que o estado de navegação persiste mesmo se sessoes_whatsapp falhar.
      const estadoConversa = conversa?.fluxo_estado ?? null;

      // Palavras-chave de reinício: qualquer uma delas começa o fluxo do zero,
      // independente do estado salvo. Útil quando o cliente se perde no meio do fluxo.
      const textoNorm = texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const ehReinicio = !respostaInterativa && ["oi", "ola", "menu", "inicio", "reiniciar", "comecar", "ola", "hey", "hi", "hello"].includes(textoNorm);

      const estado: FluxoEstado | null =
        !ehReinicio && estadoConversa?.no_atual && getNode(estadoConversa.no_atual)
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
            // Poll: Z-API pode não suportar. Se falhar, cai para lista numerada em texto.
            const pollResult = await enviarPoll(phone, envio.titulo, envio.opcoes, zapiCfg);
            if (pollResult.ok) {
              msgLog = `[enquete] ${envio.titulo} [${envio.opcoes.join(" | ")}]`;
            } else {
              console.warn("[yapa:poll-fallback] enviarPoll falhou, usando texto numerado:", pollResult.error, pollResult.data);
              const corpo = envio.opcoes.map((o, i) => `${i + 1}. ${o}`).join("\n");
              const mensagemFallback = `${envio.titulo}\n\n${corpo}\n\nDigite o número da opção:`;
              await enviarTexto(phone, mensagemFallback, zapiCfg);
              msgLog = mensagemFallback;
            }
          }
        } catch {
          try { await enviarTexto(phone, FALLBACK_ENTIDADE, zapiCfg); } catch { /* noop */ }
          msgLog = FALLBACK_ENTIDADE;
        }
        novasMensagens.push({ de: "bot", texto: msgLog, tipo: "texto", em: agora });
      };

      let novoNoAtual: string | null = estado?.no_atual ?? null;
      // Contexto intermediário (item_pendente, formato, etc.) — sempre preservado no fluxo_estado.
      let contexto: Record<string, unknown> = estado?.contexto ?? {};

      const noEspera = estado?.no_atual ? getNode(estado.no_atual) : undefined;
      const entEspera = noEspera ? tipoEntidadeDoNo(noEspera) : null;
      const escolha = Number.parseInt(texto.trim(), 10);
      const selecaoValida = respostaInterativa || (Number.isInteger(escolha) && escolha >= 1);

      // ── Helpers modularizados ───────────────────────────────────────────────

      // Geo: distribuidora mais próxima cujo raio cobre o ponto (RPC no Postgres).
      const matchDistribuidora = async (lat: number, lng: number): Promise<string | null> => {
        const { data, error } = await admin.rpc("match_distribuidora", { user_lat: lat, user_lng: lng });
        if (error) { console.error("[yapa:geo] match_distribuidora:", error.message); return null; }
        return (data as string | null) ?? null;
      };

      // Etapa virtual de sabor: ≤3 botões, 4–12 enquete (a resposta é lida pelo label).
      const enviarOpcoesVariacao = async (titulo: string, opcoes: string[]): Promise<void> => {
        if (opcoes.length <= 3) {
          await enviarBotoes(phone, titulo, opcoes.map((o, i) => ({ id: `sab-${i}`, label: o })), zapiCfg);
        } else {
          const pollResult = await enviarPoll(phone, titulo, opcoes, zapiCfg);
          if (!pollResult.ok) {
            const corpo = opcoes.map((o, i) => `${i + 1}. ${o}`).join("\n");
            await enviarTexto(phone, `${titulo}\n\n${corpo}\n\nDigite o número:`, zapiCfg);
          }
        }
      };

      // Roda o motor, despacha os envios e aplica contexto/carrinho. Retorna o resultado.
      const rodarEngine = async (estadoIn: FluxoEstado | null, textoIn: string, locIn: typeof localizacao) => {
        const resultado = executarFluxo({ nodes: fluxo.nodes, edges: fluxo.edges }, estadoIn, textoIn, (id) => produtosMap.get(id), locIn);
        if (resultado.contexto_patch !== undefined) contexto = resultado.contexto_patch;
        if (resultado.adicionar_carrinho?.length) carrinho.push(...resultado.adicionar_carrinho);
        for (const envio of resultado.envios) {
          try {
            if (envio.tipo === "texto") await enviarTexto(phone, envio.texto, zapiCfg);
            else if (envio.tipo === "imagem") await enviarImagem(phone, envio.imagem_url, envio.caption, zapiCfg);
            else if (envio.botoes.length > 3) {
              // WhatsApp: até 3 botões; acima disso (ex.: menu de 5 categorias) vai como enquete.
              const labels = envio.botoes.map((b) => b.label);
              const pollResult = await enviarPoll(phone, envio.texto, labels, zapiCfg);
              if (!pollResult.ok) {
                const corpo = labels.map((l, i) => `${i + 1}. ${l}`).join("\n");
                await enviarTexto(phone, `${envio.texto}\n\n${corpo}\n\nDigite o número da opção:`, zapiCfg);
              }
            } else {
              await enviarBotoes(phone, envio.texto, envio.botoes, zapiCfg);
            }
          } catch { /* não-bloqueante */ }
          const textoLog =
            envio.tipo === "texto" ? envio.texto
              : envio.tipo === "imagem" ? `[imagem] ${envio.caption ?? envio.imagem_url}`
                : `${envio.texto} [${envio.botoes.map((b) => b.label).join(" | ")}]`;
          novasMensagens.push({ de: "bot", texto: textoLog, tipo: envio.tipo, em: agora });
        }
        respondeuPorFluxo = resultado.envios.length > 0;
        acionarHandoff = resultado.handoff;
        novoNoAtual = resultado.no_atual;
        // Nó de entidade dinâmica → o webhook resolve a lista (catálogo/hub/entregador).
        if (resultado.no_atual) {
          const no = getNode(resultado.no_atual);
          const ent = no ? tipoEntidadeDoNo(no) : null;
          if (no && ent) { await enviarLista(no, ent); respondeuPorFluxo = true; }
        }
        console.log("[yapa:engine-saida]", { phone: phone.slice(-4), no_atual_novo: resultado.no_atual ?? "null", contexto_keys: Object.keys(contexto) });
        return resultado;
      };

      // Encerramento: se o fluxo acabou com carrinho, envia o resumo e registra a distribuidora.
      const finalizarSeEncerrou = async (resultado: { no_atual: string | null }): Promise<void> => {
        if (resultado.no_atual !== null) return;
        if (carrinho.length === 0) { contexto = {}; return; }

        const { texto: resumo, total } = montarResumoCheckout(carrinho);
        const distId = typeof contexto.distribuidora_id === "string" ? contexto.distribuidora_id : null;
        const lat = typeof contexto.latitude === "number" ? contexto.latitude : null;
        const lng = typeof contexto.longitude === "number" ? contexto.longitude : null;
        const endereco = typeof contexto.endereco === "string" ? contexto.endereco : null;
        const nomeCliente = typeof contexto.nome === "string" ? contexto.nome : null;

        // ── P1: gravar pedido + itens no banco ─────────────────────────────────
        let pedidoId: string | null = null;
        try {
          // Tenta associar ao cliente pelo telefone (se já cadastrado)
          const { data: cli } = await admin.from("clientes").select("id").eq("org_id", orgId).eq("telefone", phone).maybeSingle();

          const { data: pedido, error: errPedido } = await admin
            .from("pedidos")
            .insert({
              org_id: orgId,
              cliente_id: cli?.id ?? null,
              distribuidora_id: distId,
              canal: "whatsapp",
              moeda: "GS",
              valor_total_gs: total,
              latitude: lat,
              longitude: lng,
              endereco_entrega: endereco,
              observacao: nomeCliente ? `Cliente: ${nomeCliente}` : null,
            })
            .select("id, numero")
            .single();

          if (errPedido) {
            console.error("[yapa:pedido] insert pedido:", errPedido.message);
          } else if (pedido) {
            pedidoId = pedido.id as string;

            // Insere os itens do carrinho
            const itens = carrinho.map((it) => ({
              org_id: orgId,
              pedido_id: pedidoId!,
              produto_id: it.produto_id,
              descricao: it.nome ?? it.produto_id,
              quantidade: it.quantidade,
              preco_unit_gs: it.preco,
              subtotal_gs: it.subtotal ?? it.preco * it.quantidade,
            }));
            const { error: errItens } = await admin.from("pedido_itens").insert(itens);
            if (errItens) console.error("[yapa:pedido] insert itens:", errItens.message);

            console.log("[yapa:pedido] criado", { numero: pedido.numero, id: pedidoId, total, itens: itens.length });
          }
        } catch (err) {
          console.error("[yapa:pedido] exception:", err);
        }

        // ── Envia resumo ao cliente ────────────────────────────────────────────
        const pedidoNumero = pedidoId
          ? `\n\n_Pedido #${(await admin.from("pedidos").select("numero").eq("id", pedidoId).single()).data?.numero ?? "?"} registrado._`
          : "";
        const resumoFinal = resumo + pedidoNumero;
        await enviarTexto(phone, resumoFinal, zapiCfg);
        novasMensagens.push({ de: "bot", texto: resumoFinal, tipo: "texto", em: agora });

        // Nota interna da distribuidora atribuída
        if (distId) {
          const { data: dist } = await admin.from("distribuidoras").select("nome").eq("id", distId).maybeSingle();
          if (dist?.nome) {
            const nota = `[interno] Distribuidora atribuída: ${dist.nome}`;
            novasMensagens.push({ de: "bot", texto: nota, tipo: "texto", em: agora });
          }
        }

        // Vincula o pedido à conversa
        if (pedidoId && conversa) {
          await admin.from("conversas").update({ pedido_id: pedidoId }).eq("id", conversa.id);
        }

        carrinho.length = 0;
        contexto = {};
      };

      // ── Roteamento da mensagem ──────────────────────────────────────────────

      if (contexto.aguardando_sabor && estado) {
        // ETAPA VIRTUAL DE SABOR: concatena o sabor ao nome e retoma a quantidade.
        const sabor = (textoEntidade || texto).trim();
        const ip = (contexto.item_pendente ?? {}) as Record<string, unknown>;
        if (sabor && typeof ip.nome_base === "string") ip.nome = `${ip.nome_base} - ${sabor}`;
        const ctxLimpo = { ...contexto };
        delete ctxLimpo.aguardando_sabor;
        contexto = ctxLimpo;
        const resultado = await rodarEngine({ ...estado, contexto }, "", null);
        await finalizarSeEncerrou(resultado);
      } else if (noEspera?.data.tipo === "location_capture" && localizacao && estado) {
        // GEO-ROUTING: casa a distribuidora antes de avançar para o checkout.
        const distId = await matchDistribuidora(localizacao.latitude, localizacao.longitude);
        if (!distId) {
          const msg = "Infelizmente ainda não atendemos esse endereço. 😕 Envie um ponto mais próximo do centro de Ciudad del Este.";
          await enviarTexto(phone, msg, zapiCfg);
          novasMensagens.push({ de: "bot", texto: msg, tipo: "texto", em: agora });
          novoNoAtual = noEspera.id; // permanece aguardando nova localização
          respondeuPorFluxo = true;
        } else {
          contexto = { ...contexto, distribuidora_id: distId };
          const resultado = await rodarEngine({ ...estado, contexto }, texto, localizacao);
          await finalizarSeEncerrou(resultado);
        }
      } else if (entEspera && noEspera && !selecaoValida) {
        // Reapresenta a lista de entidade (resposta inválida); contexto preservado.
        await enviarLista(noEspera, entEspera);
        respondeuPorFluxo = true;
        novoNoAtual = noEspera.id;
      } else {
        let aguardarSabor = false;
        if (entEspera === "produto" && noEspera && selecaoValida) {
          const indice = respostaInterativa ? null : Number.isInteger(escolha) ? escolha : null;
          const item = await resolverSelecaoProduto(admin, orgId, { texto: textoEntidade, indice });
          if (item) {
            if (noEspera.data.pede_quantidade) {
              const sabores = item.opcoes_variacao ?? [];
              contexto = {
                ...contexto,
                item_pendente: { produto_id: item.produto_id, nome: item.nome, nome_base: item.nome, preco_gs: item.preco, preco_caixa: item.preco_caixa },
              };
              if (sabores.length > 0) {
                // FUNIL DINÂMICO DE SABOR: pergunta o sabor antes da quantidade.
                aguardarSabor = true;
                contexto = { ...contexto, aguardando_sabor: true };
                await enviarOpcoesVariacao("Qual sabor você prefere?", sabores);
                novasMensagens.push({ de: "bot", texto: `Qual sabor você prefere? [${sabores.join(" | ")}]`, tipo: "botoes", em: agora });
                novoNoAtual = noEspera.id; // permanece no nó de produto até o sabor chegar
                respondeuPorFluxo = true;
              }
            } else {
              carrinho.push({ produto_id: item.produto_id, quantidade: 1, preco: item.preco, nome: item.nome, subtotal: item.preco });
            }
          }
        }
        if (!aguardarSabor) {
          const resultado = await rodarEngine(estado, texto, localizacao);
          await finalizarSeEncerrou(resultado);
        }
      }

      // Persiste contexto junto com o estado de navegação (sem migration — já é JSONB)
      const contextoFinal = Object.keys(contexto).length > 0 ? contexto : undefined;
      fluxoEstado = novoNoAtual
        ? { fluxo_id: fluxo.id, no_atual: novoNoAtual, atualizado_em: agora, ...(contextoFinal ? { contexto: contextoFinal } : {}) }
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
