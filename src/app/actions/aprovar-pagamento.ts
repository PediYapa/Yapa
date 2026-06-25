"use server";

import { revalidatePath } from "next/cache";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";
import { dispararOrdemDistribuidora } from "@/lib/despacho";

/**
 * MOCK do gateway de pagamento (futuro webhook dLocal).
 * Marca o pedido `aguardando_pagamento` → `pago` e dispara a comanda de
 * separação para a distribuidora (que move o pedido para `em_separacao`).
 */
export async function aprovarPagamento(pedidoId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("pedidos", "write");

    const { data: pedido, error: errLoad } = await supabase
      .from("pedidos")
      .select("id, status, distribuidora_id")
      .eq("id", pedidoId)
      .single();
    if (errLoad || !pedido) return { ok: false, error: "Pedido não encontrado." };
    if (pedido.status !== "aguardando_pagamento") {
      return { ok: false, error: `Pedido não está aguardando pagamento (status: ${pedido.status}).` };
    }
    if (!pedido.distribuidora_id) {
      return { ok: false, error: "Pedido sem distribuidora atribuída — roteie antes de aprovar." };
    }

    // 1) Aprova o pagamento
    const { error: errPago } = await supabase.from("pedidos").update({ status: "pago" }).eq("id", pedidoId);
    if (errPago) return { ok: false, error: errPago.message };

    // 2) Dispara a comanda de separação (move para em_separacao)
    const despacho = await dispararOrdemDistribuidora(pedidoId);
    if (!despacho.ok) {
      // Pagamento aprovado, mas a comanda falhou — reporta para ação manual.
      revalidatePath(`/pedidos/${pedidoId}`);
      return { ok: false, error: `Pagamento aprovado, mas o despacho falhou: ${despacho.error}` };
    }

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${pedidoId}`);
    return { ok: true, id: pedidoId };
  });
}
