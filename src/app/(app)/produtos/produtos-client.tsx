"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Package, Search } from "lucide-react";
import type { ProdutoRow, ProdutoCategoria } from "@/lib/database.types";
import { salvarProduto, excluirProduto } from "@/app/actions/produtos";
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
import { gs } from "@/lib/format";

type DistribuidoraOption = { id: string; nome: string };

const CATEGORIAS: { value: ProdutoCategoria; label: string }[] = [
  { value: "cerveja", label: "Cerveja" },
  { value: "destilado", label: "Destilado" },
  { value: "pod", label: "Pod" },
  { value: "vape", label: "Vape" },
  { value: "voucher", label: "Voucher" },
  { value: "outro", label: "Outro" },
];

const CATEGORIA_LABEL: Record<ProdutoCategoria, string> = {
  cerveja: "Cerveja",
  destilado: "Destilado",
  pod: "Pod",
  vape: "Vape",
  voucher: "Voucher",
  outro: "Outro",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>;
}

export function ProdutosClient({
  rows,
  distribuidoras,
  canWrite,
}: {
  rows: ProdutoRow[];
  distribuidoras: DistribuidoraOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ProdutoRow | null>(null);
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(salvarProduto, undefined);

  useEffect(() => {
    if (state?.ok) {
      setAberto(false);
      setEditando(null);
      router.refresh();
    }
  }, [state, router]);

  const filtrados = rows.filter((p) => {
    const q = busca.toLowerCase();
    return (
      p.nome.toLowerCase().includes(q) ||
      CATEGORIA_LABEL[p.categoria].toLowerCase().includes(q)
    );
  });

  function novo() {
    setEditando(null);
    setAberto(true);
  }
  function editar(p: ProdutoRow) {
    setEditando(p);
    setAberto(true);
  }
  async function remover(p: ProdutoRow) {
    if (!confirm(`Excluir o produto ${p.nome}?`)) return;
    await excluirProduto(p.id);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Catálogo"
        description="Produtos disponíveis para venda no Yapa."
        action={canWrite ? <Button onClick={novo}><Plus /> Novo produto</Button> : undefined}
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou categoria…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="Nenhum produto"
          description="Cadastre os produtos do catálogo para começar a vender."
          action={canWrite ? <Button onClick={novo}><Plus /> Novo produto</Button> : undefined}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead>Disponível</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell>
                    <Badge variant="primary">{CATEGORIA_LABEL[p.categoria]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{gs(p.preco_gs)}</TableCell>
                  <TableCell>
                    <Badge variant={p.disponivel ? "success" : "outline"}>
                      {p.disponivel ? "Disponível" : "Indisponível"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canWrite && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => editar(p)} aria-label="Editar"><Pencil /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remover(p)} aria-label="Excluir"><Trash2 /></Button>
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
        title={editando ? "Editar produto" : "Novo produto"}
      >
        <form action={formAction} className="space-y-4">
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" name="nome" required defaultValue={editando?.nome ?? ""} placeholder="Nome do produto" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria *</Label>
              <Select id="categoria" name="categoria" required defaultValue={editando?.categoria ?? "cerveja"}>
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preco_gs">Preço (₲) *</Label>
              <Input id="preco_gs" name="preco_gs" type="number" step="1" required defaultValue={editando?.preco_gs ?? ""} placeholder="0" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="distribuidora_id">Distribuidora</Label>
              <Select id="distribuidora_id" name="distribuidora_id" defaultValue={editando?.distribuidora_id ?? ""}>
                <option value="">Catálogo global</option>
                {distribuidoras.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="disponivel">Disponível</Label>
              <Select id="disponivel" name="disponivel" defaultValue={String(editando?.disponivel ?? true)}>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea id="descricao" name="descricao" defaultValue={editando?.descricao ?? ""} />
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
