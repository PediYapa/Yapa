import "server-only";

/**
 * Despacho na confirmação do pedido (pagamento aprovado OU dinheiro na entrega):
 * dispara EM PARALELO (Promise.allSettled — falha em uma perna não bloqueia a outra):
 *
 *  Perna 1 (SEMPRE) — Comanda de Separação → WhatsApp da distribuidora vinculada.
 *    O hub precisa saber que tem pedido pra separar, independente de haver
 *    entregador automático. Esta perna nunca depende de config de Entregas Expressas.
 *
 *  Perna 2 (quando configurada) — registro da entrega na Entregas Expressas
 *    (Open Delivery/ABRASEL), que substituiu o antigo leilão no grupo de motoboys.
 *    É RESILIENTE: se a org não tem credenciais, se a migration 017 ainda não foi
 *    aplicada (colunas entregas_expressas_ e endereco_ ausentes) ou se a API falha,
 *    a perna retorna {ok:false} controlado e loga aviso — NUNCA lança exceção nem
 *    contamina o select inicial de orgs/distribuidoras.
 *
 * Regra de sucesso: se QUALQUER perna funcionar, o despacho é sucesso. Só quando
 * as duas falham é que retornamos erro pro chamador. Assim o hub continua sendo
 * notificado mesmo antes da Entregas Expressas estar de fato ligada.
 *
 * Usa o admin client (service-role) — escopo garantido pelo pedido_id único.
 * Chamado pelo webhook de pagamento (pago), pela Server Action de aprovação e
 * pelo fluxo do bot quando o cliente escolhe dinheiro na entrega.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto, type ZapiConfig } from "@/lib/integrations/zapi";
import {
  criarEntrega,
  type EntregasExpressasConfig,
  type AddressLogistics,
} from "@/lib/integrations/entregas-expressas";
import { gs, telBR } from "@/lib/format";
import { gerarCodigoValidacao } from "@/lib/intel/status";
import { msgCodigoEntregaCliente } from "@/lib/mensagens-motoboys";
import { randomUUID } from "node:crypto";

export type DespachoResult = { ok: true; distribuidora: string } | { ok: false; error: string };

type AdminClient = ReturnType<typeof createAdminClient>;

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

/**
 * TODO(endereço estruturado): yapa.clientes só tem endereço em texto livre
 * (endereco/zona/referencia) — sem rua/número/CEP separados. A API da Entregas
 * Expressas exige esses campos. Por ora usamos fallbacks (zona → district,
 * endereco inteiro → street, CEP/número placeholders) o suficiente pra RODAR EM
 * SANDBOX, mas isso PRECISA de dado real antes de produção (geocoding reverso OU
 * captura estruturada no fluxo do bot — decisão pendente).
 * TODO(country): a doc só documenta exemplos com country="BR". Confirmar com a
 * Entregas Expressas se "PY" é aceito antes de ir a sandbox de verdade — a
 * operação do Yapa é em Ciudad del Este, Paraguai.
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

/**
 * Lê as credenciais da Entregas Expressas SEM deixar a ausência das colunas
 * (migration 017 ainda não aplicada) quebrar o fluxo: erro de coluna inexistente
 * vira `null` + aviso, nunca exceção. Fallback pra variáveis de ambiente (Vercel).
 */
async function carregarConfigEE(
  admin: AdminClient,
  orgId: string,
  merchantNome: string,
): Promise<EntregasExpressasConfig | null> {
  try {
    const { data, error } = await admin
      .from("orgs")
      .select("entregas_expressas_client_id, entregas_expressas_client_secret, entregas_expressas_merchant_id")
      .eq("id", orgId)
      .maybeSingle();
    if (error) {
      console.warn(
        "[yapa:despacho] colunas entregas_expressas_* indisponíveis (migration 017 pendente?):",
        error.message,
      );
    } else if (
      data?.entregas_expressas_client_id &&
      data.entregas_expressas_client_secret &&
      data.entregas_expressas_merchant_id
    ) {
      return {
        clientId: data.entregas_expressas_client_id,
        clientSecret: data.entregas_expressas_client_secret,
        merchantId: data.entregas_expressas_merchant_id,
        merchantNome,
      };
    }
  } catch (e) {
    console.warn("[yapa:despacho] falha ao ler config Entregas Expressas do banco:", e instanceof Error ? e.message : e);
  }

  // Fallback: variáveis de ambiente (quando a org ainda não tem credenciais no DB).
  const envId = process.env.ENTREGAS_EXPRESSAS_CLIENT_ID;
  const envSecret = process.env.ENTREGAS_EXPRESSAS_CLIENT_SECRET;
  const envMerchant = process.env.ENTREGAS_EXPRESSAS_MERCHANT_ID;
  if (envId && envSecret && envMerchant) {
    return {
      clientId: envId,
      clientSecret: envSecret,
      merchantId: envMerchant,
      merchantNome: process.env.ENTREGAS_EXPRESSAS_MERCHANT_NOME ?? merchantNome,
    };
  }
  return null;
}

