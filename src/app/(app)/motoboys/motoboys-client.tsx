"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Bike, Search } from "lucide-react";
import type { MotoboyRow } from "@/lib/database.types";
import { salvarMotoboy, excluirMotoboy } from "@/app/actions/motoboys";
import type { ActionResult } from "@/lib/auth/guard";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DistribuidoraOption = { id: string; nome: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>;
}

export function MotoboysClient({
  rows,
  distribuidoras,
  canWrite,
}: {
  rows: MotoboyRow[];
  distribuidoras: DistribuidoraOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<MotoboyRow | null>(null);
  const [aberto, setAberto] = useState(false);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(salvarMotoboy, undefined);

  const distMap = new Map(distribuidoras.map((d) => [d.id, d.nome]));

  useEffect(() => {
    if (state?.ok) {
      setAberto(false);
      setEditando(null);
      router.refresh();
    }
  }, [state, router]);

  const filtrados = rows.filter((m) => {
    const q = busca.toLowerCase();
    return (
      m.nome.toLowerCase().includes(q) ||
      m.telefone.includes(q) ||
      (distMap.get(m.distribuidora_id) ?? "").toLowerCase().includes(q)
    );
  });

  function novo() {
    setEditando(null);
    setAberto(true);
  }
  function editar(m: MotoboyRow) {
    setEditando(m);
    setAberto(true);
  }
  async function remover(m: MotoboyRow) {
    if (!confirm(`Excluir o motoboy ${m.nome}?`)) return;
    setErroExcluir(null);
    const res = await excluirMotoboy(m.id);
    if (!res.ok) setErroExcluir(res.error);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Motoboys"
        description="Quem responde 'P <corrida>' nos grupos de WhatsApp das distribuidoras."
        action={canWrite ? <Button onClick={novo}><Plus /> Novo motoboy</Button> : undefined}
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou hub…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {erroExcluir && <p className="mb-4 text-sm text-destructive">{erroExcluir}</p>}

      {filtrados.length === 0 ? (
        <EmptyState
          icon={<Bike />}
          title="Nenhum motoboy"
          description="Cadastre os motoboys dos grupos de WhatsApp — só cadastrados e ativos conseguem aceitar corridas."
          action={canWrite ? <Button onClick={novo}><Plus /> Novo motoboy</Button> : undefined}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone (Z-API)</TableHead>
                <TableHead>Distribuidora / grupo</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell className="tabular-nums">{m.telefone}</TableCell>
                  <TableCell>{distMap.get(m.distribuidora_id) ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={m.ativo ? "success" : "outline"}>{m.ativo ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell>
                    {canWrite && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => editar(m)} aria-label="Editar"><Pencil /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remover(m)} aria-label="Excluir"><Trash2 /></Button>
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
        title={editando ? "Editar motoboy" : "Novo motoboy"}
      >
        <form action={formAction} className="space-y-4">
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" name="nome" required defaultValue={editando?.nome ?? ""} placeholder="Nome do motoboy" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone *</Label>
              <Input id="telefone" name="telefone" required defaultValue={editando?.telefone ?? ""} placeholder="5959XXXXXXXX" />
              <p className="text-xs text-muted-foreground">Mesmo número que ele usa no grupo (formato Z-API, só dígitos).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="distribuidora_id">Distribuidora *</Label>
              <Select id="distribuidora_id" name="distribuidora_id" required defaultValue={editando?.distribuidora_id ?? ""}>
                <option value="">Selecione…</option>
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
