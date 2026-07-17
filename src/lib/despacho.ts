import "server-only";

/**
 * Despacho na confirmação do pedido (pagamento aprovado OU dinheiro na entrega).
 *
 * Migrado de "WhatsApp/grupo de motoboys" para logística terceirizada via
 * Open Delivery (Entregas Expressas): em vez de anunciar a corrida num grupo
 * e esperar um motoboy reivindicar, registramos a entrega na operadora
 * (POST /v1/logistics/delivery) e o ciclo de vida passa a ser dirigido pelos
 * webhooks dela — ver api/webhooks/entregas-expressas/route.ts e
 * lib/integrations/entregas-expressas-eventos.ts.
 *
 * O envio pro grupo de motoboys (msgCorridaGrupo/notificarGrupoMotoboys) foi
 * REMOVIDO deste fluxo — ainda existe em lib/mensagens-motoboys.ts e no
 * webhook de grupo por enquanto, caso precisem de um fallback manual, mas
 * não é mais acionado automaticamente daqui.
 *
 * Usa o admin client (service-role) — escopo garantido pelo pedido_id único.
 * Chamado pelo webhook dLocal (pago), pela Server Action de aprovação e pelo
 * fluxo do bot quando o cliente escolhe dinheiro na entrega.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto, type ZapiConfig } from "@/lib/integrations/zapi";
import {
  criarEntrega,
  entregasExpressasConfigurado,
  type EntregasExpressasConfig,
  type AddressLogistics,
} from "@/lib/integrations/entregas-expressas";
import { gerarCodigoValidacao } from "@/lib/intel/status";
import { msgCodigoEntregaCliente } from "@/lib/mensagens-motoboys";
import { randomUUID } from "node:crypto";

export type DespachoResult = { ok: true; distribuidora: string } | { ok: false; error: string };

/**
 * TODO(endereço estruturado): yapa.clientes só tem endereço em texto livre
 * (endereco/zona/referencia) — sem rua/número/CEP separados. A API exige
 * esses campos. Por ora usamos fallbacks (zona → district, endereco inteiro
 * → street, CEP/número vazios) o suficiente pra RODAR EM SANDBOX, mas isso
 * PRECISA de dado real antes de produção (geocoding reverso OU captura
 * estruturada no fluxo do bot — decisão pendente).
 * TODO(country): doc só documenta exemplos com country="BR". Confirmar com
 * a Entregas Expressas se "PY" é aceito antes de ir a sandbox de verdade —
 * a operação do Yapa é em Ciudad del Este, Paraguai.
 */
function montarEnderecoFallback(input: {
  endereco: string | null;
  zona: string | null;
  latitude: number | null;
  longitude: number | null;
}): AddressLogistics {
  return {
    country: "PY", // TODO: confirmar aceite com a operadora
    state: "PY-11", // TODO: placeholder (Alto Paraná) — sem mapeamento real ainda
    city: "Ciudad del Este",
    district: input.zona ?? "—",
    street: input.endereco ?? "—",
    number: "S/N", // TODO: não temos número separado do texto livre
    postalCode: "000000", // TODO: sem CEP cadastrado
    complement: "",
    ...(input.latitude != null && input.longitude != null
      ? { latitude: input.latitude, longitude: input.longitude }
      : {}),
  };
}

