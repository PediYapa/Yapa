import "server-only";

/**
 * Despacho na confirmação do pedido (pagamento aprovado OU dinheiro na entrega):
 * dispara EM PARALELO (Promise.allSettled — falha em um não bloqueia o outro):
 *  1. Comanda de Separação → WhatsApp da distribuidora vinculada.
 *  2. Anúncio da corrida → grupo de motoboys da distribuidora (se configurado).
 * O 1º motoboy que responder "P <numero_corrida>" no grupo reivindica a corrida
 * (claim atômico no webhook — ver api/webhooks/whatsapp/grupo-motoboys.ts).
 *
 * Usa o admin client (service-role) — escopo garantido pelo pedido_id único.
 * Chamado pelo webhook dLocal (pago), pela Server Action de aprovação e pelo
 * fluxo do bot quando o cliente escolhe dinheiro na entrega.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto, notificarGrupoMotoboys, type ZapiConfig } from "@/lib/integrations/zapi";
import { gs, telBR } from "@/lib/format";
import { msgCorridaGrupo } from "@/lib/mensagens-motoboys";

export type DespachoResult = { ok: true; distribuidora: string } | { ok: false; error: string };

/** Formata a comanda de separação (pura) a partir dos dados do pedido. */
function montarComanda(input: {
  numero: number;
  itens: { descricao: string; quantidade: number; subtotal_gs: number }[];
  total_gs: number;
  forma_pagamento: string | null;
  cliente: string | null;
  telefone: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
}): string {
  const linhas = input.itens.map((it) => `• ${it.quantidade}x ${it.descricao} (${gs(it.subtotal_gs)})`);
  const pagamento = input.forma_pagamento === "dinheiro" ? "Dinheiro na entrega" : "Pago online";
  const partes = [
    `🧾 *COMANDA DE SEPARAÇÃO — Pedido #${input.numero}*`,
    "",
    "*Itens:*",
    ...linhas,
    "",
    `*Total: ${gs(input.total_gs)}*`,
    `*Pagamento:* ${pagamento}`,
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
    .select(
      "id, numero, numero_corrida, org_id, distribuidora_id, valor_total_gs, taxa_entrega_gs, distancia_km, forma_pagamento, endereco_entrega, latitude, longitude, cliente_id",
    )
    .eq("id", pedidoId)
    .single();
  if (errPedido || !pedido) return { ok: false, error: "Pedido não encontrado." };
  if (!pedido.distribuidora_id) return { ok: false, error: "Pedido sem distribuidora atribuída." };

  const [{ data: itens }, { data: dist }, { data: cliente }, { data: org }] = await Promise.all([
    admin.from("pedido_itens").select("descricao, quantidade, subtotal_gs").eq("pedido_id", pedidoId),
    admin.from("distribuidoras").select("nome, telefone, grupo_motoboys_id").eq("id", pedido.distribuidora_id).single(),
    pedido.cliente_id
      ? admin.from("clientes").select("nome, telefone").eq("id", pedido.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("orgs").select("zapi_instance, zapi_token, zapi_client_token").eq("id", pedido.org_id).single(),
  ]);

  if (!dist) return { ok: false, error: "Distribuidora não encontrada." };
  if (!dist.telefone && !dist.grupo_motoboys_id) {
    return { ok: false, error: `Distribuidora "${dist.nome}" sem telefone nem grupo de motoboys cadastrado.` };
  }

  const ehDinheiro = pedido.forma_pagamento === "dinheiro";
  const taxaEntrega = pedido.taxa_entrega_gs != null ? Number(pedido.taxa_entrega_gs) : null;
  const totalProdutos = Number(pedido.valor_total_gs);

  const comanda = montarComanda({
    numero: pedido.numero,
    itens: (itens ?? []).map((it) => ({ descricao: it.descricao, quantidade: Number(it.quantidade), subtotal_gs: Number(it.subtotal_gs) })),
    total_gs: totalProdutos,
    forma_pagamento: pedido.forma_pagamento,
    cliente: cliente?.nome ?? null,
    telefone: cliente?.telefone ?? null,
    endereco: pedido.endereco_entrega,
    latitude: pedido.latitude != null ? Number(pedido.latitude) : null,
    longitude: pedido.longitude != null ? Number(pedido.longitude) : null,
  });

  // ⚠️ Privacidade: o grupo recebe só endereço resumido — nome/telefone/PIN do
  // cliente vão apenas no DM do motoboy vencedor.
  const corrida = msgCorridaGrupo({
    numeroCorrida: pedido.numero_corrida,
    distribuidoraNome: dist.nome,
    enderecoResumido: pedido.endereco_entrega,
    distanciaKm: pedido.distancia_km != null ? Number(pedido.distancia_km) : null,
    taxaEntregaGs: taxaEntrega,
    pagoOnline: !ehDinheiro,
    totalCobrarGs: totalProdutos + (taxaEntrega ?? 0),
  });

  const zapiCfg: ZapiConfig | null =
    org?.zapi_instance && org?.zapi_token
      ? { instance: org.zapi_instance, token: org.zapi_token, clientToken: org.zapi_client_token }
      : null;

  // Duplo disparo em paralelo — nunca deixar um disparo bloquear o outro.
  const [envioDist, envioGrupo] = await Promise.allSettled([
    dist.telefone
      ? enviarTexto(dist.telefone, comanda, zapiCfg)
      : Promise.resolve({ ok: false as const, error: "sem telefone" }),
    dist.grupo_motoboys_id
      ? notificarGrupoMotoboys(dist.grupo_motoboys_id, corrida, zapiCfg)
      : Promise.resolve({ ok: false as const, error: "sem grupo de motoboys" }),
  ]);

  const okDist = envioDist.status === "fulfilled" && envioDist.value.ok;
  const okGrupo = envioGrupo.status === "fulfilled" && envioGrupo.value.ok;
  if (!okDist) console.error("[yapa:despacho] comanda distribuidora falhou:", envioDist.status === "fulfilled" ? envioDist.value.error : envioDist.reason);
  if (!okGrupo) console.error("[yapa:despacho] corrida grupo motoboys falhou:", envioGrupo.status === "fulfilled" ? envioGrupo.value.error : envioGrupo.reason);
  if (!okDist && !okGrupo) return { ok: false, error: "Falha ao notificar distribuidora e grupo de motoboys." };

  const { error: errStatus } = await admin
    .from("pedidos")
    .update({ status: "em_separacao" })
    .eq("id", pedidoId);
  if (errStatus) return { ok: false, error: errStatus.message };

  // Avisa o cliente que o pagamento foi confirmado e o pedido entrou em separação.
  // Só faz sentido para pagamento online — no dinheiro o bot já confirmou o pedido.
  // Bot autônomo: a confirmação chega sem passar por atendente. Não bloqueia o despacho.
  if (!ehDinheiro && cliente?.telefone) {
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
