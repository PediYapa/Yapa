"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Nome obrigatório").max(120),
  categoria: z.enum(["cerveja", "destilado", "pod", "vape", "voucher", "outro"]),
  preco_gs: z.coerce.number().min(0, "Preço inválido"),
  distribuidora_id: z.string().uuid().optional(),
  disponivel: z.coerce.boolean(),
  descricao: z.string().trim().max(1000).optional(),
});

const MAX_IMAGEM_BYTES = 5 * 1024 * 1024; // 5 MB

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  return schema.parse({
    ...raw,
    distribuidora_id: raw.distribuidora_id === "" ? undefined : raw.distribuidora_id,
    disponivel: raw.disponivel === "true",
  });
}

/**
 * Faz upload da imagem do produto para o bucket público `catalogo` (via admin
 * client, que bypassa o RLS de storage) e devolve a URL pública.
 */
async function uploadImagem(orgId: string, file: File): Promise<string> {
  const admin = createAdminClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("catalogo").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(`Falha ao enviar imagem: ${error.message}`);
  const { data } = admin.storage.from("catalogo").getPublicUrl(path);
  return data.publicUrl;
}

export async function salvarProduto(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("produtos", "write");
    const data = parse(formData);

    // Imagem: novo upload tem prioridade; senão, "remover" limpa; senão, mantém.
    const arquivo = formData.get("imagem");
    const removerImagem = formData.get("remover_imagem") === "true";
    let imagem_url: string | null | undefined;
    if (arquivo instanceof File && arquivo.size > 0) {
      if (arquivo.size > MAX_IMAGEM_BYTES) return { ok: false, error: "Imagem acima de 5 MB." };
      if (!arquivo.type.startsWith("image/")) return { ok: false, error: "Arquivo não é uma imagem." };
      imagem_url = await uploadImagem(profile.org_id, arquivo);
    } else if (removerImagem) {
      imagem_url = null;
    }

    const payload = {
      nome: data.nome,
      categoria: data.categoria,
      preco_gs: data.preco_gs,
      distribuidora_id: data.distribuidora_id ?? null,
      disponivel: data.disponivel,
      descricao: data.descricao || null,
      ...(imagem_url !== undefined ? { imagem_url } : {}),
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
