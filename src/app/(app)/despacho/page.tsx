import Link from "next/link";
import { Bike, Hourglass, PackageCheck } from "lucide-react";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import type { PedidoRow, EntregadorRow, EntregaStatus } from "@/lib/database.types";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dataHoraBR } from "@/lib/format";
import { ENTREGA_STATUS_META } from "@/lib/intel/status";
import { cn } from "@/lib/cn";
import { DespachoClient } from "./despacho-client";

export const dynamic = "force-dynamic";

const FILTROS: { key: string; label: string }[] = [
  { key: "todos", label: "Todas" },
  { key: "aguardando", label: "Aguardando motorista" },
  { key: "coletado", label: "Coletadas" },
  { key: "em_entrega", label: "Em entrega" },
  { key: "entregue", label: "Entregues" },
  { key: "cancelada", label: "Canceladas" },
];

export default async function DespachoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { supabase, profile } = await guard("despacho", "read");
  const { status: filtro } = await searchParams;
  const canWrite = can(profile, "despacho", "write");

  const { data: entregasData } = await supabase
    .from("entregas")
    .select("*")
    .order("created_at", { ascending: false });
  const entregas = entregasData ?? [];

  // Pedidos relacionados (numero, endereço, código, cliente).
  const pedidoIds = [...new Set(entregas.map((e) => e.pedido_id).filter((v): v is string => !!v))];
  const { data: pedidosData } = pedidoIds.length
    ? await supabase
        .from("pedidos")
        .select("id, numero, endereco_entrega, codigo_validacao, cliente_id")
        .in("id", pedidoIds)
    : { data: [] as Pick<PedidoRow, "id" | "numero" | "endereco_entrega" | "codigo_validacao" | "cliente_id">[] };
  const pedidosMap = new Map((pedidosData ?? []).map((p) => [p.id, p]));

  // Entregadores ativos para atribuição.
  const { data: entregadoresData } = await supabase
    .from("entregadores")
    .select("id, nome, telefone, ativo")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  const entregadores = (entregadoresData ?? []) as Pick<EntregadorRow, "id" | "nome" | "telefone" | "ativo">[];
  const entregadoresMap = new Map(entregadores.map((e) => [e.id, e]));

  // KPIs
  const hojeISO = new Date().toISOString().slice(0, 10);
  const aguardandoMotorista = entregas.filter((e) => e.status === "aguardando").length;
  const emEntrega = entregas.filter((e) => e.status === "em_entrega").length;
  const entreguesHoje = entregas.filter(
    (e) => e.status === "entregue" && (e.horario_entrega_realizado ?? e.updated_at).slice(0, 10) === hojeISO,
  ).length;

  const filtroAtivo = filtro && FILTROS.some((f) => f.key === filtro) ? filtro : "todos";
  const lista =
    filtroAtivo === "todos"
      ? entregas
      : entregas.filter((e) => e.status === (filtroAtivo as EntregaStatus));

  return (
    <div>
      <PageHeader
        title="Despacho"
        description="Atribua entregadores e acompanhe cada entrega até a porta do cliente."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Aguardando motorista" value={aguardandoMotorista} icon={<Hourglass />} hint="prontas para atribuir" />
        <StatCard label="Em entrega" value={emEntrega} icon={<Bike />} hint="a caminho agora" />
        <StatCard label="Entregues hoje" value={entreguesHoje} icon={<PackageCheck />} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "todos" ? "/despacho" : `/despacho?status=${f.key}`}
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
          icon={<Bike />}
          title="Nenhuma entrega"
          description="As entregas aparecem aqui conforme os pedidos avançam para o despacho."
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Entregador</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Despachado</TableHead>
                {canWrite && <TableHead className="w-[320px]">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((e) => {
                const meta = ENTREGA_STATUS_META[e.status];
                const pedido = pedidosMap.get(e.pedido_id);
                const entregador = e.entregador_id ? entregadoresMap.get(e.entregador_id) : undefined;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {pedido ? `#${pedido.numero}` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {pedido?.endereco_entrega ?? "—"}
                    </TableCell>
                    <TableCell>{entregador?.nome ?? "—"}</TableCell>
                    <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                    <TableCell>{dataHoraBR(e.horario_despacho ?? e.created_at)}</TableCell>
                    {canWrite && (
                      <TableCell>
                        <DespachoClient
                          entregaId={e.id}
                          status={e.status}
                          entregadorId={e.entregador_id}
                          entregadores={entregadores}
                        />
                      </TableCell>
                    )}
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
