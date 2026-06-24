/**
 * Motor de execução de fluxos do bot (puro, sem I/O — testável).
 *
 * Tipos de nó e comportamento:
 *  - "texto"/"imagem"/"produto" — emitem conteúdo e avançam sozinhos.
 *  - "botoes" — emite botões e PAUSA; resposta seleciona a aresta via sourceHandle.
 *              Se `salvar_em_contexto` estiver definido, o label do botão clicado
 *              é salvo em contexto[salvar_em_contexto] antes de avançar.
 *  - "captura" — pausa e aguarda texto livre; quando recebido, extrai o valor
 *               (número ou texto) e salva em contexto[variavel]. Se variavel="quantidade"
 *               e contexto.item_pendente existir, finaliza o item do carrinho.
 *  - "humano" — aciona handoff e encerra o fluxo.
 *  - "inicio" — só entrada, não emite.
 *
 * Retorna `contexto_patch` (webhook faz merge) e `adicionar_carrinho` (webhook acrescenta
 * ao carrinho) para manter o engine livre de I/O.
 */
import { gs } from "@/lib/format";
import type { FluxoNode, FluxoEdge, FluxoBotao, FluxoEstado, CarrinhoItem } from "@/lib/database.types";

export type EnvioFluxo =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagem"; imagem_url: string; caption?: string }
  | { tipo: "botoes"; texto: string; botoes: FluxoBotao[] };

export type ProdutoInfo = { nome: string; preco_gs: number; imagem_url: string | null };

export type ResultadoFluxo = {
  envios: EnvioFluxo[];
  no_atual: string | null;
  handoff: boolean;
  /** Contexto completo a gravar em fluxo_estado.contexto (substitui, não faz merge parcial). */
  contexto_patch?: Record<string, unknown>;
  /** Itens a acrescentar ao carrinho (a ser feito pelo webhook). */
  adicionar_carrinho?: CarrinhoItem[];
};

/** Tipo de entidade resolvida dinamicamente no banco (lista numerada no WhatsApp). */
export type EntidadeTipo = "produto" | "hub" | "entregador";

export function tipoEntidadeDoNo(node: FluxoNode): EntidadeTipo | null {
  const tipo = node.data.tipo as string;
  if (tipo === "produto") return node.data.produto_id ? null : "produto";
  if (tipo === "hub" || tipo === "distribuidora") return "hub";
  if (tipo === "entregador") return "entregador";
  return null;
}

function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Casa a resposta do cliente com um botão (por label, id ou número da opção). */
function casarBotao(botoes: FluxoBotao[] | undefined, texto: string): FluxoBotao | undefined {
  if (!botoes || botoes.length === 0) return undefined;
  const t = normalizar(texto);
  if (!t) return undefined;
  const exato = botoes.find((b) => normalizar(b.label) === t || normalizar(b.id) === t);
  if (exato) return exato;
  const n = Number.parseInt(t, 10);
  if (Number.isInteger(n) && n >= 1 && n <= botoes.length) return botoes[n - 1];
  return botoes.find((b) => normalizar(b.label).includes(t) || t.includes(normalizar(b.label)));
}

/**
 * Extrai um número inteiro positivo do texto do cliente.
 * Aceita: "3", "quero 3", "duas", "deux", "3 caixas", etc.
 */
function extrairNumero(texto: string): number | null {
  const norm = normalizar(texto);

  // 1) Número literal no início ou em qualquer posição
  const match = texto.match(/\d+/);
  if (match) {
    const n = parseInt(match[0], 10);
    if (n > 0 && n <= 999) return n;
  }

  // 2) Números escritos em PT-BR e ES
  const escritos: Record<string, number> = {
    um: 1, uma: 1, uno: 1, un: 1,
    dois: 2, duas: 2, dos: 2,
    tres: 3, // já normalizado (sem acento)
    quatro: 4, cuatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7, siete: 7,
    oito: 8, ocho: 8,
    nove: 9, nueve: 9,
    dez: 10, diez: 10,
    onze: 11, once: 11,
    doze: 12, doce: 12,
    treze: 13, trece: 13,
    quatorze: 14, catorce: 14,
    quinze: 15, quince: 15,
    vinte: 20, veinte: 20,
    trinta: 30, treinta: 30,
    quarenta: 40, cuarenta: 40,
    cinquenta: 50, cincuenta: 50,
  };
  for (const [palavra, valor] of Object.entries(escritos)) {
    if (norm.includes(palavra)) return valor;
  }

  return null;
}

