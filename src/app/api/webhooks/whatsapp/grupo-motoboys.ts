import "server-only";

/**
 * Mensagens vindas de GRUPOS de motoboys (Z-API) — separado do engine de fluxo
 * do cliente. Comandos aceitos:
 *   "P <numero_corrida>" → reivindica a corrida (claim ATÔMICO: um único UPDATE
 *                          condicional, sem SELECT prévio — dois motoboys no
 *                          mesmo segundo → exatamente um ganha).
 *   "E <numero_corrida> <código>" → o motoboy atribuído confirma a entrega.
 *     O código (4 dígitos) é o `pedidos.codigo_validacao` que o CLIENTE recebeu
 *     por WhatsApp ao confirmar o pedido — o motoboy pede ao cliente na porta.
 *     Isso prova que ele chegou lá, não só que "diz" ter entregado.
 * Qualquer outra mensagem é ignorada em silêncio (motoboys conversam entre si;
 * o bot não pode responder a tudo).
 *
 * ⚠️ Privacidade: dados completos do cliente só no DM do vencedor, nunca no grupo.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto, notificarGrupoMotoboys, type ZapiConfig } from "@/lib/integrations/zapi";
import {
  msgCorridaAceitaGrupo,
  msgDmVencedor,
  MSG_CORRIDA_JA_ACEITA,
  msgDmEntregaConfirmada,
  msgDmCodigoObrigatorio,
  msgDmCodigoInvalido,
  msgClienteEntregue,
} from "@/lib/mensagens-motoboys";

type AdminClient = ReturnType<typeof createAdminClient>;

const RE_ACEITAR = /^\s*P\s*(\d+)\s*$/i;
/** "E <corrida> <código de 4 dígitos>" — código é obrigatório (segurança de entrega). */
const RE_ENTREGUE = /^\s*E\s*(\d+)\s+(\d{4})\s*$/i;
/** "E <corrida>" sem código — casos que a UI antiga ainda manda; gera um lembrete. */
const RE_ENTREGUE_SEM_CODIGO = /^\s*E\s*(\d+)\s*$/i;

/** Compara IDs de grupo tolerando formatos ("...-group", "...@g.us", só dígitos). */
export function mesmoGrupo(cadastrado: string | null, recebido: string): boolean {
  if (!cadastrado) return false;
  const a = cadastrado.trim();
  const b = recebido.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const digitos = (s: string) => s.replace(/\D/g, "");
  return digitos(a).length > 0 && digitos(a) === digitos(b);
}

