import "server-only";

/**
 * Resolução dinâmica de nós de entidade do fluxo (produto/hub/entregador).
 *
 * O engine (puro) pausa nesses nós; aqui consultamos o Supabase e construímos
 * o envio rico adequado para a quantidade de opções:
 *
 *   0 itens  → texto "nenhum disponível"
 *   1–3      → Interactive Buttons (clicáveis, sem digitar)
 *   4–12     → Enquete/Poll nativa do WhatsApp
 *   13+      → lista numerada em texto (fallback raramente atingido)
 *
 * A resposta do usuário (clique no botão ou voto na enquete) chega no webhook
 * com type "ButtonsResponse" ou "PollUpdate" — o route.ts extrai o texto selecionado.
 */
import { gs } from "@/lib/format";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { FluxoNode } from "@/lib/database.types";
import type { EntidadeTipo } from "@/lib/intel/fluxo-engine";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Mensagem amigável quando o Supabase falha — não quebra o bot. */
export const FALLBACK_ENTIDADE =
  "Ops! Não consegui carregar as opções agora. Pode tentar de novo em instantes? 🙏";

/**
 * Discriminador do envio de entidade.
 * O webhook usa o campo `modo` para chamar a função Z-API correta.
 */
export type EnvioEntidade =
  | { modo: "texto";  mensagem: string }
  | { modo: "botoes"; titulo: string; botoes: { id: string; label: string }[] }
  | { modo: "poll";   titulo: string; opcoes: string[] };

const LIMITE_BOTOES = 3;  // WhatsApp: máx. 3 botões interativos
const LIMITE_POLL   = 12; // WhatsApp: máx. 12 opções em enquete

type ProdutoSel = { id: string; nome: string; preco_gs: number };

/** Produtos disponíveis da org, na MESMA ordem usada para montar a lista (por nome). */
async function consultarProdutosDisponiveis(admin: AdminClient, orgId: string): Promise<ProdutoSel[]> {
  const { data, error } = await admin
    .from("produtos")
    .select("id, nome, preco_gs")
    .eq("org_id", orgId)
    .eq("disponivel", true)
    .is("deleted_at", null)
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

function prefixo(i: number): string {
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  return i < emojis.length ? emojis[i] : `${i + 1}.`;
}

function titulo(node: FluxoNode, fallback: string): string {
  return node.data.texto?.trim() || fallback;
}

/** Escolhe o modo de envio pela quantidade de opções. */
function resolverModo(
  node: FluxoNode,
  labels: string[],
  fallbackTitulo: string,
  mensagemVazio: string,
): EnvioEntidade {
  const t = titulo(node, fallbackTitulo);

  if (labels.length === 0) {
    return { modo: "texto", mensagem: mensagemVazio };
  }
  if (labels.length <= LIMITE_BOTOES) {
    return {
      modo: "botoes",
      titulo: t,
      botoes: labels.map((label, i) => ({ id: `ent_${i}`, label })),
    };
  }
  if (labels.length <= LIMITE_POLL) {
    return { modo: "poll", titulo: t, opcoes: labels };
  }
  // 13+ itens: fallback texto numerado
  const corpo = labels.map((l, i) => `${prefixo(i)} ${l}`).join("\n");
  return { modo: "texto", mensagem: `${t}\n\n${corpo}` };
}

/**
 * Consulta o banco conforme o tipo de entidade e devolve o envio estruturado.
 * Retorna `null` em qualquer falha — o webhook então usa FALLBACK_ENTIDADE.
 */
export async function montarListaEntidade(
  admin: AdminClient,
  orgId: string,
  node: FluxoNode,
  tipo: EntidadeTipo,
): Promise<EnvioEntidade | null> {
  try {
    switch (tipo) {
      case "produto": {
        const rows = await consultarProdutosDisponiveis(admin, orgId);
        const labels = rows.map((p) => `${p.nome} - ${gs(p.preco_gs)}`);
        return resolverModo(node, labels, "O que você quer pedir?", "Nenhum produto disponível no momento.");
      }
      case "hub": {
        const { data, error } = await admin
          .from("distribuidoras")
          .select("nome, endereco")
          .eq("org_id", orgId)
          .eq("ativo", true)
          .is("deleted_at", null)
          .order("nome");
        if (error) return null;
        const labels = (data ?? []).map(
          (d) => (d.endereco ? `${d.nome} - ${d.endereco}` : d.nome),
        );
        return resolverModo(node, labels, "Qual unidade você prefere?", "Nenhum hub disponível no momento.");
      }
      case "entregador": {
        const { data, error } = await admin
          .from("entregadores")
          .select("nome")
          .eq("org_id", orgId)
          .eq("ativo", true)
          .is("deleted_at", null)
          .order("nome");
        if (error) return null;
        const labels = (data ?? []).map((e) => e.nome);
        return resolverModo(node, labels, "Qual entregador?", "Nenhum entregador disponível no momento.");
      }
    }
  } catch {
    return null;
  }
}

/** Item escolhido pelo cliente (id real + preço-base em GS, snapshot p/ o carrinho). */
export type ItemSelecionado = { produto_id: string; preco: number };

/**
 * Mapeia a resposta do cliente (clique/voto ou número digitado) de volta ao produto
 * real do catálogo. Usa a MESMA consulta ordenada de `montarListaEntidade`, então:
 *  - `indice` (1-based) casa com a lista numerada de texto;
 *  - `texto` casa com o label de botão/enquete que enviamos.
 * Retorna null se nada casar ou se o banco falhar.
 */
export async function resolverSelecaoProduto(
  admin: AdminClient,
  orgId: string,
  selecao: { texto: string; indice: number | null },
): Promise<ItemSelecionado | null> {
  try {
    const rows = await consultarProdutosDisponiveis(admin, orgId);
    if (rows.length === 0) return null;

    // 1) Por índice (fallback de texto numerado).
    if (selecao.indice != null && selecao.indice >= 1 && selecao.indice <= rows.length) {
      const r = rows[selecao.indice - 1];
      return { produto_id: r.id, preco: r.preco_gs };
    }
    // 2) Por label exato (botão/enquete devolvem o texto que montamos).
    const alvo = selecao.texto.trim();
    const porLabel = rows.find((r) => `${r.nome} - ${gs(r.preco_gs)}` === alvo);
    if (porLabel) return { produto_id: porLabel.id, preco: porLabel.preco_gs };
    // 3) Por nome (robustez: WhatsApp pode truncar labels longos).
    const porNome = rows.find((r) => alvo === r.nome || alvo.startsWith(r.nome));
    if (porNome) return { produto_id: porNome.id, preco: porNome.preco_gs };

    return null;
  } catch {
    return null;
  }
}
