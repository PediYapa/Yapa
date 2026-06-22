"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/auth/guard";

const contatoSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto.").max(120),
  email: z.string().email("E-mail inválido.").max(200),
  mensagem: z.string().trim().min(10, "Mensagem muito curta.").max(2000),
});

/** Insere uma mensagem do formulário público de contato na tabela yapa.contatos. */
export async function enviarContato(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contatoSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    mensagem: formData.get("mensagem"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("contatos").insert({
      nome: parsed.data.nome,
      email: parsed.data.email,
      mensagem: parsed.data.mensagem,
    });
    if (error) return { ok: false, error: "No fue posible enviar el mensaje. Intente nuevamente." };
    return { ok: true };
  } catch {
    return { ok: false, error: "No fue posible enviar el mensaje. Intente nuevamente." };
  }
}
