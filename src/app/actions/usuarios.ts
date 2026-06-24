"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/database.types";

const PAPEIS: UserRole[] = ["owner", "gerente", "operador"];

const schemaNovoUsuario = z.object({
  nome: z.string().min(2, "Nome muito curto.").max(100),
  email: z.string().email("E-mail inválido."),
  senha: z.string().min(8, "Senha mínima de 8 caracteres."),
  role: z.enum(["gerente", "operador"]),
});

export async function criarUsuario(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await guard("usuarios", "write");

    const parsed = schemaNovoUsuario.safeParse({
      nome: formData.get("nome"),
      email: formData.get("email"),
      senha: formData.get("senha"),
      role: formData.get("role"),
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }

    const { nome, email, senha, role } = parsed.data;
    const admin = createAdminClient();

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    if (authErr) return { ok: false, error: authErr.message };

    const { error: profileErr } = await admin.from("user_profiles").insert({
      id: authData.user.id,
      org_id: profile.org_id,
      nome,
      role,
    });

    if (profileErr) {
      await admin.auth.admin.deleteUser(authData.user.id);
      return { ok: false, error: profileErr.message };
    }

    revalidatePath("/usuarios");
    return { ok: true, id: authData.user.id };
  });
}

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
