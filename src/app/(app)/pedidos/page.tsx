import Link from "next/link";
import { ShoppingBag, Hourglass, PackageCheck } from "lucide-react";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import type { ClienteRow, DistribuidoraRow, ProdutoRow, PedidoStatus } from "@/lib/database.types";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gs, dataHoraBR } from "@/lib/format";
import { PEDIDO_STATUS_META } from "@/lib/intel/status";
import { cn } from "@/lib/cn";
import { NovoPedidoButton, AprovarPagamentoButton } from "./pedidos-client";

export const dynamic = "force-dynamic";

const ABERTOS: PedidoStatus[] = [
  "recebido", "aguardando_pagamento", "pago", "roteado", "em_separacao", "despachado", "em_entrega",
];

const FILTROS: { key: string; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "recebido", label: "Recebidos" },
  { key: "aguardando_pagamento", label: "Aguardando pagamento" },
  { key: "pago", label: "Pagos" },
  { key: "roteado", label: "Roteados" },
  { key: "em_entrega", label: "Em entrega" },
  { key: "entregue", label: "Entregues" },
  { key: "quebra", label: "Quebras" },
  { key: "cancelado", label: "Cancelados" },
];

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { supabase, profile } = await guard("pedidos", "read");
  const { status: filtro } = await searchParams;
  const canWrite = can(profile, "pedidos", "write");

  const { data: pedidosData } = await supabase
    .from("pedidos")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const pedidos = pedidosData ?? [];

  const clienteIds = [...new Set(pedidos.map((p) => p.cliente_id).filter((v): v is string => !!v))];
  const { data: clientesData } = clienteIds.length
    ? await supabase.from("clientes").select("*").in("id", clienteIds)
    : { data: [] as ClienteRow[] };
  const clientesMap = new Map((clientesData ?? []).map((c) => [c.id, c]));

  const { data: distribuidorasData } = await supabase
    .from("distribuidoras")
    .select("*")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  const distribuidoras = (distribuidorasData ?? []) as DistribuidoraRow[];
  const distMap = new Map(distribuidoras.map((d) => [d.id, d]));

  const { data: produtosData } = await supabase
    .from("produtos")
    .select("*")
    .eq("disponivel", true)
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  const produtos = (produtosData ?? []) as ProdutoRow[];

  // KPIs
  const hojeISO = new Date().toISOString().slice(0, 10);
  const totalAbertos = pedidos.filter((p) => ABERTOS.includes(p.status)).length;
  const aguardandoPagamento = pedidos.filter((p) => p.status === "aguardando_pagamento").length;
  const entreguesHoje = pedidos.filter(
    (p) => p.status === "entregue" && p.updated_at.slice(0, 10) === hojeISO,
  ).length;

  const filtroAtivo = filtro && FILTROS.some((f) => f.key === filtro) ? filtro : "todos";
  const lista = filtroAtivo === "todos" ? pedidos : pedidos.filter((p) => p.status === filtroAtivo);

  return (
    <div>
      <PageHeader
        title="Pedidos"
        description="Fluxo central da operação — do recebimento à entrega."
        action={
          canWrite ? (
            <NovoPedidoButton clientes={clientesData ?? []} distribuidoras={distribuidoras} produtos={produtos} />
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pedidos abertos" value={totalAbertos} icon={<ShoppingBag />} hint="em andamento agora" />
        <StatCard label="Aguardando pagamento" value={aguardandoPagamento} icon={<Hourglass />} />
        <StatCard label="Entregues hoje" value={entreguesHoje} icon={<PackageCheck />} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "todos" ? "/pedidos" : `/pedidos?status=${f.key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filtroAtivo === f.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag />}
          title="Nenhum pedido"
          description="Os pedidos aparecem aqui conforme chegam pelo WhatsApp, ou crie um manualmente."
          action={
            canWrite ? (
              <NovoPedidoButton clientes={clientesData ?? []} distribuidoras={distribuidoras} produtos={produtos} />
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Distribuidora</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((p) => {
                const meta = PEDIDO_STATUS_META[p.status];
                const cliente = p.cliente_id ? clientesMap.get(p.cliente_id) : undefined;
                const dist = p.distribuidora_id ? distMap.get(p.distribuidora_id) : undefined;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/pedidos/${p.id}`} className="hover:underline">#{p.numero}</Link>
                    </TableCell>
                    <TableCell>{cliente?.nome ?? cliente?.telefone ?? "—"}</TableCell>
                    <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                    <TableCell>{dist?.nome ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{gs(p.valor_total_gs)}</TableCell>
                    <TableCell>{dataHoraBR(p.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {canWrite && p.status === "aguardando_pagamento" && (
                        <AprovarPagamentoButton pedidoId={p.id} temDistribuidora={!!p.distribuidora_id} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
