"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Nome obrigatório").max(120),
  categoria: z.enum(["cerveja", "destilado", "pod", "conveniencia", "combo"]),
  preco_gs: z.coerce.number().min(0, "Preço inválido"),
  // Cervejas: preço/qtd da caixa. Opcionais — vazio = vende só por unidade.
  preco_caixa: z.coerce.number().min(0, "Preço da caixa inválido").optional(),
  unidades_por_caixa: z.coerce.number().int().min(1, "Unidades por caixa inválido").optional(),
  // Pods: sabores. Lista de strings (já parseada de texto em parse()).
  opcoes_variacao: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  distribuidora_id: z.string().uuid().optional(),
  disponivel: z.coerce.boolean(),
  descricao: z.string().trim().max(1000).optional(),
});

const MAX_IMAGEM_BYTES = 5 * 1024 * 1024; // 5 MB

/** Normaliza número de input pt-BR/PY: aceita vírgula decimal e vazio. */
function numOuUndefined(v: string | undefined): string | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  return v.replace(",", ".");
}

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  // Sabores chegam como string "Menta, Morango, Uva" → vira array limpo.
  const sabores = (raw.opcoes_variacao ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return schema.safeParse({
    ...raw,
    preco_caixa: numOuUndefined(raw.preco_caixa),
    unidades_por_caixa: numOuUndefined(raw.unidades_por_caixa),
    opcoes_variacao: sabores.length > 0 ? sabores : undefined,
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
    const parsed = parse(formData);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados do produto inválidos." };
    }
    const data = parsed.data;

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
      // Caixa só faz sentido para cerveja; nas demais categorias grava null.
      preco_caixa: data.categoria === "cerveja" ? data.preco_caixa ?? null : null,
      unidades_por_caixa: data.categoria === "cerveja" ? data.unidades_por_caixa ?? null : null,
      // Variações só para pod; nas demais grava null.
      opcoes_variacao: data.categoria === "pod" ? data.opcoes_variacao ?? null : null,
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
