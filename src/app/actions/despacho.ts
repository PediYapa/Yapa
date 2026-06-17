"use server";

import { revalidatePath } from "next/cache";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";
import type { EntregaStatus, EntregaRow } from "@/lib/database.types";

const STATUS_VALIDOS: EntregaStatus[] = [
  "aguardando",
  "coletado",
  "em_entrega",
  "entregue",
  "cancelada",
];

export async function atribuirEntregador(
  entregaId: string,
  entregadorId: string | null,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("despacho", "write");
    const { error } = await supabase
      .from("entregas")
      .update({ entregador_id: entregadorId || null })
      .eq("id", entregaId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/despacho");
    return { ok: true };
  });
}

export async function mudarStatusEntrega(
  entregaId: string,
  novo: EntregaStatus,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("despacho", "write");

    if (!STATUS_VALIDOS.includes(novo)) {
      return { ok: false, error: "Status de entrega inválido." };
    }

    const { data: entrega, error: errEntrega } = await supabase
      .from("entregas")
      .select("*")
      .eq("id", entregaId)
      .single();
    if (errEntrega || !entrega) {
      return { ok: false, error: errEntrega?.message ?? "Entrega não encontrada." };
    }

    const agora = new Date().toISOString();
    const patch: Partial<EntregaRow> = { status: novo };
    if (novo === "coletado") patch.horario_coleta = agora;
    if (novo === "entregue") patch.horario_entrega_realizado = agora;

    const { error: errUpdate } = await supabase
      .from("entregas")
      .update(patch)
      .eq("id", entregaId);
    if (errUpdate) return { ok: false, error: errUpdate.message };

    if (novo === "entregue") {
      // Incrementa o contador de entregas do entregador.
      if (entrega.entregador_id) {
        const { data: entregador } = await supabase
          .from("entregadores")
          .select("entregas_completadas")
          .eq("id", entrega.entregador_id)
          .single();
        const atual = entregador?.entregas_completadas ?? 0;
        await supabase
          .from("entregadores")
          .update({ entregas_completadas: atual + 1 })
          .eq("id", entrega.entregador_id);
      }
      // Marca o pedido como entregue.
      await supabase
        .from("pedidos")
        .update({ status: "entregue" })
        .eq("id", entrega.pedido_id);
    }

    revalidatePath("/despacho");
    return { ok: true };
  });
}
