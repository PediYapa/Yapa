"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";

const schema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Nome obrigatório").max(120),
  telefone: z
    .string()
    .trim()
    .min(8, "Telefone obrigatório (formato Z-API, ex.: 5959XXXXXXXX)")
    .max(20)
    .transform((v) => v.replace(/\D/g, "")),
  distribuidora_id: z.string().uuid({ message: "Selecione a distribuidora." }),
  ativo: z.coerce.boolean(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  return schema.safeParse({
    ...raw,
    distribuidora_id: raw.distribuidora_id === "" ? undefined : raw.distribuidora_id,
    ativo: raw.ativo === "true",
  });
}

export async function salvarMotoboy(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("motoboys", "write");
    const parsed = parse(formData);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const data = parsed.data;
    const payload = {
      nome: data.nome,
      telefone: data.telefone,
      distribuidora_id: data.distribuidora_id,
      ativo: data.ativo,
    };

    if (data.id) {
      const { error } = await supabase.from("motoboys").update(payload).eq("id", data.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("motoboys").insert({ ...payload, org_id: profile.org_id });
      if (error) {
        if (error.code === "23505") return { ok: false, error: "Já existe um motoboy com esse telefone." };
        return { ok: false, error: error.message };
      }
    }
    revalidatePath("/motoboys");
    return { ok: true };
  });
}

export async function excluirMotoboy(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("motoboys", "write");
    // Sem soft-delete na tabela (motoboys não têm histórico próprio); corridas já
    // reivindicadas seguram o registro via FK — nesse caso, orientar a desativar.
    const { error } = await supabase.from("motoboys").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        return { ok: false, error: "Este motoboy já tem corridas vinculadas — desative-o em vez de excluir." };
      }
      return { ok: false, error: error.message };
    }
    revalidatePath("/motoboys");
    return { ok: true };
  });
}
