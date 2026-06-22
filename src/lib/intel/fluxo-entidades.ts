import "server-only";

/**
 * Resolução dinâmica de nós de entidade do fluxo (produto/hub/entregador).
 *
 * O engine (puro) apenas classifica e pausa nesses nós; aqui consultamos o
 * Supabase em tempo real e montamos a lista numerada enviada ao WhatsApp.
 *
 * Mapeamento de colunas (schema real → enunciado):
 *  - produtos:      filtra `disponivel = true` (não existe coluna `em_estoque`).
 *  - distribuidoras (hub): filtra `ativo = true`.
 *  - entregadores:  filtra `ativo = true`.
 * Todas respeitam soft-delete (`deleted_at is null`) e isolamento por `org_id`.
 */
import { gs } from "@/lib/format";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { FluxoNode } from "@/lib/database.types";
import type { EntidadeTipo } from "@/lib/intel/fluxo-engine";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Mensagem amigável quando a consulta ao banco falha (não quebra o bot). */
export const FALLBACK_ENTIDADE =
  "Ops! Não consegui carregar as opções agora. Pode tentar de novo em instantes? 🙏";

/** Prefixo numerado para WhatsApp: 1️⃣…🔟 e, daí em diante, "11.". */
function prefixo(i: number): string {
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  return i < emojis.length ? emojis[i] : `${i + 1}.`;
}

/** Junta o cabeçalho (texto do nó, se houver) com a lista numerada. */
function montarTexto(node: FluxoNode, linhas: string[], vazio: string): string {
  const cabecalho = node.data.texto?.trim();
  const corpo =
    linhas.length === 0 ? vazio : linhas.map((l, i) => `${prefixo(i)} ${l}`).join("\n");
  return cabecalho ? `${cabecalho}\n\n${corpo}` : corpo;
}

/**
 * Consulta o banco conforme o tipo de entidade e devolve a lista numerada.
 * Retorna `null` em qualquer falha (o webhook então envia o FALLBACK_ENTIDADE).
 */
export async function montarListaEntidade(
  admin: AdminClient,
  orgId: string,
  node: FluxoNode,
  tipo: EntidadeTipo,
): Promise<string | null> {
  try {
    switch (tipo) {
      case "produto": {
        const { data, error } = await admin
          .from("produtos")
          .select("nome, preco_gs")
          .eq("org_id", orgId)
          .eq("disponivel", true)
          .is("deleted_at", null)
          .order("nome");
        if (error) return null;
        const linhas = (data ?? []).map((p) => `${p.nome} - ${gs(p.preco_gs)}`);
        return montarTexto(node, linhas, "Nenhum produto disponível no momento.");
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
        const linhas = (data ?? []).map((d) => (d.endereco ? `${d.nome} - ${d.endereco}` : d.nome));
        return montarTexto(node, linhas, "Nenhum hub disponível no momento.");
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
        const linhas = (data ?? []).map((e) => e.nome);
        return montarTexto(node, linhas, "Nenhum entregador disponível no momento.");
      }
    }
    return null;
  } catch {
    return null;
  }
}
