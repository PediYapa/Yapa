/**
 * Motor de execução de fluxos do bot (puro, sem I/O — testável).
 *
 * Um fluxo é um grafo de nós (React Flow). Ao receber uma mensagem do cliente,
 * `executarFluxo` decide o que enviar e qual o próximo ponto de espera:
 *  - nós "texto"/"imagem"/"produto" emitem conteúdo e avançam sozinhos;
 *  - nó "botoes" emite e PARA, aguardando a resposta (o texto/escolha do cliente
 *    seleciona a aresta via sourceHandle = id do botão);
 *  - nó "humano" liga o handoff e encerra o fluxo;
 *  - nó "inicio" é só a entrada.
 *
 * O webhook resolve produtos num mapa e passa um resolvedor; assim o engine não
 * toca no banco.
 */
import { gs } from "@/lib/format";
import type { FluxoNode, FluxoEdge, FluxoBotao, FluxoEstado } from "@/lib/database.types";

export type EnvioFluxo =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagem"; imagem_url: string; caption?: string }
  | { tipo: "botoes"; texto: string; botoes: FluxoBotao[] };

export type ProdutoInfo = { nome: string; preco_gs: number; imagem_url: string | null };

export type ResultadoFluxo = {
  envios: EnvioFluxo[];
  no_atual: string | null; // próximo ponto de espera; null = fluxo encerrado
  handoff: boolean;
};

function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Casa a resposta do cliente com um botão (por label, id ou número da opção). */
function casarBotao(botoes: FluxoBotao[] | undefined, texto: string): FluxoBotao | undefined {
  if (!botoes || botoes.length === 0) return undefined;
  const t = normalizar(texto);
  if (!t) return undefined;
  // 1) match exato por label ou id
  const exato = botoes.find((b) => normalizar(b.label) === t || normalizar(b.id) === t);
  if (exato) return exato;
  // 2) número da opção ("1", "2", ...)
  const n = Number.parseInt(t, 10);
  if (Number.isInteger(n) && n >= 1 && n <= botoes.length) return botoes[n - 1];
  // 3) match parcial (cliente digitou parte do label)
  return botoes.find((b) => normalizar(b.label).includes(t) || t.includes(normalizar(b.label)));
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
  let atual: FluxoNode | undefined;

  // 1) De onde começar a emitir.
  if (estado?.no_atual) {
    const espera = getNode(estado.no_atual);
    if (espera?.data.tipo === "botoes") {
      const escolhido = casarBotao(espera.data.botoes, texto);
      if (!escolhido) {
        // não entendeu: reapresenta os botões e segue esperando no mesmo nó
        envios.push({
          tipo: "botoes",
          texto: espera.data.texto || "Escolha uma das opções:",
          botoes: espera.data.botoes ?? [],
        });
        return { envios, no_atual: espera.id, handoff: false };
      }
      atual = proximoPorHandle(espera.id, escolhido.id);
    } else if (espera) {
      atual = proximoPadrao(espera.id);
    }
  }

  // 2) Sem estado válido → começa pelo nó de início.
  if (!atual) {
    const inicio = nodes.find((n) => n.data.tipo === "inicio") ?? nodes[0];
    atual = inicio ? proximoPadrao(inicio.id) : undefined;
  }

  // 3) Emite avançando até um nó de espera / humano / fim.
  let handoff = false;
  const visitados = new Set<string>();
  while (atual && !visitados.has(atual.id)) {
    visitados.add(atual.id);
    const d = atual.data;

    if (d.tipo === "botoes") {
      envios.push({
        tipo: "botoes",
        texto: d.texto || "Escolha uma das opções:",
        botoes: d.botoes ?? [],
      });
      return { envios, no_atual: atual.id, handoff };
    }
    if (d.tipo === "humano") {
      if (d.texto) envios.push({ tipo: "texto", texto: d.texto });
      return { envios, no_atual: null, handoff: true };
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

  return { envios, no_atual: null, handoff };
}
