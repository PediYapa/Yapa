import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToken, isErrorResponse } from "@/lib/auth/require-token";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/v1/pedidos — lista pedidos da org do token (scope pedidos:read). */
export async function GET(request: Request) {
  const auth = await requireToken(request, "pedidos:read");
  if (isErrorResponse(auth)) return auth;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

  const admin = createAdminClient();
  let q = admin
    .from("pedidos")
    .select("*")
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status as never);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

const itemSchema = z.object({
  descricao: z.string().min(1),
  quantidade: z.number().positive().default(1),
  preco_unit_gs: z.number().nonnegative().default(0),
});
const criarSchema = z.object({
  telefone: z.string().min(6),
  nome: z.string().optional(),
  endereco_entrega: z.string().optional(),
  referencia: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  moeda: z.enum(["GS", "PIX", "BRL"]).default("GS"),
  observacao: z.string().optional(),
  itens: z.array(itemSchema).min(1),
});

/**
 * POST /api/v1/pedidos — cria um pedido (scope pedidos:write).
 * Usado pelo bot do WhatsApp (via Make/Z-API) após interpretar a conversa.
 */
export async function POST(request: Request) {
  const auth = await requireToken(request, "pedidos:write");
  if (isErrorResponse(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = criarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", detalhes: parsed.error.flatten() }, { status: 422 });
  }
  const p = parsed.data;
  const admin = createAdminClient();

  // upsert cliente por (org_id, telefone)
  const { data: existente } = await admin
    .from("clientes")
    .select("id")
    .eq("org_id", auth.orgId)
    .eq("telefone", p.telefone)
    .is("deleted_at", null)
    .maybeSingle();

  let clienteId = existente?.id ?? null;
  if (!clienteId) {
    const { data: novo, error: errCli } = await admin
      .from("clientes")
      .insert({
        org_id: auth.orgId,
        telefone: p.telefone,
        nome: p.nome ?? null,
        endereco: p.endereco_entrega ?? null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
      })
      .select("id")
      .single();
    if (errCli) return NextResponse.json({ error: errCli.message }, { status: 500 });
    clienteId = novo.id;
  }

  const valorTotal = p.itens.reduce((s, it) => s + it.quantidade * it.preco_unit_gs, 0);

  const { data: pedido, error: errPed } = await admin
    .from("pedidos")
    .insert({
      org_id: auth.orgId,
      cliente_id: clienteId,
      status: "recebido",
      canal: "whatsapp",
      moeda: p.moeda,
      valor_total_gs: valorTotal,
      endereco_entrega: p.endereco_entrega ?? null,
      referencia: p.referencia ?? null,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      observacao: p.observacao ?? null,
    })
    .select("*")
    .single();
  if (errPed) return NextResponse.json({ error: errPed.message }, { status: 500 });

  const itens = p.itens.map((it) => ({
    org_id: auth.orgId,
    pedido_id: pedido.id,
    descricao: it.descricao,
    quantidade: it.quantidade,
    preco_unit_gs: it.preco_unit_gs,
    subtotal_gs: it.quantidade * it.preco_unit_gs,
  }));
  const { error: errItens } = await admin.from("pedido_itens").insert(itens);
  if (errItens) return NextResponse.json({ error: errItens.message }, { status: 500 });

  return NextResponse.json({ data: pedido }, { status: 201 });
}
