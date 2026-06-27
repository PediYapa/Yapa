"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Users, Search } from "lucide-react";
import type { ClienteRow } from "@/lib/database.types";
import { salvarCliente, excluirCliente } from "@/app/actions/clientes";
import type { ActionResult } from "@/lib/auth/guard";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gs, telBR, dataBR } from "@/lib/format";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>;
}

export function ClientesClient({ rows, canWrite }: { rows: ClienteRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ClienteRow | null>(null);
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(salvarCliente, undefined);

  useEffect(() => {
    if (state?.ok) {
      setAberto(false);
      setEditando(null);
      router.refresh();
    }
  }, [state, router]);

  const filtradas = rows.filter((c) => {
    const q = busca.toLowerCase();
    return (
      (c.nome ?? "").toLowerCase().includes(q) ||
      (c.telefone ?? "").includes(q) ||
      (c.zona ?? "").toLowerCase().includes(q)
    );
  });

  function novo() {
    setEditando(null);
    setAberto(true);
  }
  function editar(c: ClienteRow) {
    setEditando(c);
    setAberto(true);
  }
  async function remover(c: ClienteRow) {
    if (!confirm(`Excluir o cliente ${c.nome ?? c.telefone}?`)) return;
    await excluirCliente(c.id);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Consumidores que pedem pelo WhatsApp."
        action={canWrite ? <Button onClick={novo}><Plus /> Novo cliente</Button> : undefined}
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou zona…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Nenhum cliente"
          description="Os clientes aparecem aqui conforme fazem pedidos pelo WhatsApp, ou cadastre manualmente."
          action={canWrite ? <Button onClick={novo}><Plus /> Novo cliente</Button> : undefined}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>RUC/CI</TableHead>
                <TableHead>Zona</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
                <TableHead>Última compra</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome ?? "—"}</TableCell>
                  <TableCell>{telBR(c.telefone)}</TableCell>
                  <TableCell className="tabular-nums">{c.documento_ruc ?? "—"}</TableCell>
                  <TableCell>{c.zona ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.total_pedidos}</TableCell>
                  <TableCell className="text-right tabular-nums">{gs(c.ticket_medio_gs)}</TableCell>
                  <TableCell>{dataBR(c.ultima_compra)}</TableCell>
                  <TableCell>
                    {canWrite && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => editar(c)} aria-label="Editar"><Pencil /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remover(c)} aria-label="Excluir"><Trash2 /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title={editando ? "Editar cliente" : "Novo cliente"}
      >
        <form action={formAction} className="space-y-4">
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" defaultValue={editando?.nome ?? ""} placeholder="Nome do cliente" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone (WhatsApp) *</Label>
              <Input id="telefone" name="telefone" required defaultValue={editando?.telefone ?? ""} placeholder="595994xxxxxx" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zona">Zona / Bairro</Label>
              <Input id="zona" name="zona" defaultValue={editando?.zona ?? ""} placeholder="Centro, Km 4…" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input id="endereco" name="endereco" defaultValue={editando?.endereco ?? ""} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="referencia">Ponto de referência</Label>
              <Input id="referencia" name="referencia" defaultValue={editando?.referencia ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitude</Label>
              <Input id="latitude" name="latitude" defaultValue={editando?.latitude ?? ""} placeholder="-25.5097" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">Longitude</Label>
              <Input id="longitude" name="longitude" defaultValue={editando?.longitude ?? ""} placeholder="-54.6111" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea id="notas" name="notas" defaultValue={editando?.notas ?? ""} />
            </div>
          </div>
          {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <SubmitButton />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
