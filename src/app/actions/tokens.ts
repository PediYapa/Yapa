"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, ForbiddenError, type ActionResult } from "@/lib/auth/guard";
import { generateToken } from "@/lib/tokens";
import { TOKEN_SCOPES } from "@/lib/token-scopes";


/** Resultado da criação: carrega o plaintext (exibido uma única vez). */
export type CriarTokenResult =
  | { ok: true; plaintext: string }
  | { ok: false; error: string };

const schema = z.object({
  nome: z.string().trim().min(2, "Nome obrigatório").max(80),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1, "Selecione ao menos um escopo"),
});

export async function criarToken(
  _prev: CriarTokenResult | undefined,
  formData: FormData,
): Promise<CriarTokenResult> {
  try {
    const { supabase, profile, userId } = await guard("tokens", "write");

    const parsed = schema.safeParse({
      nome: formData.get("nome"),
      scopes: formData.getAll("scopes"),
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }

    const { plaintext, hash, prefixo } = generateToken();
    const { error } = await supabase.from("api_tokens").insert({
      org_id: profile.org_id,
      nome: parsed.data.nome,
      token_hash: hash,
      prefixo,
      scopes: parsed.data.scopes.join(","),
      created_by: userId,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/tokens");
    return { ok: true, plaintext };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: "Não foi possível concluir a operação." };
  }
}

export async function revogarToken(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("tokens", "write");
    const { error } = await supabase
      .from("api_tokens")
      .update({ revogado_em: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/tokens");
    return { ok: true };
  });
}
