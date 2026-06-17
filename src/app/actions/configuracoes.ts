"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";

const schema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(1, "Nome obrigatório").max(120),
});

export async function salvarOrg(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("configuracoes", "write");
    const parsed = schema.safeParse({
      id: formData.get("id"),
      nome: formData.get("nome"),
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const { error } = await supabase
      .from("orgs")
      .update({ nome: parsed.data.nome })
      .eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/configuracoes");
    return { ok: true };
  });
}
