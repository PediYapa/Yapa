"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, runAction, type ActionResult } from "@/lib/auth/guard";
import type { PedidoStatus, Moeda, FormaPagamento } from "@/lib/database.types";
import { PEDIDO_TRANSICOES, gerarCodigoValidacao } from "@/lib/intel/status";
import { escolherDistribuidora, type DistribuidoraGeo } from "@/lib/intel/roteamento";

const itemSchema = z.object({
  descricao: z.string().trim().min(1).max(200),
  quantidade: z.coerce.number().int().min(1).max(9999),
  preco_unit_gs: z.coerce.number().min(0).max(1_000_000_000),
});

const criarSchema = z.object({
  telefone: z.string().trim().min(6, "Telefone obrigatório").max(20),
  nome: z.string().trim().max(120).optional(),
  endereco_entrega: z.string().trim().max(200).optional(),
  referencia: z.string().trim().max(200).optional(),
  moeda: z.enum(["GS", "PIX", "BRL"]).default("GS"),
  observacao: z.string().trim().max(1000).optional(),
  itens: z.array(itemSchema).min(1, "Adicione ao menos um item"),
});

const formaSchema = z.enum(["dlocal", "pix", "dinheiro"]);

/** Cria um pedido manual: garante o cliente (por telefone), insere pedido + itens. */
export async function criarPedido(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("pedidos", "write");

    const raw = Object.fromEntries(formData) as Record<string, string>;
    const descricoes = formData.getAll("item_descricao").map(String);
    const quantidades = formData.getAll("item_quantidade").map(String);
    const precos = formData.getAll("item_preco").map(String);

    const itens = descricoes
      .map((descricao, i) => ({
        descricao: (descricao ?? "").trim(),
        quantidade: quantidades[i] ?? "",
        preco_unit_gs: precos[i] ?? "",
      }))
      .filter((it) => it.descricao.length > 0);

    const parsed = criarSchema.parse({
      telefone: raw.telefone,
      nome: raw.nome,
      endereco_entrega: raw.endereco_entrega,
      referencia: raw.referencia,
      moeda: raw.moeda || "GS",
      observacao: raw.observacao,
      itens,
    });

    // 1) Cliente: localizar existente por (org_id, telefone) ou criar
    const { data: existente } = await supabase
      .from("clientes")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("telefone", parsed.telefone)
      .is("deleted_at", null)
      .maybeSingle();

    let clienteId: string | null = existente?.id ?? null;
    if (!clienteId) {
      const { data: novo, error: errCliente } = await supabase
        .from("clientes")
        .insert({
          org_id: profile.org_id,
          telefone: parsed.telefone,
          nome: parsed.nome || null,
          endereco: parsed.endereco_entrega || null,
          referencia: parsed.referencia || null,
        })
        .select("id")
        .single();
      if (errCliente) return { ok: false, error: errCliente.message };
      clienteId = novo.id;
    } else if (parsed.nome) {
      await supabase.from("clientes").update({ nome: parsed.nome }).eq("id", clienteId);
    }

    // 2) Itens precificados em GS diretamente → total = soma dos subtotais
    const itensCalc = parsed.itens.map((it) => ({
      descricao: it.descricao,
      quantidade: it.quantidade,
      preco_unit_gs: Math.round(it.preco_unit_gs),
      subtotal_gs: Math.round(it.preco_unit_gs) * it.quantidade,
    }));
    const valorTotalGs = itensCalc.reduce((s, it) => s + it.subtotal_gs, 0);

    // 3) Pedido
    const { data: pedido, error: errPedido } = await supabase
      .from("pedidos")
      .insert({
        org_id: profile.org_id,
        cliente_id: clienteId,
        status: "recebido" as PedidoStatus,
        canal: "manual",
        moeda: parsed.moeda as Moeda,
        valor_total_gs: valorTotalGs,
        endereco_entrega: parsed.endereco_entrega || null,
        referencia: parsed.referencia || null,
        observacao: parsed.observacao || null,
      })
      .select("id")
      .single();
    if (errPedido) return { ok: false, error: errPedido.message };

    // 4) Itens
    const { error: errItens } = await supabase.from("pedido_itens").insert(
      itensCalc.map((it) => ({
        org_id: profile.org_id,
        pedido_id: pedido.id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unit_gs: it.preco_unit_gs,
        subtotal_gs: it.subtotal_gs,
      })),
    );
    if (errItens) return { ok: false, error: errItens.message };

    revalidatePath("/pedidos");
    return { ok: true, id: pedido.id };
  });
}