export async function handleMensagemGrupoMotoboys(input: {
  admin: AdminClient;
  zapiCfg: ZapiConfig | null;
  orgId: string;
  /** ID cru do grupo como veio no payload (sem sanitizar). */
  grupoPhone: string;
  /** Telefone do remetente dentro do grupo (participantPhone). */
  participantPhone: string;
  texto: string;
}): Promise<{ acao: string }> {
  const { admin, zapiCfg, orgId, grupoPhone, participantPhone, texto } = input;

  // 1) O grupo é de alguma distribuidora? (5 hubs — carrega todos e compara tolerante)
  const { data: dists } = await admin
    .from("distribuidoras")
    .select("id, nome, grupo_motoboys_id")
    .eq("org_id", orgId)
    .not("grupo_motoboys_id", "is", null)
    .is("deleted_at", null);
  const dist = (dists ?? []).find((d) => mesmoGrupo(d.grupo_motoboys_id, grupoPhone));
  if (!dist) return { acao: "grupo-nao-cadastrado" };

  // 2) Só comandos P/E interessam; o resto é conversa entre motoboys.
  const aceitar = RE_ACEITAR.exec(texto);
  const entregue = RE_ENTREGUE.exec(texto);
  const entregueSemCodigo = !entregue ? RE_ENTREGUE_SEM_CODIGO.exec(texto) : null;
  if (!aceitar && !entregue && !entregueSemCodigo) return { acao: "ignorada" };

  // 3) Identifica o motoboy pelo telefone do remetente. Não cadastrado/inativo/
  //    de outra distribuidora → ignorar sem responder (não poluir o grupo).
  const telefone = participantPhone.replace(/\D/g, "");
  if (!telefone) return { acao: "sem-participante" };
  const { data: motoboy } = await admin
    .from("motoboys")
    .select("id, nome, telefone, distribuidora_id, ativo")
    .eq("org_id", orgId)
    .eq("telefone", telefone)
    .maybeSingle();
  if (!motoboy || !motoboy.ativo || motoboy.distribuidora_id !== dist.id) {
    console.log("[yapa:grupo] motoboy não habilitado", { telefone: telefone.slice(-4), grupo: dist.nome });
    return { acao: "motoboy-nao-habilitado" };
  }

  if (aceitar) {
    const numeroCorrida = Number.parseInt(aceitar[1], 10);

    // 4) CLAIM ATÔMICO — UPDATE condicional único; o RETURNING decide o vencedor.
    const { data: ganhou, error: errClaim } = await admin
      .from("pedidos")
      .update({ motoboy_id: motoboy.id, status_entrega: "atribuido" })
      .eq("org_id", orgId)
      .eq("distribuidora_id", dist.id)
      .eq("numero_corrida", numeroCorrida)
      .is("motoboy_id", null)
      .eq("status_entrega", "aguardando_motoboy")
      .select("id, numero, cliente_id, endereco_entrega, latitude, longitude, valor_total_gs, taxa_entrega_gs, forma_pagamento")
      .maybeSingle();
    if (errClaim) {
      console.error("[yapa:grupo] claim falhou:", errClaim.message);
      return { acao: "erro-claim" };
    }

    if (!ganhou) {
      // Corrida já tomada (ou número inexistente p/ este hub). DM discreto só se
      // a corrida existe — número errado é ignorado em silêncio.
      const { data: existe } = await admin
        .from("pedidos")
        .select("id")
        .eq("org_id", orgId)
        .eq("distribuidora_id", dist.id)
        .eq("numero_corrida", numeroCorrida)
        .maybeSingle();
      if (existe) {
        try { await enviarTexto(motoboy.telefone, MSG_CORRIDA_JA_ACEITA, zapiCfg); } catch { /* não-bloqueante */ }
      }
      return { acao: "corrida-ja-aceita" };
    }

    // 5) Vencedor: anuncia no grupo (só o nome) + DM com os dados completos.
    const { data: cliente } = ganhou.cliente_id
      ? await admin.from("clientes").select("nome, telefone").eq("id", ganhou.cliente_id).maybeSingle()
      : { data: null };

    const ehDinheiro = ganhou.forma_pagamento === "dinheiro";
    const cobrar = ehDinheiro
      ? Number(ganhou.valor_total_gs) + (ganhou.taxa_entrega_gs != null ? Number(ganhou.taxa_entrega_gs) : 0)
      : null;

    const dm = msgDmVencedor({
      numeroCorrida,
      clienteNome: cliente?.nome ?? null,
      clienteTelefone: cliente?.telefone ?? null,
      endereco: ganhou.endereco_entrega,
      latitude: ganhou.latitude != null ? Number(ganhou.latitude) : null,
      longitude: ganhou.longitude != null ? Number(ganhou.longitude) : null,
      cobrarGs: cobrar,
    });

    const envios = await Promise.allSettled([
      notificarGrupoMotoboys(grupoPhone, msgCorridaAceitaGrupo(numeroCorrida, motoboy.nome), zapiCfg),
      enviarTexto(motoboy.telefone, dm, zapiCfg),
    ]);
    for (const e of envios) {
      if (e.status === "rejected" || !e.value.ok) console.error("[yapa:grupo] envio pós-claim falhou:", e.status === "fulfilled" ? e.value.error : e.reason);
    }
    console.log("[yapa:grupo] corrida atribuída", { corrida: numeroCorrida, motoboy: motoboy.nome, hub: dist.nome });
    return { acao: "corrida-atribuida" };
  }

  // "E <n>" sem código: se a corrida é mesmo dele, lembra de pedir o código ao
  // cliente. Se não for dele, silêncio total (não confirma nem existência da corrida).
  if (entregueSemCodigo) {
    const numeroCorrida = Number.parseInt(entregueSemCodigo[1], 10);
    const { data: minha } = await admin
      .from("pedidos")
      .select("id")
      .eq("org_id", orgId)
      .eq("distribuidora_id", dist.id)
      .eq("numero_corrida", numeroCorrida)
      .eq("motoboy_id", motoboy.id)
      .in("status_entrega", ["atribuido", "em_rota"])
      .maybeSingle();
    if (!minha) return { acao: "ignorada" };
    try { await enviarTexto(motoboy.telefone, msgDmCodigoObrigatorio(numeroCorrida), zapiCfg); } catch { /* não-bloqueante */ }
    return { acao: "codigo-obrigatorio" };
  }

  // "E <n> <código>" — só o motoboy atribuído E com o código correto confirma.
  // O código vem do cliente (msgCodigoEntregaCliente), nunca do próprio motoboy:
  // prova que ele chegou à porta, não só que "diz" ter entregado.
  const numeroCorrida = Number.parseInt(entregue![1], 10);
  const codigoDigitado = entregue![2];
  const { data: finalizado, error: errEntrega } = await admin
    .from("pedidos")
    .update({ status_entrega: "entregue", status: "entregue" })
    .eq("org_id", orgId)
    .eq("distribuidora_id", dist.id)
    .eq("numero_corrida", numeroCorrida)
    .eq("motoboy_id", motoboy.id)
    .eq("codigo_validacao", codigoDigitado)
    .in("status_entrega", ["atribuido", "em_rota"])
    .select("id, numero, cliente_id")
    .maybeSingle();
  if (errEntrega) {
    console.error("[yapa:grupo] confirmação de entrega falhou:", errEntrega.message);
    return { acao: "erro-entrega" };
  }
  if (!finalizado) {
    // Diagnóstico só para quem tem a corrida de fato: código errado → pede de
    // novo. Corrida de outro motoboy/inexistente/já entregue → silêncio total.
    const { data: minha } = await admin
      .from("pedidos")
      .select("id")
      .eq("org_id", orgId)
      .eq("distribuidora_id", dist.id)
      .eq("numero_corrida", numeroCorrida)
      .eq("motoboy_id", motoboy.id)
      .in("status_entrega", ["atribuido", "em_rota"])
      .maybeSingle();
    if (minha) {
      try { await enviarTexto(motoboy.telefone, msgDmCodigoInvalido(numeroCorrida), zapiCfg); } catch { /* não-bloqueante */ }
      return { acao: "codigo-invalido" };
    }
    return { acao: "entrega-nao-autorizada" };
  }

  const { data: cliente } = finalizado.cliente_id
    ? await admin.from("clientes").select("telefone").eq("id", finalizado.cliente_id).maybeSingle()
    : { data: null };
  const envios = await Promise.allSettled([
    enviarTexto(motoboy.telefone, msgDmEntregaConfirmada(numeroCorrida), zapiCfg),
    cliente?.telefone
      ? enviarTexto(cliente.telefone, msgClienteEntregue(finalizado.numero), zapiCfg)
      : Promise.resolve({ ok: true as const }),
  ]);
  for (const e of envios) {
    if (e.status === "rejected" || !e.value.ok) console.error("[yapa:grupo] envio pós-entrega falhou:", e.status === "fulfilled" ? ("error" in e.value ? e.value.error : "") : e.reason);
  }
  console.log("[yapa:grupo] entrega confirmada", { corrida: numeroCorrida, pedido: finalizado.numero, motoboy: motoboy.nome });
  return { acao: "entrega-confirmada" };
}