export async function dispararOrdemDistribuidora(pedidoId: string): Promise<DespachoResult> {
  const admin = createAdminClient();

  const { data: pedido, error: errPedido } = await admin
    .from("pedidos")
    .select(
      "id, numero, numero_corrida, org_id, distribuidora_id, valor_total_gs, taxa_entrega_gs, distancia_km, forma_pagamento, endereco_entrega, latitude, longitude, cliente_id, codigo_validacao",
    )
    .eq("id", pedidoId)
    .single();
  if (errPedido || !pedido) return { ok: false, error: "Pedido não encontrado." };
  if (!pedido.distribuidora_id) return { ok: false, error: "Pedido sem distribuidora atribuída." };

  const [{ data: itens }, { data: dist }, { data: cliente }, { data: org }] = await Promise.all([
    admin.from("pedido_itens").select("descricao, quantidade, subtotal_gs").eq("pedido_id", pedidoId),
    admin
      .from("distribuidoras")
      .select(
        "nome, telefone, endereco, latitude, longitude, endereco_bairro, endereco_rua, endereco_numero, endereco_cidade, endereco_estado, endereco_cep, endereco_pais",
      )
      .eq("id", pedido.distribuidora_id)
      .single(),
    pedido.cliente_id
      ? admin.from("clientes").select("nome, telefone, endereco, zona").eq("id", pedido.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("orgs")
      .select(
        "zapi_instance, zapi_token, zapi_client_token, entregas_expressas_client_id, entregas_expressas_client_secret, entregas_expressas_merchant_id, taxa_cambio_brl_gs",
      )
      .eq("id", pedido.org_id)
      .single(),
  ]);

  if (!dist) return { ok: false, error: "Distribuidora não encontrada." };

  const zapiCfg: ZapiConfig | null =
    org?.zapi_instance && org?.zapi_token
      ? { instance: org.zapi_instance, token: org.zapi_token, clientToken: org.zapi_client_token }
      : null;

  const eeCfg: EntregasExpressasConfig | null =
    org?.entregas_expressas_client_id && org?.entregas_expressas_client_secret && org?.entregas_expressas_merchant_id
      ? {
          clientId: org.entregas_expressas_client_id,
          clientSecret: org.entregas_expressas_client_secret,
          merchantId: org.entregas_expressas_merchant_id,
          merchantNome: dist.nome,
        }
      : null;
  if (!entregasExpressasConfigurado(eeCfg)) {
    return { ok: false, error: "Entregas Expressas não configurada para esta org (credenciais ausentes)." };
  }

  const ehDinheiro = pedido.forma_pagamento === "dinheiro";
  const taxaEntrega = pedido.taxa_entrega_gs != null ? Number(pedido.taxa_entrega_gs) : 0;
  const totalProdutos = Number(pedido.valor_total_gs);
  const totalComFrete = totalProdutos + taxaEntrega;
  // Código de confirmação de entrega: garante que todo pedido despachado tenha um
  // (pedidos antigos/de outras origens podem não ter — gera na hora). O motoboy
  // só recebe "entregue" digitando esse código, que o cliente informa na porta.
  const codigoValidacao = pedido.codigo_validacao ?? gerarCodigoValidacao();

  // GS → BRL: a API só aceita "BRL" como moeda. taxa_cambio_brl_gs = quantos
  // GS vale 1 BRL (ver orgs.taxa_cambio_brl_gs / configuracoes.ts).
  const cambio = org?.taxa_cambio_brl_gs ? Number(org.taxa_cambio_brl_gs) : null;
  if (!cambio || cambio <= 0) {
    return { ok: false, error: "Taxa de câmbio BRL/GS não configurada — necessária para enviar o valor à Entregas Expressas." };
  }
  const gsParaBrl = (valorGs: number) => Math.round((valorGs / cambio) * 100) / 100;

  const pickupAddress: AddressLogistics =
    dist.endereco_rua && dist.endereco_cidade
      ? {
          country: dist.endereco_pais || "PY",
          state: dist.endereco_estado || "PY-11",
          city: dist.endereco_cidade,
          district: dist.endereco_bairro ?? "—",
          street: dist.endereco_rua,
          number: dist.endereco_numero ?? "S/N",
          postalCode: dist.endereco_cep ?? "000000",
          complement: "",
          ...(dist.latitude != null && dist.longitude != null
            ? { latitude: Number(dist.latitude), longitude: Number(dist.longitude) }
            : {}),
        }
      : montarEnderecoFallback({ endereco: dist.endereco, zona: null, latitude: dist.latitude != null ? Number(dist.latitude) : null, longitude: dist.longitude != null ? Number(dist.longitude) : null });

  const deliveryAddress: AddressLogistics = montarEnderecoFallback({
    endereco: pedido.endereco_entrega,
    zona: cliente?.zona ?? null,
    latitude: pedido.latitude != null ? Number(pedido.latitude) : null,
    longitude: pedido.longitude != null ? Number(pedido.longitude) : null,
  });

  // orderId próprio (UUID) — é o que usamos pra correlacionar webhooks depois
  // (yapa.entregas.provedor_order_id), já que deliveryId só existe após criar.
  const orderId = randomUUID();

  const criar = await criarEntrega(
    {
      orderId,
      orderDisplayId: String(pedido.numero),
      customerName: cliente?.nome ?? "Cliente Yapa",
      customerPhone: cliente?.telefone ?? undefined,
      pickupAddress,
      deliveryAddress,
      vehicle: {
        type: ["MOTORBIKE_BAG"],
        container: "THERMIC", // bebidas geladas
        containerSize: "MEDIUM",
      },
      totalOrderPrice: { value: gsParaBrl(totalComFrete), currency: "BRL" },
      // TODO(peso): catálogo não tem peso por produto — usando estimativa fixa
      // (1 caixa de cerveja ≈ 12kg) até termos peso real por item.
      totalWeight: Math.max(1000, (itens ?? []).length * 3000),
      returnToMerchant: false,
      canCombine: true,
      onlinePayment: !ehDinheiro,
      payments: ehDinheiro
        ? { method: "OFFLINE", wirelessPos: false, offlineMethod: [{ type: "CASH", amount: { value: gsParaBrl(totalComFrete), currency: "BRL" } }] }
        : { method: "ONLINE" },
      confirmationCodeRequired: true,
      items: (itens ?? []).map((it) => ({ name: it.descricao, quantity: Number(it.quantidade) })),
      limitTimes: {
        pickupLimit: 20,
        deliveryLimit: 45,
        orderCreatedAt: new Date().toISOString(),
      },
    },
    eeCfg!,
  );

  if (!criar.ok) {
    console.error("[yapa:despacho] criarEntrega falhou:", criar.error);
    return { ok: false, error: `Falha ao registrar entrega na Entregas Expressas: ${criar.error}` };
  }

  // Registra a entrega localmente já com o vínculo pro provedor externo.
  // status inicial 'aguardando' — o ACCEPTED/REJECTED real chega via webhook.
  const { error: errEntrega } = await admin.from("entregas").insert({
    org_id: pedido.org_id,
    pedido_id: pedidoId,
    status: "aguardando",
    provedor: "entregas_expressas",
    provedor_delivery_id: criar.data.deliveryId,
    provedor_order_id: orderId,
    horario_despacho: new Date().toISOString(),
  });
  if (errEntrega) {
    console.error("[yapa:despacho] falha ao gravar entregas local:", errEntrega.message);
    // Não aborta: a entrega já foi criada NA OPERADORA — abortar aqui deixaria
    // órfã uma entrega real sem registro nosso. Loga alto pra investigação manual.
  }

  const { error: errStatus } = await admin
    .from("pedidos")
    .update({ status: "em_separacao", codigo_validacao: codigoValidacao })
    .eq("id", pedidoId);
  if (errStatus) return { ok: false, error: errStatus.message };

  // Avisa o cliente. Bot autônomo: a confirmação chega sem passar por atendente.
  // Não bloqueia o despacho (tudo aqui é best-effort).
  if (cliente?.telefone) {
    // Só faz sentido para pagamento online — no dinheiro o bot já confirmou o pedido
    // no próprio fluxo, ao escolher a forma de pagamento.
    if (!ehDinheiro) {
      try {
        await enviarTexto(
          cliente.telefone,
          `✅ *Pagamento confirmado!* Seu pedido #${pedido.numero} já está sendo separado e logo sai para entrega. 🛵🍻`,
          zapiCfg,
        );
      } catch { /* não-bloqueante */ }
    }
    // Código de confirmação: sempre, independente da forma de pagamento — é o
    // cliente quem informa ao entregador na porta (confirmationCodeRequired: true
    // acima), nunca o entregador quem já sabe.
    try {
      await enviarTexto(cliente.telefone, msgCodigoEntregaCliente(pedido.numero, codigoValidacao), zapiCfg);
    } catch { /* não-bloqueante */ }
  }

  return { ok: true, distribuidora: dist.nome };
}
