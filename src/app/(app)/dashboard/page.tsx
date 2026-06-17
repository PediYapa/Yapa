import Link from "next/link";
import { ShoppingBag, Wallet, Bike, CircleDollarSign, PackageCheck, AlertTriangle, Hourglass, TrendingUp } from "lucide-react";
import { guard } from "@/lib/auth/guard";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { gs, pct, dataHoraBR } from "@/lib/format";
import { calcularKpis, serieDiaria } from "@/lib/intel/metrics";
import { PEDIDO_STATUS_META } from "@/lib/intel/status";
import { DashboardChart } from "./dashboard-chart";

export const dynamic = "force-dynamic";

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

export default async function DashboardPage() {
  const { supabase } = await guard("dashboard", "read");
  const hojeISO = new Date().toISOString().slice(0, 10);

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const lista = pedidos ?? [];
  const kpis = calcularKpis(lista, hojeISO);
  const serie = serieDiaria(lista, ultimosDias(14));
  const recentes = lista.slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão comercial, operacional e financeira do Yapa." />

      {/* Comercial */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pedidos hoje" value={kpis.pedidosHoje} icon={<ShoppingBag />} hint="recebidos no dia" />
        <StatCard label="Faturamento hoje" value={gs(kpis.faturamentoHojeGs)} icon={<Wallet />} hint="pedidos pagos" />
        <StatCard label="Ticket médio" value={gs(kpis.ticketMedioGs)} icon={<CircleDollarSign />} hint="por pedido pago hoje" />
        <StatCard label="Taxa de conclusão" value={pct(kpis.taxaConclusao)} icon={<TrendingUp />} hint="entregues / válidos" />
      </div>

      {/* Operacional */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Em andamento" value={kpis.emAndamento} icon={<Bike />} hint="pedidos abertos agora" />
        <StatCard label="Entregues hoje" value={kpis.entreguesHoje} icon={<PackageCheck />} />
        <StatCard label="Aguardando pagamento" value={kpis.aguardandoPagamento} icon={<Hourglass />} />
        <StatCard label="Quebras de pedido" value={kpis.quebras} icon={<AlertTriangle />} hint="exigem ação" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pedidos — últimos 14 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <DashboardChart data={serie} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pedidos recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentes.length === 0 ? (
              <EmptyState icon={<ShoppingBag />} title="Sem pedidos ainda" description="Quando os pedidos começarem a chegar pelo WhatsApp, aparecem aqui." />
            ) : (
              <ul className="divide-y divide-border">
                {recentes.map((p) => {
                  const meta = PEDIDO_STATUS_META[p.status];
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 space-y-1">
                        <Link href={`/pedidos/${p.id}`} className="font-medium hover:underline">#{p.numero}</Link>
                        <div><Badge variant={meta.variant}>{meta.label}</Badge></div>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">{gs(p.valor_total_gs)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
