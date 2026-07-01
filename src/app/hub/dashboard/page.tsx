import Link from "next/link";
import { Boxes, TriangleAlert, Store, ChevronLeft } from "lucide-react";
import { guardHub } from "@/lib/auth/hub-guard";
import { EstoqueClient, type ItemEstoque } from "./estoque-client";

export const dynamic = "force-dynamic";

/** Limite de "estoque baixo" — abaixo disso, dispara o alerta de volume. */
const LIMITE_BAIXO = 15;

export default async function HubDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ hub?: string }>;
}) {
  const { hub } = await searchParams;
  const { supabase, profile, distribuidoraId, isAdmin } = await guardHub(hub ?? null);

  // Admin em modo supervisão sem hub escolhido → seletor de hub.
  if (!distribuidoraId) {
    if (isAdmin) {
      const { data: hubs } = await supabase
        .from("distribuidoras")
        .select("id, nome, tipo")
        .eq("org_id", profile.org_id)
        .is("deleted_at", null)
        .order("nome");
      return (
        <div>
          <h1 className="text-2xl font-bold">Supervisão de Hubs</h1>
          <p className="mt-1 text-sm text-neutral-400">Selecione um hub para gerenciar o estoque.</p>
          <div className="mt-5 grid gap-3">
            {(hubs ?? []).map((h) => (
              <Link
                key={h.id}
                href={`/hub/dashboard?hub=${h.id}`}
                className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 transition-colors hover:border-[#FFCC00]/60"
              >
                <Store className="size-5 text-[#FFCC00]" />
                <span className="font-medium">{h.nome}</span>
                {h.tipo && <span className="ml-auto text-xs text-neutral-500">{h.tipo}</span>}
              </Link>
            ))}
            {(hubs ?? []).length === 0 && (
              <p className="text-sm text-neutral-500">Nenhum hub cadastrado.</p>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center">
        <p className="font-medium">Sua conta ainda não está vinculada a um hub.</p>
        <p className="mt-1 text-sm text-neutral-400">Fale com o Admin do Yapa para concluir a configuração.</p>
      </div>
    );
  }

  const { data: hubInfo } = await supabase
    .from("distribuidoras")
    .select("nome, tipo")
    .eq("id", distribuidoraId)
    .maybeSingle();

  // Estoque do hub — busca as linhas e resolve só o NOME do produto (jamais o preço).
  const { data: linhas } = await supabase
    .from("estoque_hub")
    .select("id, quantidade, produto_id")
    .eq("distribuidora_id", distribuidoraId)
    .order("created_at", { ascending: true });

  const produtoIds = [...new Set((linhas ?? []).map((l) => l.produto_id))];
  const { data: prods } = produtoIds.length
    ? await supabase.from("produtos").select("id, nome").in("id", produtoIds)
    : { data: [] as { id: string; nome: string }[] };
  const nomeMap = new Map((prods ?? []).map((p) => [p.id, p.nome]));

  const itens: ItemEstoque[] = (linhas ?? []).map((l) => ({
    id: l.id,
    produto_id: l.produto_id,
    nome: nomeMap.get(l.produto_id) ?? "—",
    quantidade: l.quantidade,
  }));

  const totalItens = itens.length;
  const baixos = itens.filter((i) => i.quantidade < LIMITE_BAIXO).length;

  return (
    <div>
      {isAdmin && (
        <Link
          href="/hub/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-[#FFCC00]"
        >
          <ChevronLeft className="size-4" />
          Trocar hub
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{hubInfo?.nome ?? "Meu Estoque"}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {hubInfo?.tipo ? `Hub ${hubInfo.tipo} · ` : ""}Informe o volume físico das suas caixas.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Kpi icon={<Boxes />} label="Itens cadastrados" valor={totalItens} />
        <Kpi
          icon={<TriangleAlert />}
          label={`Estoque baixo (< ${LIMITE_BAIXO})`}
          valor={baixos}
          alerta={baixos > 0}
        />
      </div>

      <EstoqueClient
        distribuidoraId={distribuidoraId}
        itens={itens}
        limiteBaixo={LIMITE_BAIXO}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  valor,
  alerta,
}: {
  icon: React.ReactNode;
  label: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-400">{label}</p>
        <span className={alerta ? "text-red-400 [&_svg]:size-4" : "text-[#FFCC00] [&_svg]:size-4"}>{icon}</span>
      </div>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${alerta ? "text-red-400" : "text-neutral-100"}`}>
        {valor}
      </p>
    </div>
  );
}
