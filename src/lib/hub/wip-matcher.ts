import "server-only";

/**
 * Motor "WIP" — casa uma descrição suja digitada pelo hub (ex.: "Brahma latao
 * 12un") com o item EXATO do catálogo mestre do Yapa, devolvendo o produto_id.
 *
 * Estratégia: pré-filtro determinístico (sobreposição de tokens, custo zero) +
 * OpenAI gpt-4o-mini como árbitro. Sem chave/erro/timeout → cai no determinístico.
 * Mantém o catálogo do Yapa "imaculado": a IA só escolhe entre ids existentes.
 */

export type ProdutoCatalogo = { id: string; nome: string };

const SYS =
  "Você casa uma descrição suja de produto (com erros, abreviações e apelidos) " +
  "com o item EXATO de um catálogo. Responda SOMENTE com o produto_id que " +
  "corresponde. Se nenhum corresponder com segurança, responda vazio. NUNCA invente ids.";

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ");
}

/** Casamento por sobreposição de tokens (fallback sem IA). */
function casarDeterministico(textoSujo: string, catalogo: ProdutoCatalogo[]): ProdutoCatalogo | null {
  const alvo = new Set(normalizar(textoSujo).split(/\s+/).filter((t) => t.length >= 2));
  if (alvo.size === 0) return null;
  let melhor: { p: ProdutoCatalogo; score: number } | null = null;
  for (const p of catalogo) {
    const toks = normalizar(p.nome).split(/\s+/).filter(Boolean);
    const hits = toks.filter((t) => alvo.has(t)).length;
    const score = hits / Math.max(toks.length, 1);
    if (hits > 0 && (!melhor || score > melhor.score)) melhor = { p, score };
  }
  // Exige alguma sobreposição real para não casar por acaso.
  return melhor && melhor.score >= 0.34 ? melhor.p : null;
}

/** Converte uma quantidade suja ("50 caixas", "1.200", "12un") em inteiro >= 0. */
export function parseQuantidade(qtd: string | number | null | undefined): number {
  if (typeof qtd === "number") return Number.isFinite(qtd) ? Math.max(0, Math.min(999999, Math.floor(qtd))) : 0;
  const digitos = String(qtd ?? "").replace(/[^\d]/g, "");
  if (!digitos) return 0;
  const n = parseInt(digitos, 10);
  return Number.isFinite(n) ? Math.min(n, 999999) : 0;
}

export type LinhaSuja = { nome_sujo: string; qtd: string | number };
export type LoteMatch = { produto_id: string; nome: string; quantidade: number };

/**
 * Versão em lote do motor WIP (importação de CSV). Casa cada linha suja com o
 * catálogo mestre e devolve os itens reconhecidos (produto_id + quantidade
 * numérica), deduplicados por produto (última linha vence = sobrescrever).
 *
 * Uma única chamada à IA para todo o lote; fallback determinístico por item.
 */
export async function casarLoteWip(
  linhas: LinhaSuja[],
  catalogo: ProdutoCatalogo[],
): Promise<LoteMatch[]> {
  if (catalogo.length === 0 || linhas.length === 0) return [];
  const porId = new Map(catalogo.map((p) => [p.id, p]));

  const baseline = linhas.map((l) => casarDeterministico(l.nome_sujo, catalogo));
  const idsIA = await matchLoteIA(linhas, catalogo);

  const resolvidos = new Map<string, LoteMatch>(); // produto_id → match (dedupe, overwrite)
  linhas.forEach((l, i) => {
    const idIa = idsIA && idsIA[i] && porId.has(idsIA[i]!) ? idsIA[i]! : null;
    const prod = idIa ? porId.get(idIa)! : baseline[i];
    if (!prod) return;
    resolvidos.set(prod.id, { produto_id: prod.id, nome: prod.nome, quantidade: parseQuantidade(l.qtd) });
  });
  return [...resolvidos.values()];
}

/** Uma chamada à IA para o lote → array de produto_id (ou null) alinhado ao índice. */
async function matchLoteIA(linhas: LinhaSuja[], catalogo: ProdutoCatalogo[]): Promise<(string | null)[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const lista = catalogo.map((p) => `${p.id} :: ${p.nome}`).join("\n");
    const sujas = linhas.map((l, i) => `${i}: "${l.nome_sujo}"`).join("\n");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: SYS },
          {
            role: "user",
            content:
              `Catálogo (id :: nome):\n${lista}\n\n` +
              `Entradas sujas (indice: "texto"):\n${sujas}\n\n` +
              `Para cada índice, escolha o produto_id do catálogo que corresponde, ou "" se nenhum. ` +
              `Responda em JSON: {"itens":[{"i":<indice>,"produto_id":"<id ou vazio>"}]}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = content ? (JSON.parse(content) as { itens?: { i: number; produto_id?: string }[] }) : {};
    const out: (string | null)[] = new Array(linhas.length).fill(null);
    for (const m of parsed.itens ?? []) {
      if (typeof m.i === "number" && m.i >= 0 && m.i < linhas.length) {
        const id = String(m.produto_id || "").trim();
        out[m.i] = id || null;
      }
    }
    return out;
  } catch {
    return null;
  }
}

export async function casarProdutoWip(
  textoSujo: string,
  catalogo: ProdutoCatalogo[],
): Promise<ProdutoCatalogo | null> {
  if (!textoSujo.trim() || catalogo.length === 0) return null;
  const determinstico = casarDeterministico(textoSujo, catalogo);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return determinstico;

  try {
    const lista = catalogo.map((p) => `${p.id} :: ${p.nome}`).join("\n");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: SYS },
          {
            role: "user",
            content: `Entrada suja: "${textoSujo}"\n\nCatálogo (id :: nome):\n${lista}\n\nResponda em JSON: {"produto_id":"<id do catálogo ou string vazia>"}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return determinstico;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = content ? (JSON.parse(content) as { produto_id?: string }) : {};
    const id = String(parsed.produto_id || "").trim();
    return catalogo.find((p) => p.id === id) ?? determinstico;
  } catch {
    return determinstico;
  }
}
