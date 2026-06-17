"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Bike, Search } from "lucide-react";
import type { EntregadorRow } from "@/lib/database.types";
import { salvarEntregador, excluirEntregador } from "@/app/actions/entregadores";
import type { ActionResult } from "@/lib/auth/guard";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { telBR } from "@/lib/format";

type DistribuidoraOption = { id: string; nome: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>;
}

export function EntregadoresClient({
  rows,
  distribuidoras,
  canWrite,
}: {
  rows: EntregadorRow[];
  distribuidoras: DistribuidoraOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<EntregadorRow | null>(null);
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(salvarEntregador, undefined);

  useEffect(() => {
    if (state?.ok) {
      setAberto(false);
      setEditando(null);
      router.refresh();
    }
  }, [state, router]);

  const filtradas = rows.filter((e) => {
    const q = busca.toLowerCase();
    return (
      e.nome.toLowerCase().includes(q) ||
      (e.telefone ?? "").includes(q) ||
      (e.grupo_parceiro ?? "").toLowerCase().includes(q)
    );
  });

  function novo() {
    setEditando(null);
    setAberto(true);
  }
  function editar(e: EntregadorRow) {
    setEditando(e);
    setAberto(true);
  }
  async function remover(e: EntregadorRow) {
    if (!confirm(`Excluir o entregador ${e.nome}?`)) return;
    await excluirEntregador(e.id);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Entregadores"
        description="Motoboys e parceiros que fazem as entregas."
        action={canWrite ? <Button onClick={novo}><Plus /> Novo entregador</Button> : undefined}
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou grupo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={<Bike />}
          title="Nenhum entregador"
          description="Cadastre os entregadores e parceiros que realizam as entregas do Yapa."
          action={canWrite ? <Button onClick={novo}><Plus /> Novo entregador</Button> : undefined}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Grupo parceiro</TableHead>
                <TableHead className="text-right">Entregas concluídas</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.nome}</TableCell>
                  <TableCell>{telBR(e.telefone)}</TableCell>
                  <TableCell>{e.grupo_parceiro ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.entregas_completadas}</TableCell>
                  <TableCell>
                    <Badge variant={e.ativo ? "success" : "outline"}>{e.ativo ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell>
                    {canWrite && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => editar(e)} aria-label="Editar"><Pencil /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remover(e)} aria-label="Excluir"><Trash2 /></Button>
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
        title={editando ? "Editar entregador" : "Novo entregador"}
      >
        <form action={formAction} className="space-y-4">
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" name="nome" required defaultValue={editando?.nome ?? ""} placeholder="Nome do entregador" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" defaultValue={editando?.telefone ?? ""} placeholder="595994xxxxxx" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grupo_parceiro">Grupo parceiro</Label>
              <Input id="grupo_parceiro" name="grupo_parceiro" defaultValue={editando?.grupo_parceiro ?? ""} placeholder="Grupo WhatsApp / central" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="distribuidora_base_id">Distribuidora base</Label>
              <Select id="distribuidora_base_id" name="distribuidora_base_id" defaultValue={editando?.distribuidora_base_id ?? ""}>
                <option value="">Sem distribuidora base</option>
                {distribuidoras.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ativo">Ativo</Label>
              <Select id="ativo" name="ativo" defaultValue={String(editando?.ativo ?? true)}>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </Select>
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
