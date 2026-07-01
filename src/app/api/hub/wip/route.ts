import { NextResponse } from "next/server";
import { guardHub } from "@/lib/auth/hub-guard";
import { casarProdutoWip } from "@/lib/hub/wip-matcher";

export const dynamic = "force-dynamic";

/**
 * POST /api/hub/wip — Motor "WIP" (filtro AI de entrada de produtos).
 *
 * Recebe a string suja digitada pelo hub, casa com o catálogo mestre (OpenAI
 * gpt-4o-mini) e cria a linha em estoque_hub com quantidade 0, pronta para o
 * parceiro preencher. Isolamento por sessão + RLS. Preço nunca trafega.
 */
export async function POST(request: Request) {
  let body: { texto?: string; hub?: string };
  try {
    body = (await request.json()) as { texto?: string; hub?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ error: "Digite o nome do produto." }, { status: 400 });

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

  const match = await casarProdutoWip(texto, produtos ?? []);
  if (!match) {
    return NextResponse.json(
      { error: `Não encontrei "${texto}" no catálogo Yapa. Fale com o Admin para cadastrá-lo.` },
      { status: 404 },
    );
  }

  // Cria (ou reaproveita) a linha de estoque com quantidade 0.
  const { data: novo, error } = await supabase
    .from("estoque_hub")
    .upsert(
      { org_id: profile.org_id, distribuidora_id: distribuidoraId, produto_id: match.id, quantidade: 0 },
      { onConflict: "distribuidora_id,produto_id", ignoreDuplicates: false },
    )
    .select("id, quantidade")
    .single();

  if (error || !novo) {
    return NextResponse.json({ error: error?.message ?? "Falha ao salvar." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    item: { id: novo.id, produto_id: match.id, nome: match.nome, quantidade: novo.quantidade },
  });
}
