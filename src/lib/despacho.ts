import "server-only";

/**
 * Despacho B2B: monta a "Comanda de Separação" de um pedido e envia para o
 * WhatsApp da distribuidora vinculada, marcando o pedido como `em_separacao`.
 *
 * Usa o admin client (service-role) — escopo garantido pelo pedido_id único.
 * Chamado pela Server Action de aprovação de pagamento (mock do gateway dLocal)
 * e, futuramente, pelo webhook real de pagamento.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto, type ZapiConfig } from "@/lib/integrations/zapi";
import { gs, telBR } from "@/lib/format";

export type DespachoResult = { ok: true; distribuidora: string } | { ok: false; error: string };

/** Formata a comanda de separação (pura) a partir dos dados do pedido. */
function montarComanda(input: {
  numero: number;
  itens: { descricao: string; quantidade: number; subtotal_gs: number }[];
  total_gs: number;
  cliente: string | null;
  telefone: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
}): string {
  const linhas = input.itens.map((it) => `• ${it.quantidade}x ${it.descricao} (${gs(it.subtotal_gs)})`);
  const partes = [
    `🧾 *COMANDA DE SEPARAÇÃO — Pedido #${input.numero}*`,
    "",
    "*Itens:*",
    ...linhas,
    "",
    `*Total: ${gs(input.total_gs)}*`,
    "",
    `*Cliente:* ${input.cliente ?? "—"}${input.telefone ? ` (${telBR(input.telefone)})` : ""}`,
  ];
  if (input.endereco) partes.push(`*Endereço:* ${input.endereco}`);
  if (input.latitude != null && input.longitude != null) {
    partes.push(`*Localização:* https://maps.google.com/?q=${input.latitude},${input.longitude}`);
  }
  partes.push("", "Separe o pedido e confirme o despacho. 🛵");
  return partes.join("\n");
}

export async function dispararOrdemDistribuidora(pedidoId: string): Promise<DespachoResult> {
  const admin = createAdminClient();

  const { data: pedido, error: errPedido } = await admin
    .from("pedidos")
    .select("id, numero, org_id, distribuidora_id, valor_total_gs, endereco_entrega, latitude, longitude, cliente_id")
    .eq("id", pedidoId)
    .single();
  if (errPedido || !pedido) return { ok: false, error: "Pedido não encontrado." };
  if (!pedido.distribuidora_id) return { ok: false, error: "Pedido sem distribuidora atribuída." };

  const [{ data: itens }, { data: dist }, { data: cliente }, { data: org }] = await Promise.all([
    admin.from("pedido_itens").select("descricao, quantidade, subtotal_gs").eq("pedido_id", pedidoId),
    admin.from("distribuidoras").select("nome, telefone").eq("id", pedido.distribuidora_id).single(),
    pedido.cliente_id
      ? admin.from("clientes").select("nome, telefone").eq("id", pedido.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("orgs").select("zapi_instance, zapi_token, zapi_client_token").eq("id", pedido.org_id).single(),
  ]);

  if (!dist) return { ok: false, error: "Distribuidora não encontrada." };
  if (!dist.telefone) return { ok: false, error: `Distribuidora "${dist.nome}" sem telefone cadastrado.` };

  const comanda = montarComanda({
    numero: pedido.numero,
    itens: (itens ?? []).map((it) => ({ descricao: it.descricao, quantidade: Number(it.quantidade), subtotal_gs: Number(it.subtotal_gs) })),
    total_gs: Number(pedido.valor_total_gs),
    cliente: cliente?.nome ?? null,
    telefone: cliente?.telefone ?? null,
    endereco: pedido.endereco_entrega,
    latitude: pedido.latitude != null ? Number(pedido.latitude) : null,
    longitude: pedido.longitude != null ? Number(pedido.longitude) : null,
  });

  const zapiCfg: ZapiConfig | null =
    org?.zapi_instance && org?.zapi_token
      ? { instance: org.zapi_instance, token: org.zapi_token, clientToken: org.zapi_client_token }
      : null;

  const envio = await enviarTexto(dist.telefone, comanda, zapiCfg);
  if (!envio.ok) return { ok: false, error: `Falha ao enviar comanda: ${envio.error ?? "erro Z-API"}` };

  const { error: errStatus } = await admin
    .from("pedidos")
    .update({ status: "em_separacao" })
    .eq("id", pedidoId);
  if (errStatus) return { ok: false, error: errStatus.message };

  // Avisa o cliente que o pagamento foi confirmado e o pedido entrou em separação.
  // Bot autônomo: a confirmação chega sem passar por atendente. Não bloqueia o despacho.
  if (cliente?.telefone) {
    try {
      await enviarTexto(
        cliente.telefone,
        `✅ *Pagamento confirmado!* Seu pedido #${pedido.numero} já está sendo separado e logo sai para entrega. 🛵🍻`,
        zapiCfg,
      );
    } catch { /* não-bloqueante */ }
  }

  return { ok: true, distribuidora: dist.nome };
}
