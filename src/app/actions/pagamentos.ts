"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";
import { guaraniParaBrl } from "@/lib/intel/cambio";
import { criarCobrancaPix } from "@/lib/integrations/dlocal";

const gerarPixSchema = z.object({
  pedidoId: z.string().uuid("Pedido inválido."),
  totalGs: z.coerce
    .number()
    .positive("O valor do pedido deve ser maior que zero.")
    .max(1_000_000_000, "Valor fora do intervalo esperado."),
});

/**
 * Gera uma cobrança PIX na DLocal para um pedido.
 * Lê a taxa de câmbio da org, converte GS→BRL, chama a DLocal e grava o
 * gateway_id retornado no pedido. org_id vem sempre do perfil (nunca do input).
 */
export async function gerarPixDlocal(pedidoId: string, totalGs: number): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("pedidos", "write");
    const parsed = gerarPixSchema.parse({ pedidoId, totalGs });

    // 1) Taxa de câmbio da org atual
    const { data: org, error: errOrg } = await supabase
      .from("orgs")
      .select("id, taxa_cambio_brl_gs")
      .eq("id", profile.org_id)
      .single();
    if (errOrg || !org) return { ok: false, error: "Organização não encontrada." };

    // 2) Confirma que o pedido existe e pertence à org (RLS + filtro explícito)
    const { data: pedido, error: errPed } = await supabase
      .from("pedidos")
      .select("id, numero, gateway_id")
      .eq("id", parsed.pedidoId)
      .eq("org_id", profile.org_id)
      .is("deleted_at", null)
      .single();
    if (errPed || !pedido) return { ok: false, error: "Pedido não encontrado." };

    // 3) Converte GS → BRL com 2 casas decimais
    const totalBrl = guaraniParaBrl(parsed.totalGs, org.taxa_cambio_brl_gs);
    if (!(totalBrl > 0)) return { ok: false, error: "Valor convertido inválido." };

    // 4) Cria a cobrança na DLocal
    const cobranca = await criarCobrancaPix({
      pedidoId: pedido.id,
      valorBrl: totalBrl,
      descricao: `Pedido #${pedido.numero} — Yapa`,
    });

    // 5) Persiste o id da transação e o status inicial do gateway
    const { error: errUpd } = await supabase
      .from("pedidos")
      .update({ gateway_id: cobranca.gatewayId, gateway_status: cobranca.status })
      .eq("id", pedido.id)
      .eq("org_id", profile.org_id);
    if (errUpd) return { ok: false, error: errUpd.message };

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${pedido.id}`);
    return { ok: true, id: pedido.id };
  });
}
