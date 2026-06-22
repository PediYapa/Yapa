import "server-only";

/**
 * Persistência de sessão do bot WhatsApp (tabela yapa.sessoes_whatsapp):
 * posição no fluxo (`no_atual_id`) + carrinho do cliente, indexado por telefone.
 *
 * Todas as funções degradam suavemente: em falha de banco retornam null / no-op,
 * para nunca quebrar o roteamento principal do webhook.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import type { CarrinhoItem, SessaoWhatsappRow } from "@/lib/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Recupera a sessão por (org, telefone). Se não existir, cria já posicionada no
 * nó inicial do fluxo. Retorna null se o banco falhar.
 */
export async function recuperarOuCriarSessao(
  admin: AdminClient,
  orgId: string,
  telefone: string,
  inicioNodeId: string | null,
): Promise<SessaoWhatsappRow | null> {
  try {
    const { data: existente } = await admin
      .from("sessoes_whatsapp")
      .select("*")
      .eq("org_id", orgId)
      .eq("telefone", telefone)
      .maybeSingle();
    if (existente) return existente;

    const { data: nova, error } = await admin
      .from("sessoes_whatsapp")
      .insert({ org_id: orgId, telefone, no_atual_id: inicioNodeId, carrinho: [] })
      .select("*")
      .single();
    if (error) return null;
    return nova;
  } catch {
    return null;
  }
}

/** Persiste posição e carrinho da sessão. Nunca lança (não bloqueia o webhook). */
export async function salvarSessao(
  admin: AdminClient,
  sessaoId: string,
  patch: { no_atual_id: string | null; carrinho: CarrinhoItem[] },
): Promise<void> {
  try {
    await admin
      .from("sessoes_whatsapp")
      .update({ no_atual_id: patch.no_atual_id, carrinho: patch.carrinho })
      .eq("id", sessaoId);
  } catch {
    /* não-bloqueante */
  }
}
