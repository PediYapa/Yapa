import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { interpretarMensagem } from "@/lib/integrations/openai";
import { enviarTexto, enviarImagem, enviarBotoes, enviarPoll, type ZapiConfig } from "@/lib/integrations/zapi";
import { executarFluxo, tipoEntidadeDoNo, montarResumoCheckout, type ProdutoInfo, type EntidadeTipo, type FreteInfo } from "@/lib/intel/fluxo-engine";
import { montarListaEntidade, resolverSelecaoProduto, FALLBACK_ENTIDADE } from "@/lib/intel/fluxo-entidades";
import { recuperarOuCriarSessao, salvarSessao } from "@/lib/intel/sessao-whatsapp";
import { createPaymentLink } from "@/lib/dlocal";
import { haversineKm } from "@/lib/intel/roteamento";
import { calcularFreteGs } from "@/lib/frete";
import { dispararOrdemDistribuidora } from "@/lib/despacho";
import { handleMensagemGrupoMotoboys } from "./grupo-motoboys";
import type { ConversaMensagem, FluxoEstado, FluxoNode, CarrinhoItem } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/** Mapeia o label do botão de pagamento para o enum forma_pagamento do banco. */
function mapearFormaPagamento(label: string | null): "dinheiro" | "pix" | null {
  if (!label) return null;
  const t = label.toLowerCase();
  if (t.includes("efetivo") || t.includes("dinheiro") || t.includes("efectivo")) return "dinheiro";
  if (t.includes("pix") || t.includes("alias") || t.includes("qr")) return "pix";
  return null;
}

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

  // ID cru do remetente — grupos têm sufixo não-numérico (ex.: "1203630...-group")
  // que o replace(/\D/g) abaixo destruiria. Guardado antes de sanitizar.
  const phoneRaw = String(body.phone || body.from || "").trim();
  const participantPhone = String(body.participantPhone ?? body.participantLid ?? body.author ?? "").trim();
  const ehGrupo =
    body.isGroup === true ||
    participantPhone.length > 0 ||
    /-group$/i.test(phoneRaw) ||
    phoneRaw.includes("@g.us");

  const phone = phoneRaw.replace(/\D/g, "");
  if (!phone) return NextResponse.json({ error: "telefone ausente" }, { status: 400 });

  const tipoMsg = String(body.type || "").toLowerCase();

  // Log diagnóstico: mostra o que o Z-API está enviando (visível em Vercel → Functions → logs).
  console.log("[yapa:webhook]", {
    type: body.type,
    phone: phone.slice(-4),
    isGroup: body.isGroup ?? ehGrupo,
    participant: participantPhone ? participantPhone.slice(-4) : undefined,
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

  // ── GRUPO DE MOTOBOYS ────────────────────────────────────────────────────
  // Mensagens de grupo NUNCA entram no engine de fluxo do cliente. Se o grupo
  // está vinculado a uma distribuidora (grupo_motoboys_id), trata "P <n>"/"E <n>";
  // qualquer outro grupo/mensagem é ignorado em silêncio.
  if (ehGrupo) {
    // Payload de grupo varia entre versões da Z-API — log completo ajuda a validar
    // o formato real (participantPhone/phone/isGroup) em produção.
    console.log("[yapa:grupo-payload]", JSON.stringify({ phone: phoneRaw, participantPhone, isGroup: body.isGroup, texto: texto.slice(0, 40) }));
    const resultado = await handleMensagemGrupoMotoboys({
      admin,
      zapiCfg,
      orgId,
      grupoPhone: phoneRaw,
      participantPhone,
      texto,
    });
    return NextResponse.json({ ok: true, grupo: resultado.acao });
  }

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

      // Frete: distância cliente↔distribuidora (Haversine) → faixa de km em GS.
      // Retorna null se fora das faixas (> 8 km) — o geo-routing já barra antes,
      // mas validamos de novo (raio_km da distribuidora pode ser maior que a tabela).
      const calcularFreteDaEntrega = async (
        distId: string,
        lat: number,
        lng: number,
      ): Promise<FreteInfo | null> => {
        const { data: distGeo } = await admin
          .from("distribuidoras").select("latitude, longitude").eq("id", distId).maybeSingle();
        const dKm = haversineKm(
          { latitude: lat, longitude: lng },
          {
            latitude: distGeo?.latitude != null ? Number(distGeo.latitude) : null,
            longitude: distGeo?.longitude != null ? Number(distGeo.longitude) : null,
          },
        );
        if (dKm == null) return null;
        const taxa = calcularFreteGs(dKm);
        if (taxa == null) return null;
        return { taxa_gs: taxa, distancia_km: Math.round(dKm * 100) / 100 };
      };

      // Frete já calculado no PIN (persistido no contexto até virar pedido).
      const freteDoContexto = (): FreteInfo | null => {
        const taxa = typeof contexto.taxa_entrega_gs === "number" ? contexto.taxa_entrega_gs : null;
        const dist = typeof contexto.distancia_km === "number" ? contexto.distancia_km : null;
        return taxa != null && dist != null ? { taxa_gs: taxa, distancia_km: dist } : null;
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

      // Cria pedido (upsert cliente + pedido + itens) e vincula à conversa.
      // NÃO envia resumo nem limpa o carrinho — o chamador decide.
      const criarPedidoDoCarrinho = async (
        forma: "dinheiro" | "pix" | null,
      ): Promise<{ pedidoId: string; numero: number; total: number } | null> => {
        const { total } = montarResumoCheckout(carrinho);
        const frete = freteDoContexto();
        const distId = typeof contexto.distribuidora_id === "string" ? contexto.distribuidora_id : null;
        const lat = typeof contexto.latitude === "number" ? contexto.latitude : null;
        const lng = typeof contexto.longitude === "number" ? contexto.longitude : null;
        const endereco = typeof contexto.endereco === "string" ? contexto.endereco : null;
        const nomeCliente = typeof contexto.nome === "string" ? contexto.nome.trim() : null;
        const metodoLabel = typeof contexto.metodo_pagamento === "string" ? contexto.metodo_pagamento : null;
        // Factura Legal: f-fatura salva o label "Sim"/"Não"; f-ruc captura o documento.
        const precisaFatura = String(contexto.precisa_fatura ?? "").trim().toLowerCase().startsWith("s");
        const ruc = precisaFatura && typeof contexto.ruc === "string" ? contexto.ruc.trim() || null : null;
        try {
          // CRM: upsert do cliente por (org, telefone)
          const { data: cli } = await admin
            .from("clientes").select("id").eq("org_id", orgId).eq("telefone", phone).is("deleted_at", null).maybeSingle();
          let clienteId = cli?.id ?? null;
          const patchCliente = {
            ...(nomeCliente ? { nome: nomeCliente } : {}),
            ...(endereco ? { endereco } : {}),
            ...(lat != null ? { latitude: lat } : {}),
            ...(lng != null ? { longitude: lng } : {}),
            ...(ruc ? { documento_ruc: ruc } : {}),
          };
          if (clienteId) {
            if (Object.keys(patchCliente).length) await admin.from("clientes").update(patchCliente).eq("id", clienteId);
          } else {
            const { data: novo } = await admin.from("clientes").insert({ org_id: orgId, telefone: phone, ...patchCliente }).select("id").single();
            clienteId = novo?.id ?? null;
          }

          const { data: pedido, error: errPedido } = await admin
            .from("pedidos")
            .insert({
              org_id: orgId, cliente_id: clienteId, distribuidora_id: distId, status: "aguardando_pagamento",
              canal: "whatsapp", moeda: "GS", forma_pagamento: forma, valor_total_gs: total,
              // Frete separado do valor dos produtos (fluxos financeiros distintos).
              taxa_entrega_gs: frete?.taxa_gs ?? null, distancia_km: frete?.distancia_km ?? null,
              latitude: lat, longitude: lng, endereco_entrega: endereco,
              precisa_fatura: precisaFatura, documento_ruc: ruc,
              observacao: [nomeCliente ? `Cliente: ${nomeCliente}` : null, metodoLabel ? `Pagamento: ${metodoLabel}` : null, ruc ? `RUC/CI: ${ruc}` : null].filter(Boolean).join(" | ") || null,
            })
            .select("id, numero")
            .single();
          if (errPedido || !pedido) { console.error("[yapa:pedido] insert:", errPedido?.message); return null; }

          const itens = carrinho.map((it) => ({
            org_id: orgId, pedido_id: pedido.id as string, produto_id: it.produto_id,
            descricao: it.nome ?? it.produto_id, quantidade: it.quantidade,
            preco_unit_gs: it.preco, subtotal_gs: it.subtotal ?? it.preco * it.quantidade,
          }));
          const { error: errItens } = await admin.from("pedido_itens").insert(itens);
          if (errItens) console.error("[yapa:pedido] itens:", errItens.message);
          if (conversa) await admin.from("conversas").update({ pedido_id: pedido.id }).eq("id", conversa.id);
          console.log("[yapa:pedido] criado", { numero: pedido.numero, total, itens: itens.length, forma });
          return { pedidoId: pedido.id as string, numero: pedido.numero as number, total };
        } catch (err) {
          console.error("[yapa:pedido] exception:", err);
          return null;
        }
      };

      // Nota interna da distribuidora atribuída (visível ao operador na conversa).
      const notaDistribuidora = async (): Promise<void> => {
        const distId = typeof contexto.distribuidora_id === "string" ? contexto.distribuidora_id : null;
        if (!distId) return;
        const { data: dist } = await admin.from("distribuidoras").select("nome").eq("id", distId).maybeSingle();
        if (dist?.nome) novasMensagens.push({ de: "bot", texto: `[interno] Distribuidora atribuída: ${dist.nome}`, tipo: "texto", em: agora });
      };

      // Encerramento padrão (fluxos SEM nó de pagamento): cria pedido, envia resumo, encerra.
      const finalizarSeEncerrou = async (resultado: { no_atual: string | null }): Promise<void> => {
        if (resultado.no_atual !== null) return;
        if (carrinho.length === 0) { contexto = {}; return; }
        const { texto: resumo } = montarResumoCheckout(carrinho, freteDoContexto());
        const metodoLabel = typeof contexto.metodo_pagamento === "string" ? contexto.metodo_pagamento : null;
        const forma = mapearFormaPagamento(metodoLabel);
        const novo = await criarPedidoDoCarrinho(forma);
        const rodape = novo ? `\n\n_Pedido #${novo.numero} registrado._` : "";
        await enviarTexto(phone, resumo + rodape, zapiCfg);
        novasMensagens.push({ de: "bot", texto: resumo + rodape, tipo: "texto", em: agora });
        await notaDistribuidora();
        // Dinheiro na entrega = pedido confirmado sem gateway → duplo disparo
        // (distribuidora + grupo de motoboys) direto no encerramento.
        if (novo && forma === "dinheiro") {
          const despacho = await dispararOrdemDistribuidora(novo.pedidoId);
          if (!despacho.ok) console.error("[yapa:despacho] disparo (dinheiro/encerramento) falhou:", despacho.error);
        }
        carrinho.length = 0;
        contexto = {};
      };

      // Nó f-pagamento: decide Dinheiro na Entrega × Pagar Online (dLocal Go).
      // Pedido criado uma única vez (idempotente via contexto.pedido_pendente_id),
      // permitindo retentativa do link sem duplicar o pedido.
      const processarPagamento = async (ehOnline: boolean): Promise<{ avancar: boolean }> => {
        const frete = freteDoContexto();
        const { texto: resumo, total } = montarResumoCheckout(carrinho, frete);
        let pedidoId = typeof contexto.pedido_pendente_id === "string" ? contexto.pedido_pendente_id : null;
        let numero = typeof contexto.pedido_numero === "number" ? contexto.pedido_numero : null;
        let totalPedido = total;
        if (!pedidoId) {
          const novo = await criarPedidoDoCarrinho(ehOnline ? null : "dinheiro");
          if (!novo) {
            await enviarTexto(phone, "Tivemos um problema ao registrar seu pedido. Tente novamente em instantes.", zapiCfg);
            return { avancar: false };
          }
          pedidoId = novo.pedidoId; numero = novo.numero; totalPedido = novo.total;
          contexto = { ...contexto, pedido_pendente_id: pedidoId, pedido_numero: numero };
          const rodape = `\n\n_Pedido #${numero} registrado._`;
          await enviarTexto(phone, resumo + rodape, zapiCfg);
          novasMensagens.push({ de: "bot", texto: resumo + rodape, tipo: "texto", em: agora });
          await notaDistribuidora();
        }

        if (ehOnline) {
          // Cliente paga produtos + frete online (total exibido no resumo).
          const amount = Math.round(totalPedido + (frete?.taxa_gs ?? 0));
          const link = await createPaymentLink({ pedidoId, amount, description: `Yapa pedido #${numero}`, appUrl: url.origin });
          if (link.ok) {
            await admin.from("pedidos").update({ forma_pagamento: "dlocal", gateway_id: link.paymentId, gateway_status: link.status }).eq("id", pedidoId);
            const msg = `Acesse o link seguro abaixo para concluir seu pagamento via QR Code, Transferência ou Cartão:\n${link.redirectUrl}`;
            await enviarTexto(phone, msg, zapiCfg);
            novasMensagens.push({ de: "bot", texto: msg, tipo: "texto", em: agora });
            return { avancar: true };
          }
          console.warn("[yapa:dlocal] createPaymentLink falhou:", link.error);
          const fb = "Tivemos um problema temporário ao gerar seu link. 😕 Por favor, tente novamente ou escolha Dinheiro.";
          await enviarTexto(phone, fb, zapiCfg);
          novasMensagens.push({ de: "bot", texto: fb, tipo: "texto", em: agora });
          return { avancar: false }; // mantém no nó de pagamento; pedido_pendente_id preservado
        }

        await admin.from("pedidos").update({ forma_pagamento: "dinheiro" }).eq("id", pedidoId);
        const msg = "Perfeito! Você paga em dinheiro na entrega. 💵";
        await enviarTexto(phone, msg, zapiCfg);
        novasMensagens.push({ de: "bot", texto: msg, tipo: "texto", em: agora });

        // Dinheiro na entrega = pedido CONFIRMADO: duplo disparo imediato
        // (comanda → distribuidora + corrida → grupo de motoboys, em paralelo).
        const despacho = await dispararOrdemDistribuidora(pedidoId);
        if (!despacho.ok) console.error("[yapa:despacho] disparo (dinheiro) falhou:", despacho.error);

        return { avancar: true };
      };

      // ── Roteamento da mensagem ──────────────────────────────────────────────

      if (noEspera?.data.salvar_em_contexto === "metodo_pagamento" && estado && respostaInterativa) {
        // NÓ DE PAGAMENTO: Dinheiro na Entrega × Pagar Online (dLocal Go).
        const ehOnline = /online|💳|cart|tarjeta|dlocal/i.test(`${texto} ${textoEntidade}`);
        const { avancar } = await processarPagamento(ehOnline);
        if (avancar) {
          carrinho.length = 0;
          contexto = {};
          // Avança para o nó final (humano) — emite a confirmação e liga o handoff.
          await rodarEngine({ ...estado, contexto: {} }, texto, null);
        } else {
          // Fallback gracioso: permanece no nó de pagamento e re-apresenta as opções.
          await enviarBotoes(phone, noEspera.data.texto || "Como você prefere pagar?", noEspera.data.botoes ?? [], zapiCfg);
          novasMensagens.push({ de: "bot", texto: `${noEspera.data.texto ?? "Pagamento"} [${(noEspera.data.botoes ?? []).map((b) => b.label).join(" | ")}]`, tipo: "botoes", em: agora });
          novoNoAtual = noEspera.id;
          respondeuPorFluxo = true;
        }
      } else if (contexto.aguardando_sabor && estado) {
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
        // FRETE: com distribuidora atribuída, calcula distância + faixa de km.
        // Sem faixa (> 8 km ou sem coords) trata como fora de cobertura.
        const frete = distId
          ? await calcularFreteDaEntrega(distId, localizacao.latitude, localizacao.longitude)
          : null;
        if (!distId || !frete) {
          // Geofence antecipado: fora de cobertura → aborta educadamente e RESETA a sessão
          // (limpa estado + carrinho). O cliente recomeça quando quiser mandando "oi".
          const msg = "Infelizmente ainda não atendemos esse endereço. 😕\n\nSeu pedido não pôde ser concluído. Quando estiver em uma área coberta, é só mandar *oi* para recomeçar. Obrigado pela compreensão! 🙏";
          await enviarTexto(phone, msg, zapiCfg);
          novasMensagens.push({ de: "bot", texto: msg, tipo: "texto", em: agora });
          carrinho.length = 0;
          contexto = {};
          novoNoAtual = null; // reseta a sessão: próximo "oi" começa do zero
          respondeuPorFluxo = true;
        } else {
          contexto = {
            ...contexto,
            distribuidora_id: distId,
            distancia_km: frete.distancia_km,
            taxa_entrega_gs: frete.taxa_gs,
          };
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
