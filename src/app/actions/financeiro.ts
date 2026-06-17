"use server";

import { revalidatePath } from "next/cache";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";

/** Abate o saldo D+1 de dinheiro de uma distribuidora (zera e marca pagamentos). */
export async function abaterSaldoD1(distribuidoraId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("financeiro", "write");
    const hoje = new Date().toISOString().slice(0, 10);

    const { error: errDist } = await supabase
      .from("distribuidoras")
      .update({ saldo_d1_gs: 0 })
      .eq("id", distribuidoraId);
    if (errDist) return { ok: false, error: errDist.message };

    const { error: errPag } = await supabase
      .from("pagamentos")
      .update({ abatido_em: hoje })
      .eq("provedor", "dinheiro")
      .eq("recebido_por_distribuidora_id", distribuidoraId)
      .is("abatido_em", null);
    if (errPag) return { ok: false, error: errPag.message };

    revalidatePath("/financeiro");
    return { ok: true };
  });
}
