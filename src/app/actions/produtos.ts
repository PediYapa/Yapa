"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";

const schema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Nome obrigatório").max(120),
  categoria: z.enum(["cerveja", "destilado", "pod", "vape", "voucher", "outro"]),
  preco_gs: z.coerce.number().min(0, "Preço inválido"),
  distribuidora_id: z.string().uuid().optional(),
  disponivel: z.coerce.boolean(),
  descricao: z.string().trim().max(1000).optional(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  return schema.parse({
    ...raw,
    distribuidora_id: raw.distribuidora_id === "" ? undefined : raw.distribuidora_id,
    disponivel: raw.disponivel === "true",
  });
}

export async function salvarProduto(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("produtos", "write");
    const data = parse(formData);
    const payload = {
      nome: data.nome,
      categoria: data.categoria,
      preco_gs: data.preco_gs,
      distribuidora_id: data.distribuidora_id ?? null,
      disponivel: data.disponivel,
      descricao: data.descricao || null,
    };

    if (data.id) {
      const { error } = await supabase.from("produtos").update(payload).eq("id", data.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("produtos").insert({ ...payload, org_id: profile.org_id });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/produtos");
    return { ok: true };
  });
}

export async function excluirProduto(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("produtos", "write");
    const { error } = await supabase
      .from("produtos")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/produtos");
    return { ok: true };
  });
}
