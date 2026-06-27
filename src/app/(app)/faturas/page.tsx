import { FileText } from "lucide-react";
import { guard } from "@/lib/auth/guard";
import type { ClienteRow } from "@/lib/database.types";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gs, dataHoraBR } from "@/lib/format";
import { ExportarFaturasCSV, type FaturaCSVRow } from "./faturas-client";

export const dynamic = "force-dynamic";

/**
 * Fechamento de Faturas — pedidos com `precisa_fatura = true` (Factura Legal).
 * Tela para a contabilidade: Nome · RUC/CI · Itens · Valor · Data + Exportar CSV.
 */
export default async function FaturasPage() {
  const { supabase, profile } = await guard("financeiro", "read");

  const { data: pedidosData } = await supabase
    .from("pedidos")
    .select("*")
    .eq("org_id", profile.org_id)
    .eq("precisa_fatura", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const pedidos = pedidosData ?? [];

  const clienteIds = [...new Set(pedidos.map((p) => p.cliente_id).filter((v): v is string => !!v))];
  const { data: clientesData } = clienteIds.length
    ? await supabase.from("clientes").select("id, nome, telefone").in("id", clienteIds)
    : { data: [] as Pick<ClienteRow, "id" | "nome" | "telefone">[] };
  const clientesMap = new Map((clientesData ?? []).map((c) => [c.id, c]));

  const pedidoIds = pedidos.map((p) => p.id);
  const { data: itensData } = pedidoIds.length
    ? await supabase.from("pedido_itens").select("pedido_id, descricao, quantidade").in("pedido_id", pedidoIds)
    : { data: [] as { pedido_id: string; descricao: string; quantidade: number }[] };
  const itensPorPedido = new Map<string, string[]>();
  for (const it of itensData ?? []) {
    const arr = itensPorPedido.get(it.pedido_id) ?? [];
    arr.push(`${it.quantidade}x ${it.descricao}`);
    itensPorPedido.set(it.pedido_id, arr);
  }

  const linhas: FaturaCSVRow[] = pedidos.map((p) => {
    const cli = p.cliente_id ? clientesMap.get(p.cliente_id) : undefined;
    return {
      numero: p.numero,
      nome: cli?.nome ?? cli?.telefone ?? "—",
      ruc: p.documento_ruc ?? "",
      itens: (itensPorPedido.get(p.id) ?? []).join(", "),
      valor: p.valor_total_gs,
      data: dataHoraBR(p.created_at),
    };
  });

  const totalFaturado = pedidos.reduce((s, p) => s + p.valor_total_gs, 0);

  return (
    <div>
      <PageHeader
        title="Fechamento de Faturas"
        description="Pedidos que solicitaram Factura Legal — pronto para a contabilidade."
        action={<ExportarFaturasCSV linhas={linhas} />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Faturas a emitir" value={pedidos.length} icon={<FileText />} />
        <StatCard label="Total faturado" value={gs(totalFaturado)} icon={<FileText />} />
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Nenhuma fatura pendente"
          description="Pedidos com pedido de Factura Legal aparecem aqui automaticamente."
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>RUC/CI</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.numero}>
                  <TableCell className="font-medium">#{l.numero}</TableCell>
                  <TableCell>{l.nome}</TableCell>
                  <TableCell className="tabular-nums">{l.ruc || <span className="text-amber-600">a informar</span>}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground" title={l.itens}>{l.itens || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{gs(l.valor)}</TableCell>
                  <TableCell>{l.data}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
