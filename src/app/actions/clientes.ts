"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";

const schema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().max(120).optional(),
  telefone: z.string().trim().min(6, "Telefone obrigatório").max(20),
  zona: z.string().trim().max(80).optional(),
  endereco: z.string().trim().max(200).optional(),
  referencia: z.string().trim().max(200).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal("").transform(() => undefined)),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal("").transform(() => undefined)),
  notas: z.string().trim().max(1000).optional(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  return schema.parse({
    ...raw,
    latitude: raw.latitude === "" ? undefined : raw.latitude,
    longitude: raw.longitude === "" ? undefined : raw.longitude,
  });
}

export async function salvarCliente(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("clientes", "write");
    const data = parse(formData);
    const payload = {
      nome: data.nome || null,
      telefone: data.telefone,
      zona: data.zona || null,
      endereco: data.endereco || null,
      referencia: data.referencia || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      notas: data.notas || null,
    };

    if (data.id) {
      const { error } = await supabase.from("clientes").update(payload).eq("id", data.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("clientes").insert({ ...payload, org_id: profile.org_id });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/clientes");
    return { ok: true };
  });
}

export async function excluirCliente(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("clientes", "write");
    const { error } = await supabase
      .from("clientes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/clientes");
    return { ok: true };
  });
}
