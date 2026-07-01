"use server";

import { revalidatePath } from "next/cache";
import { guardHub } from "@/lib/auth/hub-guard";
import { runAction, type ActionResult } from "@/lib/auth/guard";

/**
 * Atualiza a quantidade física de uma linha de estoque do hub (edição in-line).
 * A RLS garante que o parceiro só altera linhas da própria distribuidora.
 */
export async function atualizarQuantidadeEstoque(
  estoqueId: string,
  quantidade: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guardHub();
    const q = Math.max(0, Math.floor(Number(quantidade) || 0));
    const { error } = await supabase
      .from("estoque_hub")
      .update({ quantidade: q, updated_at: new Date().toISOString() })
      .eq("id", estoqueId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/hub/dashboard");
    return { ok: true };
  });
}

/** Remove uma linha de estoque (produto que o hub deixou de trabalhar). */
export async function removerEstoque(estoqueId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guardHub();
    const { error } = await supabase.from("estoque_hub").delete().eq("id", estoqueId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/hub/dashboard");
    return { ok: true };
  });
}