type ItemPendente = { produto_id: string; nome: string; preco_gs: number };

function getItemPendente(ctx: Record<string, unknown>): ItemPendente | undefined {
  const ip = ctx.item_pendente;
  if (!ip || typeof ip !== "object") return undefined;
  const r = ip as Record<string, unknown>;
  if (typeof r.produto_id !== "string" || typeof r.nome !== "string" || typeof r.preco_gs !== "number") return undefined;
  return { produto_id: r.produto_id, nome: r.nome, preco_gs: r.preco_gs };
}

export function executarFluxo(
  fluxo: { nodes: FluxoNode[]; edges: FluxoEdge[] },
  estado: FluxoEstado | null,
  texto: string,
  resolveProduto: (id: string) => ProdutoInfo | undefined,
): ResultadoFluxo {
  const { nodes, edges } = fluxo;
  const getNode = (id: string) => nodes.find((n) => n.id === id);
  const proximoPadrao = (fromId: string): FluxoNode | undefined => {
    const edge = edges.find((e) => e.source === fromId);
    return edge ? getNode(edge.target) : undefined;
  };
  const proximoPorHandle = (fromId: string, handle: string): FluxoNode | undefined => {
    const edge = edges.find((e) => e.source === fromId && e.sourceHandle === handle);
    return edge ? getNode(edge.target) : undefined;
  };

  const envios: EnvioFluxo[] = [];
  let contexto_patch: Record<string, unknown> | undefined;
  let adicionar_carrinho: CarrinhoItem[] | undefined;
  let atual: FluxoNode | undefined;

  // Helper: monta o ResultadoFluxo com os campos opcionais corretos
  const resultado = (no_atual: string | null, handoff: boolean): ResultadoFluxo => ({
    envios,
    no_atual,
    handoff,
    ...(contexto_patch !== undefined ? { contexto_patch } : {}),
    ...(adicionar_carrinho !== undefined ? { adicionar_carrinho } : {}),
  });

  // ─── 1) Determinar ponto de partida a partir do estado ───────────────────────
  if (estado?.no_atual) {
    const espera = getNode(estado.no_atual);

    if (espera?.data.tipo === "botoes") {
      const escolhido = casarBotao(espera.data.botoes, texto);
      if (!escolhido) {
        console.warn("[yapa:engine] casarBotao falhou", {
          textoRecebido: texto,
          botoesEsperados: (espera.data.botoes ?? []).map((b) => ({ id: b.id, label: b.label })),
        });
        envios.push({ tipo: "botoes", texto: espera.data.texto || "Escolha uma das opções:", botoes: espera.data.botoes ?? [] });
        return resultado(espera.id, false);
      }

      // Nós "salvar e continuar" (salvar_em_contexto, ex.: formato Caixa/Unidade):
      // todas as opções normalmente convergem para o MESMO próximo nó (a captura).
      // Salva a escolha no contexto E preserva a aresta de saída: usa a aresta
      // específica do botão se existir, senão cai na aresta padrão do nó. Isso evita
      // o loop quando ambos os botões apontam para o mesmo destino e só uma aresta
      // (ou nenhuma) foi conectada por handle no builder.
      if (espera.data.salvar_em_contexto) {
        const ctxAtual = estado.contexto ?? {};
        contexto_patch = { ...ctxAtual, [espera.data.salvar_em_contexto]: escolhido.label };
        atual = proximoPorHandle(espera.id, escolhido.id) ?? proximoPadrao(espera.id);
      } else {
        // Botões de ramificação (ex.: gate de idade): cada opção tem destino próprio.
        atual = proximoPorHandle(espera.id, escolhido.id);
      }

      if (!atual) {
        console.warn("[yapa:engine] sem aresta de saída para botão:", escolhido.id, "no nó:", espera.id);
        envios.push({ tipo: "botoes", texto: espera.data.texto || "Escolha uma das opções:", botoes: espera.data.botoes ?? [] });
        return resultado(espera.id, false);
      }

    } else if (espera?.data.tipo === "captura") {
      const d = espera.data;
      const variavel = d.variavel || "valor";
      const ctxAtual = estado.contexto ?? {};

      let valorCapturado: string | number = texto.trim();

      if (d.tipo_valor === "numero") {
        const n = extrairNumero(texto);
        const min = d.min_valor ?? 1;
        const max = d.max_valor ?? 99;

        if (n === null) {
          envios.push({ tipo: "texto", texto: `Por favor, informe um número entre ${min} e ${max}.` });
          return resultado(espera.id, false);
        }
        if (n < min || n > max) {
          envios.push({ tipo: "texto", texto: `Por favor, informe entre ${min} e ${max}.` });
          return resultado(espera.id, false);
        }
        valorCapturado = n;
      }

      // Monta o novo contexto com o valor capturado
      const ctxNovo: Record<string, unknown> = { ...ctxAtual, [variavel]: valorCapturado };

      // Se é "quantidade" e há um item pendente → finaliza o carrinho
      if (variavel === "quantidade" && getItemPendente(ctxAtual)) {
        const ip = getItemPendente(ctxAtual)!;
        const formato = typeof ctxAtual.formato === "string" ? ctxAtual.formato : undefined;
        adicionar_carrinho = [{
          produto_id: ip.produto_id,
          quantidade: valorCapturado as number,
          preco: ip.preco_gs,
          nome: ip.nome,
          ...(formato ? { formato } : {}),
        }];
        // Limpa item_pendente e formato do contexto (item finalizado)
        const { item_pendente: _ip, formato: _fmt, quantidade: _q, ...ctxLimpo } = ctxNovo;
        contexto_patch = ctxLimpo;
      } else {
        contexto_patch = ctxNovo;
      }

      atual = proximoPadrao(espera.id);
      if (!atual) return resultado(null, false);

    } else if (espera) {
      atual = proximoPadrao(espera.id);
    }
  }

  // ─── 2) Sem estado → começa pelo nó de início ────────────────────────────────
  if (!atual) {
    const inicio = nodes.find((n) => n.data.tipo === "inicio") ?? nodes[0];
    atual = inicio ? proximoPadrao(inicio.id) : undefined;
  }

  // ─── 3) Emite avançando até nó de pausa / humano / fim ──────────────────────
  let handoff = false;
  const visitados = new Set<string>();

  while (atual && !visitados.has(atual.id)) {
    visitados.add(atual.id);
    const d = atual.data;

    // Nó de entidade dinâmica (produto-catálogo/hub/entregador): pausa para o webhook resolver
    if (tipoEntidadeDoNo(atual)) {
      return resultado(atual.id, handoff);
    }

    if (d.tipo === "botoes") {
      envios.push({ tipo: "botoes", texto: d.texto || "Escolha uma das opções:", botoes: d.botoes ?? [] });
      return resultado(atual.id, handoff);
    }

    if (d.tipo === "captura") {
      // Envia a pergunta e pausa para aguardar a resposta livre
      if (d.texto) envios.push({ tipo: "texto", texto: d.texto });
      return resultado(atual.id, handoff);
    }

    if (d.tipo === "humano") {
      if (d.texto) envios.push({ tipo: "texto", texto: d.texto });
      return resultado(null, true);
    }

    if (d.tipo === "texto") {
      if (d.texto) envios.push({ tipo: "texto", texto: d.texto });
    } else if (d.tipo === "imagem") {
      if (d.imagem_url) envios.push({ tipo: "imagem", imagem_url: d.imagem_url, caption: d.texto });
    } else if (d.tipo === "produto") {
      const info = d.produto_id ? resolveProduto(d.produto_id) : undefined;
      if (info) {
        const legenda = `*${info.nome}* — ${gs(info.preco_gs)}${d.texto ? `\n${d.texto}` : ""}`;
        if (info.imagem_url) envios.push({ tipo: "imagem", imagem_url: info.imagem_url, caption: legenda });
        else envios.push({ tipo: "texto", texto: legenda });
      }
    }
    // "inicio" não emite. Avança.
    atual = proximoPadrao(atual.id);
  }

  return resultado(null, handoff);
}