/**
 * Endereço estruturado de coleta a partir das colunas novas da distribuidora
 * (migration 017). Best-effort: se as colunas não existem ainda ou faltam dados
 * essenciais, retorna `null` e o chamador cai no fallback de texto livre.
 */
async function carregarEnderecoPickup(admin: AdminClient, distId: string): Promise<AddressLogistics | null> {
  try {
    const { data, error } = await admin
      .from("distribuidoras")
      .select(
        "endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado, endereco_cep, endereco_pais, latitude, longitude",
      )
      .eq("id", distId)
      .maybeSingle();
    if (error || !data?.endereco_rua || !data.endereco_cidade) return null;
    return {
      country: data.endereco_pais || "PY",
      state: data.endereco_estado || "PY-11",
      city: data.endereco_cidade,
      district: data.endereco_bairro ?? "—",
      street: data.endereco_rua,
      number: data.endereco_numero ?? "S/N",
      postalCode: data.endereco_cep ?? "000000",
      complement: "",
      ...(data.latitude != null && data.longitude != null
        ? { latitude: Number(data.latitude), longitude: Number(data.longitude) }
        : {}),
    };
  } catch {
    return null;
  }
}

export async function dispararOrdemDistribuidora(pedidoId: string): Promise<DespachoResult> {
  const admin = createAdminClient();

  const { data: pedido, error: errPedido } = await admin
    .from("pedidos")
    .select(
      "id, numero, org_id, distribuidora_id, valor_total_gs, taxa_entrega_gs, forma_pagamento, endereco_entrega, latitude, longitude, cliente_id, codigo_validacao",
    )
    .eq("id", pedidoId)
    .single();
  if (errPedido || !pedido) return { ok: false, error: "Pedido não encontrado." };
  if (!pedido.distribuidora_id) return { ok: false, error: "Pedido sem distribuidora atribuída." };
  const distribuidoraId = pedido.distribuidora_id;

  // Selects iniciais: SÓ colunas garantidas (pré-migration 017). Nada de
  // entregas_expressas_*/endereco_* aqui — se referenciadas antes da 017 rodar,
  // o PostgREST devolve erro e derruba o despacho inteiro. Essas colunas novas
  // são lidas separadamente, best-effort, dentro da perna 2.
  const [{ data: itens }, { data: dist }, { data: cliente }, { data: org }] = await Promise.all([
    admin.from("pedido_itens").select("descricao, quantidade, subtotal_gs").eq("pedido_id", pedidoId),
    admin.from("distribuidoras").select("nome, telefone, endereco, latitude, longitude").eq("id", distribuidoraId).single(),
    pedido.cliente_id
      ? admin.from("clientes").select("nome, telefone, zona").eq("id", pedido.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("orgs").select("zapi_instance, zapi_token, zapi_client_token, taxa_cambio_brl_gs").eq("id", pedido.org_id).single(),
  ]);

  if (!dist) return { ok: false, error: "Distribuidora não encontrada." };

  const ehDinheiro = pedido.forma_pagamento === "dinheiro";
  const taxaEntrega = pedido.taxa_entrega_gs != null ? Number(pedido.taxa_entrega_gs) : 0;
  const totalProdutos = Number(pedido.valor_total_gs);
  const totalComFrete = totalProdutos + taxaEntrega;
  // Código de confirmação de entrega: garante que todo pedido despachado tenha um
  // (pedidos antigos/de outras origens podem não ter — gera na hora). O entregador
  // só recebe "entregue" com esse código, que o cliente informa na porta.
  const codigoValidacao = pedido.codigo_validacao ?? gerarCodigoValidacao();
  const cambio = org?.taxa_cambio_brl_gs ? Number(org.taxa_cambio_brl_gs) : null;

  const zapiCfg: ZapiConfig | null =
    org?.zapi_instance && org?.zapi_token
      ? { instance: org.zapi_instance, token: org.zapi_token, clientToken: org.zapi_client_token }
      : null;

  // --- Perna 1: comanda de separação pro WhatsApp da distribuidora (SEMPRE). ---
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

  // --- Perna 2: registro na Entregas Expressas (resiliente, nunca lança). ---
  const registrarEntregaExpressas = async (): Promise<{ ok: true; deliveryId: string } | { ok: false; error: string }> => {
    const eeCfg = await carregarConfigEE(admin, pedido.org_id, dist.nome);
    if (!eeCfg) {
      return { ok: false, error: "Entregas Expressas não configurada (credenciais ausentes ou migration 017 pendente)." };
    }
    if (!cambio || cambio <= 0) {
      return { ok: false, error: "Taxa de câmbio BRL/GS não configurada — necessária para enviar o valor à Entregas Expressas." };
    }
    // GS → BRL: a API só aceita "BRL" como moeda. taxa_cambio_brl_gs = quantos GS valem 1 BRL.
    const gsParaBrl = (valorGs: number) => Math.round((valorGs / cambio) * 100) / 100;

    const pickupAddress =
      (await carregarEnderecoPickup(admin, distribuidoraId)) ??
      montarEnderecoFallback({
        endereco: dist.endereco,
        zona: null,
        latitude: dist.latitude != null ? Number(dist.latitude) : null,
        longitude: dist.longitude != null ? Number(dist.longitude) : null,
      });

    const deliveryAddress = montarEnderecoFallback({
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
      eeCfg,
    );

    if (!criar.ok) return { ok: false, error: criar.error };

    // Registra a entrega localmente já com o vínculo pro provedor externo.
    // Best-effort: a entrega JÁ existe na operadora — se o insert local falhar
    // (colunas provedor_* ausentes / RLS), logamos alto pra investigação manual,
    // mas não desfazemos o que já foi criado lá fora.
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
      console.error("[yapa:despacho] entrega criada na operadora mas falha ao gravar entregas local:", errEntrega.message);
    }

    return { ok: true, deliveryId: criar.data.deliveryId };
  };

  // Duplo disparo em paralelo — nunca deixar uma perna bloquear a outra.
  const [rHub, rEntrega] = await Promise.allSettled([
    dist.telefone
      ? enviarTexto(dist.telefone, comanda, zapiCfg)
      : Promise.resolve({ ok: false as const, error: "distribuidora sem telefone cadastrado" }),
    registrarEntregaExpressas(),
  ]);

  const okHub = rHub.status === "fulfilled" && rHub.value.ok;
  const okEntrega = rEntrega.status === "fulfilled" && rEntrega.value.ok;
  const erroHub = rHub.status === "fulfilled" ? rHub.value.error : rHub.reason;
  const erroEntrega = rEntrega.status === "fulfilled" ? (rEntrega.value.ok ? null : rEntrega.value.error) : rEntrega.reason;

  if (!okHub) console.error("[yapa:despacho] comanda distribuidora falhou:", erroHub);
  if (!okEntrega) console.warn("[yapa:despacho] registro na Entregas Expressas falhou:", erroEntrega);
  if (okHub && !okEntrega) {
    console.warn(`[yapa:despacho] pedido #${pedido.numero} foi pro hub, mas sem entregador automático ainda (Entregas Expressas indisponível).`);
  }

  // Só falha de verdade se NENHUMA perna funcionou.
  if (!okHub && !okEntrega) {
    return { ok: false, error: "Falha ao notificar a distribuidora e ao registrar a entrega na operadora." };
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
    // cliente quem informa ao entregador na porta (confirmationCodeRequired: true),
    // nunca o entregador quem já sabe.
    try {
      await enviarTexto(cliente.telefone, msgCodigoEntregaCliente(pedido.numero, codigoValidacao), zapiCfg);
    } catch { /* não-bloqueante */ }
  }

  return { ok: true, distribuidora: dist.nome };
}
