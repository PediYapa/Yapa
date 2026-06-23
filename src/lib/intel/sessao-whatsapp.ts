import "server-only";

/**
 * Persistência de sessão do bot WhatsApp (tabela yapa.sessoes_whatsapp):
 * posição no fluxo (`no_atual_id`) + carrinho do cliente, indexado por telefone.
 *
 * recuperarOuCriarSessao usa upsert atômico (INSERT ... ON CONFLICT DO NOTHING + SELECT)
 * para eliminar a condição de corrida do padrão select+insert anterior, que retornava
 * null quando duas requisições concorrentes tentavam criar a mesma sessão.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import type { CarrinhoItem, SessaoWhatsappRow } from "@/lib/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Recupera a sessão por (org, telefone). Se não existir, cria já posicionada no
 * nó inicial do fluxo. Operação atômica: nunca sobrescreve estado existente.
 * Retorna null se o banco falhar — o webhook degrada suavemente.
 */
export async function recuperarOuCriarSessao(
  admin: AdminClient,
  orgId: string,
  telefone: string,
  inicioNodeId: string | null,
): Promise<SessaoWhatsappRow | null> {
  try {
    // Insere apenas se (org_id, telefone) ainda não existe.
    // ignoreDuplicates: true = INSERT ... ON CONFLICT DO NOTHING — nunca sobrescreve.
    const { error: upsertError } = await admin
      .from("sessoes_whatsapp")
      .upsert(
        { org_id: orgId, telefone, no_atual_id: inicioNodeId, carrinho: [] },
        { onConflict: "org_id,telefone", ignoreDuplicates: true },
      );
    if (upsertError) console.error("[yapa:sessao] upsert error:", upsertError.message);

    // Busca sempre após o upsert: obtém tanto a nova linha quanto a existente.
    const { data, error: selectError } = await admin
      .from("sessoes_whatsapp")
      .select("*")
      .eq("org_id", orgId)
      .eq("telefone", telefone)
      .single();
    if (selectError) {
      console.error("[yapa:sessao] select error:", selectError.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[yapa:sessao] exception:", err);
    return null;
  }
}

/** Persiste posição e carrinho da sessão. Loga erros sem lançar (não bloqueia o webhook). */
export async function salvarSessao(
  admin: AdminClient,
  sessaoId: string,
  patch: { no_atual_id: string | null; carrinho: CarrinhoItem[] },
): Promise<void> {
  try {
    const { error } = await admin
      .from("sessoes_whatsapp")
      .update({
        no_atual_id: patch.no_atual_id,
        carrinho: patch.carrinho,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessaoId);
    if (error) console.error("[yapa:sessao] salvar error:", error.message, "| sessaoId:", sessaoId);
  } catch (err) {
    console.error("[yapa:sessao] salvar exception:", err);
  }
}
