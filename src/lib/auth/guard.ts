import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { can, type Module, type Action } from "@/lib/auth/permissions";

/** Resultado padrão de Server Actions. */
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export class ForbiddenError extends Error {}

/**
 * Garante usuário autenticado COM permissão `action` no `module`.
 * Retorna o client de sessão (RLS) + perfil. Lança ForbiddenError se não puder.
 */
export async function guard(module: Module, action: Action = "read") {
  const { userId, profile } = await requireUser();
  if (!can(profile, module, action)) {
    throw new ForbiddenError(`Sem permissão para ${action} em ${module}`);
  }
  const supabase = await createClient();
  return { supabase, profile, userId };
}

/** Envolve uma action, convertendo exceções conhecidas em ActionResult. */
export async function runAction(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: "Não foi possível concluir a operação." };
  }
}
