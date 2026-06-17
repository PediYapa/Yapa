"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";

const schema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Nome obrigatório").max(120),
  telefone: z.string().trim().max(20).optional(),
  grupo_parceiro: z.string().trim().max(120).optional(),
  distribuidora_base_id: z.string().uuid().optional(),
  ativo: z.coerce.boolean(),
  notas: z.string().trim().max(1000).optional(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  return schema.parse({
    ...raw,
    distribuidora_base_id: raw.distribuidora_base_id === "" ? undefined : raw.distribuidora_base_id,
    ativo: raw.ativo === "true",
  });
}

export async function salvarEntregador(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("entregadores", "write");
    const data = parse(formData);
    const payload = {
      nome: data.nome,
      telefone: data.telefone || null,
      grupo_parceiro: data.grupo_parceiro || null,
      distribuidora_base_id: data.distribuidora_base_id ?? null,
      ativo: data.ativo,
      notas: data.notas || null,
    };

    if (data.id) {
      const { error } = await supabase.from("entregadores").update(payload).eq("id", data.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("entregadores").insert({ ...payload, org_id: profile.org_id });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/entregadores");
    return { ok: true };
  });
}

export async function excluirEntregador(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("entregadores", "write");
    const { error } = await supabase
      .from("entregadores")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/entregadores");
    return { ok: true };
  });
}
