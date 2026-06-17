import { Wallet, ShoppingBag, CircleDollarSign, TrendingUp } from "lucide-react";
import { guard } from "@/lib/auth/guard";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gs, dataBR, num } from "@/lib/format";
import { PEDIDO_STATUS_META } from "@/lib/intel/status";
import type { PedidoRow, PedidoStatus, DistribuidoraRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/** Status considerados "faturados" para somar faturamento. */
const FATURADOS: PedidoStatus[] = ["pago", "roteado", "em_separacao", "despachado", "em_entrega", "entregue"];

function ultimosDias(n: number): string[] {
  const out: string[] = [];
  const hoje = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default async function RelatoriosPage() {
  const { supabase } = await guard("relatorios", "read");

  const [{ data: pedidos }, { data: distribuidoras }] = await Promise.all([
    supabase.from("pedidos").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("distribuidoras").select("id,nome").is("deleted_at", null),
  ]);

  const lista = (pedidos ?? []) as PedidoRow[];
  const distNome = new Map(
    ((distribuidoras ?? []) as Pick<DistribuidoraRow, "id" | "nome">[]).map((d) => [d.id, d.nome]),
  );

  // Pedidos por status
  const porStatus = new Map<PedidoStatus, number>();
  for (const p of lista) porStatus.set(p.status, (porStatus.get(p.status) ?? 0) + 1);
  const statusRows = (Object.keys(PEDIDO_STATUS_META) as PedidoStatus[])
    .map((s) => ({ status: s, total: porStatus.get(s) ?? 0 }))
    .filter((r) => r.total > 0);

  // Faturamento e ticket médio (apenas pedidos faturados)
  const faturados = lista.filter((p) => FATURADOS.includes(p.status));
  const faturamentoGs = faturados.reduce((s, p) => s + (p.valor_total_gs ?? 0), 0);
  const ticketMedioGs = faturados.length > 0 ? Math.round(faturamentoGs / faturados.length) : 0;

  // Top 5 distribuidoras por nº de pedidos
  const porDistribuidora = new Map<string, number>();
  for (const p of lista) {
    if (!p.distribuidora_id) continue;
    porDistribuidora.set(p.distribuidora_id, (porDistribuidora.get(p.distribuidora_id) ?? 0) + 1);
  }
  const topDistribuidoras = [...porDistribuidora.entries()]
    .map(([id, total]) => ({ id, nome: distNome.get(id) ?? "—", total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Pedidos por dia (últimos 7)
  const dias = ultimosDias(7);
  const porDia = new Map<string, number>();
  for (const p of lista) {
    const d = (p.created_at ?? "").slice(0, 10);
    if (porDia.has(d) || dias.includes(d)) porDia.set(d, (porDia.get(d) ?? 0) + 1);
  }
  const serieDias = dias.map((d) => ({ dia: d, total: porDia.get(d) ?? 0 }));

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" description="Visão consolidada de pedidos e faturamento." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total de pedidos" value={num(lista.length, 0)} icon={<ShoppingBag />} hint="histórico completo" />
        <StatCard label="Faturamento" value={gs(faturamentoGs)} icon={<Wallet />} hint="pedidos faturados" />
        <StatCard label="Ticket médio" value={gs(ticketMedioGs)} icon={<CircleDollarSign />} hint="por pedido faturado" />
        <StatCard label="Faturados" value={num(faturados.length, 0)} icon={<TrendingUp />} hint="pagos em diante" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pedidos por status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusRows.length === 0 ? (
              <EmptyState icon={<ShoppingBag />} title="Sem dados" description="Ainda não há pedidos registrados." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statusRows.map((r) => {
                    const meta = PEDIDO_STATUS_META[r.status];
                    return (
                      <TableRow key={r.status}>
                        <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 distribuidoras</CardTitle>
          </CardHeader>
          <CardContent>
            {topDistribuidoras.length === 0 ? (
              <EmptyState icon={<ShoppingBag />} title="Sem dados" description="Pedidos ainda não foram roteados a distribuidoras." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Distribuidora</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDistribuidoras.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos por dia — últimos 7 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dia</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serieDias.map((r) => (
                <TableRow key={r.dia}>
                  <TableCell>{dataBR(r.dia)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
