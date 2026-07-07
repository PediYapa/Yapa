"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Warehouse, Search } from "lucide-react";
import type { DistribuidoraRow } from "@/lib/database.types";
import { salvarDistribuidora, excluirDistribuidora } from "@/app/actions/distribuidoras";
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
import { gs, telBR } from "@/lib/format";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>;
}

export function DistribuidorasClient({ rows, canWrite }: { rows: DistribuidoraRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<DistribuidoraRow | null>(null);
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(salvarDistribuidora, undefined);

  useEffect(() => {
    if (state?.ok) {
      setAberto(false);
      setEditando(null);
      router.refresh();
    }
  }, [state, router]);

  const filtradas = rows.filter((d) => {
    const q = busca.toLowerCase();
    return (
      d.nome.toLowerCase().includes(q) ||
      (d.telefone ?? "").includes(q) ||
      (d.contato ?? "").toLowerCase().includes(q)
    );
  });

  function novo() {
    setEditando(null);
    setAberto(true);
  }
  function editar(d: DistribuidoraRow) {
    setEditando(d);
    setAberto(true);
  }
  async function remover(d: DistribuidoraRow) {
    if (!confirm(`Excluir a distribuidora ${d.nome}?`)) return;
    await excluirDistribuidora(d.id);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Distribuidoras"
        description="Pontos de saída que abastecem as entregas."
        action={canWrite ? <Button onClick={novo}><Plus /> Nova distribuidora</Button> : undefined}
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou contato…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={<Warehouse />}
          title="Nenhuma distribuidora"
          description="Cadastre as distribuidoras que abastecem as entregas do Yapa."
          action={canWrite ? <Button onClick={novo}><Plus /> Nova distribuidora</Button> : undefined}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-right">Raio (km)</TableHead>
                <TableHead>Recebe dinheiro</TableHead>
                <TableHead className="text-right">Saldo D+1</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.nome}</TableCell>
                  <TableCell>{telBR(d.telefone)}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.raio_km}</TableCell>
                  <TableCell>
                    <Badge variant={d.recebe_dinheiro ? "success" : "outline"}>
                      {d.recebe_dinheiro ? "Sim" : "Não"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{gs(d.saldo_d1_gs)}</TableCell>
                  <TableCell>
                    <Badge variant={d.ativo ? "success" : "outline"}>{d.ativo ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell>
                    {canWrite && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => editar(d)} aria-label="Editar"><Pencil /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remover(d)} aria-label="Excluir"><Trash2 /></Button>
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
        title={editando ? "Editar distribuidora" : "Nova distribuidora"}
      >
        <form action={formAction} className="space-y-4">
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" name="nome" required defaultValue={editando?.nome ?? ""} placeholder="Nome da distribuidora" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contato">Contato</Label>
              <Input id="contato" name="contato" defaultValue={editando?.contato ?? ""} placeholder="Responsável" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" defaultValue={editando?.telefone ?? ""} placeholder="595994xxxxxx" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input id="endereco" name="endereco" defaultValue={editando?.endereco ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitude</Label>
              <Input id="latitude" name="latitude" defaultValue={editando?.latitude ?? ""} placeholder="-25.5097" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">Longitude</Label>
              <Input id="longitude" name="longitude" defaultValue={editando?.longitude ?? ""} placeholder="-54.6111" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="raio_km">Raio de entrega (km) *</Label>
              <Input id="raio_km" name="raio_km" type="number" step="0.1" required defaultValue={editando?.raio_km ?? 5} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link_maps">Link do Maps</Label>
              <Input id="link_maps" name="link_maps" defaultValue={editando?.link_maps ?? ""} placeholder="https://maps.google.com/…" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="grupo_motoboys_id">Grupo de motoboys (ID Z-API)</Label>
              <Input id="grupo_motoboys_id" name="grupo_motoboys_id" defaultValue={editando?.grupo_motoboys_id ?? ""} placeholder="Ex.: 120363043123456789-group" />
              <p className="text-xs text-muted-foreground">
                ID do grupo de WhatsApp que recebe as corridas. Para obter: painel Z-API → Grupos, ou mande uma mensagem no grupo e copie o campo <code>phone</code> do log do webhook.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recebe_dinheiro">Recebe dinheiro</Label>
              <Select id="recebe_dinheiro" name="recebe_dinheiro" defaultValue={String(editando?.recebe_dinheiro ?? true)}>
                <option value="true">Sim</option>
                <option value="false">Não</option>
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
