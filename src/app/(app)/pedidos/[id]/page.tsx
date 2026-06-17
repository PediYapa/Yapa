import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, User, Phone, MapPin, Wallet, Bike, KeyRound } from "lucide-react";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import type {
  PedidoItemRow,
  EntregaRow,
  PagamentoRow,
  DistribuidoraRow,
} from "@/lib/database.types";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gs, telBR, dataHoraBR } from "@/lib/format";
import {
  PEDIDO_STATUS_META,
  ENTREGA_STATUS_META,
  PAGAMENTO_STATUS_META,
} from "@/lib/intel/status";
import { PedidoAcoes } from "./pedido-acoes";

export const dynamic = "force-dynamic";

export default async function PedidoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, profile } = await guard("pedidos", "read");
  const canWrite = can(profile, "pedidos", "write");

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!pedido) notFound();

  const [{ data: itensData }, { data: entregaData }, { data: pagamentosData }, { data: distData }] =
    await Promise.all([
      supabase.from("pedido_itens").select("*").eq("pedido_id", id).order("created_at", { ascending: true }),
      supabase.from("entregas").select("*").eq("pedido_id", id).order("created_at", { ascending: false }).limit(1),
      supabase.from("pagamentos").select("*").eq("pedido_id", id).order("created_at", { ascending: false }),
      supabase.from("distribuidoras").select("*").is("deleted_at", null).order("nome", { ascending: true }),
    ]);

  const itens = (itensData ?? []) as PedidoItemRow[];
  const entrega = ((entregaData ?? [])[0] ?? null) as EntregaRow | null;
  const pagamentos = (pagamentosData ?? []) as PagamentoRow[];
  const distribuidoras = (distData ?? []) as DistribuidoraRow[];

  const cliente = pedido.cliente_id
    ? (await supabase.from("clientes").select("*").eq("id", pedido.cliente_id).maybeSingle()).data
    : null;
  const distribuidora = pedido.distribuidora_id
    ? distribuidoras.find((d) => d.id === pedido.distribuidora_id) ?? null
    : null;

  const meta = PEDIDO_STATUS_META[pedido.status];
  const total = itens.reduce((s, it) => s + it.subtotal_gs, 0);
  const pagamento = pagamentos[0] ?? null;

  return (
    <div className="space-y-6">
      <Link href="/pedidos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pedidos
      </Link>

      <PageHeader
        title={`Pedido #${pedido.numero}`}
        description={`Recebido em ${dataHoraBR(pedido.created_at)} · canal ${pedido.canal}`}
        action={
          <div className="flex items-center gap-3">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <span className="font-display text-xl font-semibold tabular-nums">{gs(pedido.valor_total_gs)}</span>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Cliente */}
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><User className="size-4 text-muted-foreground" /> {cliente?.nome ?? "—"}</p>
              <p className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground" /> {telBR(cliente?.telefone)}</p>
              <p className="flex items-center gap-2">
                <MapPin className="size-4 text-muted-foreground" />
                {pedido.endereco_entrega ?? cliente?.endereco ?? "—"}
                {(cliente?.zona ?? null) && <span className="text-muted-foreground">· {cliente?.zona}</span>}
              </p>
              {(pedido.referencia ?? cliente?.referencia) && (
                <p className="text-muted-foreground">Ref.: {pedido.referencia ?? cliente?.referencia}</p>
              )}
              {pedido.observacao && <p className="text-muted-foreground">Obs.: {pedido.observacao}</p>}
            </CardContent>
          </Card>

          {/* Itens */}
          <Card>
            <CardHeader>
              <CardTitle>Itens</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Preço unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">{it.descricao}</TableCell>
                      <TableCell className="text-right tabular-nums">{it.quantidade}</TableCell>
                      <TableCell className="text-right tabular-nums">{gs(it.preco_unit_gs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{gs(it.subtotal_gs)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{gs(total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-6">
          {canWrite && (
            <Card>
              <CardHeader>
                <CardTitle>Ações</CardTitle>
              </CardHeader>
              <CardContent>
                <PedidoAcoes pedido={pedido} distribuidoras={distribuidoras} />
              </CardContent>
            </Card>
          )}

          {/* Pagamento */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wallet className="size-4" /> Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pagamento ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={PAGAMENTO_STATUS_META[pagamento.status].variant}>
                      {PAGAMENTO_STATUS_META[pagamento.status].label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Forma</span>
                    <span className="capitalize">{pagamento.provedor}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Valor</span>
                    <span className="tabular-nums">{gs(pagamento.valor_gs)}</span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">Nenhum pagamento registrado.</p>
              )}
            </CardContent>
          </Card>

          {/* Entrega */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bike className="size-4" /> Entrega</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Distribuidora</span>
                <span>{distribuidora?.nome ?? "—"}</span>
              </div>
              {entrega ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={ENTREGA_STATUS_META[entrega.status].variant}>
                      {ENTREGA_STATUS_META[entrega.status].label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Despacho</span>
                    <span>{dataHoraBR(entrega.horario_despacho)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Entregue em</span>
                    <span>{dataHoraBR(entrega.horario_entrega_realizado)}</span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">Entrega ainda não despachada.</p>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="flex items-center gap-1 text-muted-foreground"><KeyRound className="size-4" /> Código</span>
                <span className="font-mono font-semibold tracking-widest">{pedido.codigo_validacao ?? "—"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
