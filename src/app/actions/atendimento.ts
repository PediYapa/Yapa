"use server";

import { revalidatePath } from "next/cache";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";
import type { ConversaStatus, ConversaMensagem } from "@/lib/database.types";
import { enviarTexto } from "@/lib/integrations/zapi";

const STATUS_VALIDOS: ConversaStatus[] = ["aberta", "pendente", "resolvida", "arquivada"];

export async function alternarHandoff(conversaId: string, valor: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("atendimento", "write");
    const { error } = await supabase
      .from("conversas")
      .update({ handoff_humano: valor })
      .eq("id", conversaId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/atendimento");
    return { ok: true };
  });
}

export async function mudarStatusConversa(
  conversaId: string,
  status: ConversaStatus,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("atendimento", "write");
    if (!STATUS_VALIDOS.includes(status)) {
      return { ok: false, error: "Status de conversa inválido." };
    }
    const { error } = await supabase
      .from("conversas")
      .update({ status })
      .eq("id", conversaId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/atendimento");
    return { ok: true };
  });
}

export async function enviarMensagem(conversaId: string, texto: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("atendimento", "write");

    const conteudo = texto.trim();
    if (!conteudo) return { ok: false, error: "Mensagem vazia." };

    const { data: conversa, error: errConversa } = await supabase
      .from("conversas")
      .select("*")
      .eq("id", conversaId)
      .single();
    if (errConversa || !conversa) {
      return { ok: false, error: errConversa?.message ?? "Conversa não encontrada." };
    }

    const agora = new Date().toISOString();
    const nova: ConversaMensagem = { de: "humano", texto: conteudo, tipo: "texto", em: agora };
    const mensagens: ConversaMensagem[] = [...(conversa.mensagens ?? []), nova];

    const { error: errUpdate } = await supabase
      .from("conversas")
      .update({ mensagens, ultima_mensagem_em: agora })
      .eq("id", conversaId);
    if (errUpdate) return { ok: false, error: errUpdate.message };

    // Envio via WhatsApp é best-effort: não bloqueia o registro da mensagem.
    try {
      await enviarTexto(conversa.telefone, conteudo);
    } catch (e) {
      console.error("[atendimento] falha ao enviar via Z-API", e);
    }

    revalidatePath("/atendimento");
    return { ok: true };
  });
}
