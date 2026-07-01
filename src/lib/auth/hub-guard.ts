import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

/**
 * Portão do portal Yapa Partners (/hub).
 *
 * - role 'hub': parceiro B2B, fixo à sua `distribuidora_id`.
 * - owner/gerente: modo supervisão — escolhe o hub via `?hub=<id>`.
 * - operador / demais: sem acesso → /dashboard.
 *
 * O isolamento financeiro é garantido pela RLS (estoque_hub) + pelas queries
 * do portal jamais selecionarem preço. Aqui só resolvemos o hub ativo.
 */
export async function guardHub(hubParam?: string | null) {
  const { userId, profile } = await requireUser();
  const isAdmin = profile.role === "owner" || profile.role === "gerente";

  if (profile.role !== "hub" && !isAdmin) redirect("/dashboard");

  const supabase = await createClient();
  const distribuidoraId = isAdmin
    ? (hubParam ?? profile.distribuidora_id ?? null)
    : profile.distribuidora_id;

  return { supabase, profile, userId, distribuidoraId, isAdmin };
}
