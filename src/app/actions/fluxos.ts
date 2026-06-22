"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";

const botaoSchema = z.object({ id: z.string().min(1), label: z.string().trim().min(1).max(40) });

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    tipo: z.enum(["inicio", "texto", "imagem", "botoes", "produto", "humano", "payment_dlocal", "external_link", "location_capture"]),
    texto: z.string().max(2000).optional(),
    imagem_url: z.string().max(2000).optional(),
    produto_id: z.string().optional(),
    botoes: z.array(botaoSchema).max(3).optional(), // WhatsApp: até 3 botões de resposta
    link_url: z.string().max(2000).optional(),
  }),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  data: z.object({ origemOpcaoId: z.string().nullable().optional() }).nullable().optional(),
});

const salvarSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Dê um nome ao fluxo").max(120),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

export type SalvarFluxoInput = z.input<typeof salvarSchema>;

export async function salvarFluxo(input: SalvarFluxoInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("fluxos", "write");
    const result = salvarSchema.safeParse(input);
    if (!result.success) {
      const msg = result.error.issues[0]?.message ?? "Dados do fluxo inválidos.";
      return { ok: false, error: msg };
    }
    const data = result.data;
    const payload = { nome: data.nome, nodes: data.nodes, edges: data.edges };

    if (data.id) {
      const { error } = await supabase.from("fluxos").update(payload).eq("id", data.id);
      if (error) return { ok: false, error: error.message };
      revalidatePath("/fluxos");
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("fluxos")
      .insert({ ...payload, org_id: profile.org_id })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/fluxos");
    return { ok: true, id: row!.id };
  });
}

/** Ativa um fluxo (e desativa os demais da org — só um ativo por vez). */
export async function ativarFluxo(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("fluxos", "write");
    const { error: e1 } = await supabase
      .from("fluxos")
      .update({ ativo: false })
      .eq("org_id", profile.org_id)
      .eq("ativo", true);
    if (e1) return { ok: false, error: e1.message };
    const { error: e2 } = await supabase.from("fluxos").update({ ativo: true }).eq("id", id);
    if (e2) return { ok: false, error: e2.message };
    revalidatePath("/fluxos");
    return { ok: true };
  });
}

/** Desativa o fluxo (volta ao fallback do bot via OpenAI). */
export async function desativarFluxo(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("fluxos", "write");
    const { error } = await supabase.from("fluxos").update({ ativo: false }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/fluxos");
    return { ok: true };
  });
}

export async function excluirFluxo(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("fluxos", "write");
    const { error } = await supabase
      .from("fluxos")
      .update({ deleted_at: new Date().toISOString(), ativo: false })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/fluxos");
    return { ok: true };
  });
}
