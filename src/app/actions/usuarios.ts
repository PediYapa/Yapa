"use server";

import { revalidatePath } from "next/cache";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";
import type { UserRole } from "@/lib/database.types";

const PAPEIS: UserRole[] = ["owner", "gerente", "operador"];

export async function mudarPapel(userId: string, role: UserRole): Promise<ActionResult> {
  return runAction(async () => {
    if (!PAPEIS.includes(role)) return { ok: false, error: "Papel inválido." };
    const { supabase } = await guard("usuarios", "write");
    const { error } = await supabase
      .from("user_profiles")
      .update({ role })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/usuarios");
    return { ok: true };
  });
}

export async function alternarAtivo(userId: string, ativo: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("usuarios", "write");
    const { error } = await supabase
      .from("user_profiles")
      .update({ deactivated_at: ativo ? null : new Date().toISOString() })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/usuarios");
    return { ok: true };
  });
}
