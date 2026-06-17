"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";

const schema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Nome obrigatório").max(120),
  contato: z.string().trim().max(120).optional(),
  telefone: z.string().trim().max(20).optional(),
  endereco: z.string().trim().max(200).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  raio_km: z.coerce.number().min(0, "Raio inválido").max(1000),
  link_maps: z.string().trim().max(500).optional(),
  recebe_dinheiro: z.coerce.boolean(),
  ativo: z.coerce.boolean(),
  notas: z.string().trim().max(1000).optional(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  return schema.parse({
    ...raw,
    latitude: raw.latitude === "" ? undefined : raw.latitude,
    longitude: raw.longitude === "" ? undefined : raw.longitude,
    recebe_dinheiro: raw.recebe_dinheiro === "true",
    ativo: raw.ativo === "true",
  });
}

export async function salvarDistribuidora(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("distribuidoras", "write");
    const data = parse(formData);
    const payload = {
      nome: data.nome,
      contato: data.contato || null,
      telefone: data.telefone || null,
      endereco: data.endereco || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      raio_km: data.raio_km,
      link_maps: data.link_maps || null,
      recebe_dinheiro: data.recebe_dinheiro,
      ativo: data.ativo,
      notas: data.notas || null,
    };

    if (data.id) {
      const { error } = await supabase.from("distribuidoras").update(payload).eq("id", data.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("distribuidoras").insert({ ...payload, org_id: profile.org_id });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/distribuidoras");
    return { ok: true };
  });
}

export async function excluirDistribuidora(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("distribuidoras", "write");
    const { error } = await supabase
      .from("distribuidoras")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/distribuidoras");
    return { ok: true };
  });
}
