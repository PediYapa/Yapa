import { Wallet, Hourglass, Coins } from "lucide-react";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gs, dataHoraBR } from "@/lib/format";
import { PAGAMENTO_STATUS_META } from "@/lib/intel/status";
import type { PagamentoRow, FormaPagamento, DistribuidoraRow } from "@/lib/database.types";
import { FinanceiroClient, type DistribuidoraSaldo } from "./financeiro-client";

export const dynamic = "force-dynamic";

const PROVEDOR_LABEL: Record<FormaPagamento, string> = {
  dlocal: "DLocal",
  pix: "Pix",
  dinheiro: "Dinheiro",
};

export default async function FinanceiroPage() {
  const { supabase, profile } = await guard("financeiro", "read");
  const hojeISO = new Date().toISOString().slice(0, 10);

  const [{ data: pagamentos }, { data: distribuidoras }] = await Promise.all([
    supabase.from("pagamentos").select("*").order("created_at", { ascending: false }),
    supabase
      .from("distribuidoras")
      .select("id,nome,saldo_d1_gs,recebe_dinheiro")
      .is("deleted_at", null),
  ]);

  const listaPag = (pagamentos ?? []) as PagamentoRow[];
  const listaDist = (distribuidoras ?? []) as Pick<
    DistribuidoraRow,
    "id" | "nome" | "saldo_d1_gs" | "recebe_dinheiro"
  >[];

  const recebidoHojeGs = listaPag
    .filter((p) => p.status === "pago" && (p.created_at ?? "").slice(0, 10) === hojeISO)
    .reduce((s, p) => s + (p.valor_gs ?? 0), 0);

  const pendenteGs = listaPag
    .filter((p) => p.status === "pendente")
    .reduce((s, p) => s + (p.valor_gs ?? 0), 0);

  const distComSaldo: DistribuidoraSaldo[] = listaDist
    .filter((d) => (d.saldo_d1_gs ?? 0) > 0)
    .map((d) => ({ id: d.id, nome: d.nome, saldo_d1_gs: d.saldo_d1_gs }));

  const emDinheiroAbaterGs = distComSaldo.reduce((s, d) => s + (d.saldo_d1_gs ?? 0), 0);

  const canWrite = can(profile, "financeiro", "write");

  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" description="Recebimentos, pendências e acerto de dinheiro D+1." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Recebido hoje" value={gs(recebidoHojeGs)} icon={<Wallet />} hint="pagamentos confirmados" />
        <StatCard label="Pendente" value={gs(pendenteGs)} icon={<Hourglass />} hint="aguardando confirmação" />
        <StatCard label="Dinheiro a abater" value={gs(emDinheiroAbaterGs)} icon={<Coins />} hint="saldo D+1 nas distribuidoras" />
      </div>

      <FinanceiroClient distribuidoras={distComSaldo} canWrite={canWrite} />

      <Card>
        <CardHeader>
          <CardTitle>Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {listaPag.length === 0 ? (
            <EmptyState
              icon={<Wallet />}
              title="Sem pagamentos"
              description="Os pagamentos dos pedidos aparecem aqui conforme são gerados."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Provedor</TableHead>
                  <TableHead>Moeda</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listaPag.map((p) => {
                  const meta = PAGAMENTO_STATUS_META[p.status];
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.referencia_externa ?? `#${p.pedido_id.slice(0, 8)}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{PROVEDOR_LABEL[p.provedor]}</Badge>
                      </TableCell>
                      <TableCell>{p.moeda}</TableCell>
                      <TableCell className="text-right tabular-nums">{gs(p.valor_gs)}</TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell>{dataHoraBR(p.created_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
