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