/** Avança/salta status validando contra PEDIDO_TRANSICOES. Gerencia a entrega. */
export async function mudarStatus(pedidoId: string, novo: PedidoStatus): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("pedidos", "write");

    const { data: pedido, error: errLoad } = await supabase
      .from("pedidos")
      .select("id, status")
      .eq("id", pedidoId)
      .single();
    if (errLoad || !pedido) return { ok: false, error: "Pedido não encontrado." };

    const permitidos = PEDIDO_TRANSICOES[pedido.status];
    if (!permitidos.includes(novo)) {
      return { ok: false, error: `Transição inválida: ${pedido.status} → ${novo}.` };
    }

    const { error } = await supabase.from("pedidos").update({ status: novo }).eq("id", pedidoId);
    if (error) return { ok: false, error: error.message };

    const agora = new Date().toISOString();
    if (novo === "despachado") {
      const { data: entrega } = await supabase
        .from("entregas")
        .select("id")
        .eq("pedido_id", pedidoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (entrega) {
        await supabase
          .from("entregas")
          .update({ status: "aguardando", horario_despacho: agora })
          .eq("id", entrega.id);
      } else {
        await supabase.from("entregas").insert({
          org_id: profile.org_id,
          pedido_id: pedidoId,
          status: "aguardando",
          horario_despacho: agora,
        });
      }
    } else if (novo === "entregue") {
      const { data: entrega } = await supabase
        .from("entregas")
        .select("id")
        .eq("pedido_id", pedidoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (entrega) {
        await supabase
          .from("entregas")
          .update({ status: "entregue", horario_entrega_realizado: agora })
          .eq("id", entrega.id);
      }
    }

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${pedidoId}`);
    return { ok: true, id: pedidoId };
  });
}

/** Roteia automaticamente via escolherDistribuidora (geolocalização). */
export async function rotearPedido(pedidoId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("pedidos", "write");

    const { data: pedido, error: errLoad } = await supabase
      .from("pedidos")
      .select("id, latitude, longitude")
      .eq("id", pedidoId)
      .single();
    if (errLoad || !pedido) return { ok: false, error: "Pedido não encontrado." };

    const { data: distribuidoras } = await supabase
      .from("distribuidoras")
      .select("id, nome, latitude, longitude, raio_km, ativo")
      .eq("ativo", true)
      .is("deleted_at", null);

    const geo: DistribuidoraGeo[] = (distribuidoras ?? []).map((d) => ({
      id: d.id,
      nome: d.nome,
      latitude: d.latitude,
      longitude: d.longitude,
      raio_km: d.raio_km,
      ativo: d.ativo,
    }));

    const resultado = escolherDistribuidora(
      { latitude: pedido.latitude, longitude: pedido.longitude },
      geo,
    );
    if (!resultado) return { ok: false, error: "Nenhuma distribuidora cobre a zona." };

    const { error } = await supabase
      .from("pedidos")
      .update({ distribuidora_id: resultado.distribuidora.id, status: "roteado" })
      .eq("id", pedidoId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${pedidoId}`);
    return { ok: true, id: pedidoId };
  });
}

/** Atribui manualmente uma distribuidora e marca como roteado. */
export async function atribuirDistribuidora(
  pedidoId: string,
  distribuidoraId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("pedidos", "write");
    if (!distribuidoraId) return { ok: false, error: "Selecione uma distribuidora." };

    const { error } = await supabase
      .from("pedidos")
      .update({ distribuidora_id: distribuidoraId, status: "roteado" })
      .eq("id", pedidoId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${pedidoId}`);
    return { ok: true, id: pedidoId };
  });
}

/** Registra pagamento; se em dinheiro, credita o saldo da distribuidora. */
export async function registrarPagamento(
  pedidoId: string,
  forma: FormaPagamento,
  distribuidoraId?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await guard("pedidos", "write");

    const parsedForma = formaSchema.parse(forma);

    const { data: pedido, error: errLoad } = await supabase
      .from("pedidos")
      .select("id, moeda, valor_total_gs")
      .eq("id", pedidoId)
      .single();
    if (errLoad || !pedido) return { ok: false, error: "Pedido não encontrado." };

    if (parsedForma === "dinheiro" && !distribuidoraId) {
      return { ok: false, error: "Selecione a distribuidora que recebeu o dinheiro." };
    }

    const recebidoPor = parsedForma === "dinheiro" ? distribuidoraId ?? null : null;

    const { error: errPag } = await supabase.from("pagamentos").insert({
      org_id: profile.org_id,
      pedido_id: pedidoId,
      provedor: parsedForma,
      moeda: pedido.moeda as Moeda,
      valor: pedido.valor_total_gs,
      valor_gs: pedido.valor_total_gs,
      status: "pago",
      recebido_por_distribuidora_id: recebidoPor,
    });
    if (errPag) return { ok: false, error: errPag.message };

    const { error: errPed } = await supabase
      .from("pedidos")
      .update({ status: "pago", forma_pagamento: parsedForma })
      .eq("id", pedidoId);
    if (errPed) return { ok: false, error: errPed.message };

    if (parsedForma === "dinheiro" && recebidoPor) {
      const { data: dist } = await supabase
        .from("distribuidoras")
        .select("saldo_d1_gs")
        .eq("id", recebidoPor)
        .single();
      const saldoAtual = dist?.saldo_d1_gs ?? 0;
      await supabase
        .from("distribuidoras")
        .update({ saldo_d1_gs: saldoAtual + pedido.valor_total_gs })
        .eq("id", recebidoPor);
    }

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${pedidoId}`);
    return { ok: true, id: pedidoId };
  });
}

/** Gera/regenera o código de validação de entrega (4 dígitos). */
export async function gerarCodigo(pedidoId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await guard("pedidos", "write");
    const { error } = await supabase
      .from("pedidos")
      .update({ codigo_validacao: gerarCodigoValidacao() })
      .eq("id", pedidoId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/pedidos/${pedidoId}`);
    return { ok: true, id: pedidoId };
  });
}
