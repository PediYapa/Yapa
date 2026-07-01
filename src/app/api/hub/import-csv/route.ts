import { NextResponse } from "next/server";
import { guardHub } from "@/lib/auth/hub-guard";
import { casarLoteWip, type LinhaSuja } from "@/lib/hub/wip-matcher";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // a IA pode levar alguns segundos em lotes grandes

const MAX_LINHAS = 500;

/**
 * POST /api/hub/import-csv — importação em massa de estoque via CSV + IA.
 *
 * Recebe linhas sujas [{ nome_sujo, qtd }] já parseadas no cliente. Casa cada
 * uma com o catálogo mestre (OpenAI gpt-4o-mini em lote) e faz UPSERT em
 * estoque_hub — política de duplicidade: SOBRESCREVER (reflete a contagem real
 * da planilha). Isolamento por sessão + RLS. Preço nunca trafega.
 */
export async function POST(request: Request) {
  let body: { linhas?: LinhaSuja[]; hub?: string };
  try {
    body = (await request.json()) as { linhas?: LinhaSuja[]; hub?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const linhas = (Array.isArray(body.linhas) ? body.linhas : [])
    .filter((l) => l && typeof l.nome_sujo === "string" && l.nome_sujo.trim())
    .slice(0, MAX_LINHAS);
  if (linhas.length === 0) {
    return NextResponse.json({ error: "Planilha vazia ou sem coluna de produto reconhecível." }, { status: 400 });
  }

  const { supabase, profile, distribuidoraId } = await guardHub(body.hub ?? null);
  if (!distribuidoraId) {
    return NextResponse.json({ error: "Hub não definido para esta conta." }, { status: 400 });
  }

  // Catálogo mestre — só id + nome (sem preço).
  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome")
    .eq("org_id", profile.org_id)
    .eq("disponivel", true)
    .is("deleted_at", null);

  const matches = await casarLoteWip(linhas, produtos ?? []);
  if (matches.length === 0) {
    return NextResponse.json({ ok: true, atualizados: 0, naoReconhecidos: linhas.length, itens: [] });
  }

  // UPSERT (overwrite) — a RLS garante que só grava na própria distribuidora.
  const registros = matches.map((m) => ({
    org_id: profile.org_id,
    distribuidora_id: distribuidoraId,
    produto_id: m.produto_id,
    quantidade: m.quantidade,
    updated_at: new Date().toISOString(),
  }));
  const { data: gravados, error } = await supabase
    .from("estoque_hub")
    .upsert(registros, { onConflict: "distribuidora_id,produto_id", ignoreDuplicates: false })
    .select("id, produto_id, quantidade");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nomePorId = new Map(matches.map((m) => [m.produto_id, m.nome]));
  const itens = (gravados ?? []).map((g) => ({
    id: g.id,
    produto_id: g.produto_id,
    nome: nomePorId.get(g.produto_id) ?? "—",
    quantidade: g.quantidade,
  }));

  return NextResponse.json({
    ok: true,
    atualizados: itens.length,
    naoReconhecidos: linhas.length - matches.length,
    itens,
  });
}
