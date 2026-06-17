"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

const orgSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(1, "Nome obrigatório").max(120),
});

export async function salvarOrg(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await guard("configuracoes", "write");
    const parsed = orgSchema.safeParse({
      id: formData.get("id"),
      nome: String(formData.get("nome") ?? "").trim(),
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from("orgs")
      .update({ nome: parsed.data.nome })
      .eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/configuracoes");
    return { ok: true };
  });
}

const zapiSchema = z.object({
  id: z.string().uuid(),
  zapi_instance: z.string().max(200),
  zapi_token: z.string().max(500),
  zapi_client_token: z.string().max(500),
  zapi_webhook_secret: z.string().max(200),
});

export async function salvarZapi(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await guard("configuracoes", "write");
    const parsed = zapiSchema.safeParse({
      id: formData.get("id"),
      zapi_instance: String(formData.get("zapi_instance") ?? "").trim(),
      zapi_token: String(formData.get("zapi_token") ?? "").trim(),
      zapi_client_token: String(formData.get("zapi_client_token") ?? "").trim(),
      zapi_webhook_secret: String(formData.get("zapi_webhook_secret") ?? "").trim(),
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from("orgs")
      .update({
        zapi_instance: parsed.data.zapi_instance || null,
        zapi_token: parsed.data.zapi_token || null,
        zapi_client_token: parsed.data.zapi_client_token || null,
        zapi_webhook_secret: parsed.data.zapi_webhook_secret || null,
      })
      .eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/configuracoes");
    return { ok: true };
  });
}
