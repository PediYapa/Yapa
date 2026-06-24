"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plus, Pencil, Trash2, Package, Search, ImageOff } from "lucide-react";
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
  { value: "pod", label: "Pod / Cigarro Eletrônico" },
  { value: "conveniencia", label: "Conveniência" },
  { value: "combo", label: "Combo Promocional" },
];

const CATEGORIA_LABEL: Record<ProdutoCategoria, string> = {
  cerveja: "Cerveja",
  destilado: "Destilado",
  pod: "Pod / Cigarro Eletrônico",
  conveniencia: "Conveniência",
  combo: "Combo Promocional",
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
  // preview da imagem no diálogo: string = URL a exibir, null = sem imagem
  const [preview, setPreview] = useState<string | null>(null);
  const [removerImagem, setRemoverImagem] = useState(false);
  // Categoria controlada → renderização condicional dos campos (caixa / sabores).
  const [categoria, setCategoria] = useState<ProdutoCategoria>("cerveja");
  // Sabores (pods) como tags editáveis.
  const [sabores, setSabores] = useState<string[]>([]);
  const [saborInput, setSaborInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
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
    setPreview(null);
    setRemoverImagem(false);
    setCategoria("cerveja");
    setSabores([]);
    setSaborInput("");
    setAberto(true);
  }
  function editar(p: ProdutoRow) {
    setEditando(p);
    setPreview(p.imagem_url);
    setRemoverImagem(false);
    setCategoria(p.categoria);
    setSabores(p.opcoes_variacao ?? []);
    setSaborInput("");
    setAberto(true);
  }

  function adicionarSabor() {
    const novos = saborInput
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !sabores.includes(s));
    if (novos.length) setSabores((atual) => [...atual, ...novos]);
    setSaborInput("");
  }
  function removerSabor(s: string) {
    setSabores((atual) => atual.filter((x) => x !== s));
  }

  function onSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      setRemoverImagem(false);
    }
  }
  function limparImagem() {
    setPreview(null);
    setRemoverImagem(true);
    if (fileRef.current) fileRef.current.value = "";
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
                <TableHead className="w-14"></TableHead>
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
                  <TableCell>
                    {p.imagem_url ? (
                      <Image
                        src={p.imagem_url}
                        alt={p.nome}
                        width={40}
                        height={40}
                        className="size-10 rounded-lg object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <ImageOff className="size-4" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.nome}
                    {p.opcoes_variacao && p.opcoes_variacao.length > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({p.opcoes_variacao.length} sabores)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="primary">{CATEGORIA_LABEL[p.categoria]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {gs(p.preco_gs)}
                    {p.preco_caixa != null && (
                      <span className="block text-xs text-muted-foreground">
                        cx {gs(p.preco_caixa)}
                        {p.unidades_por_caixa ? ` /${p.unidades_por_caixa}un` : ""}
                      </span>
                    )}
                  </TableCell>
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
              <Select
                id="categoria"
                name="categoria"
                required
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as ProdutoCategoria)}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preco_gs">Preço por unidade (₲) *</Label>
              <Input id="preco_gs" name="preco_gs" type="number" step="1" required defaultValue={editando?.preco_gs ?? ""} placeholder="0" />
            </div>

            {/* Cerveja: preço e quantidade por caixa */}
            {categoria === "cerveja" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="preco_caixa">Preço da caixa (₲)</Label>
                  <Input
                    id="preco_caixa"
                    name="preco_caixa"
                    type="number"
                    step="1"
                    defaultValue={editando?.preco_caixa ?? ""}
                    placeholder="vazio = só unidade"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unidades_por_caixa">Unidades por caixa</Label>
                  <Input
                    id="unidades_por_caixa"
                    name="unidades_por_caixa"
                    type="number"
                    step="1"
                    min="1"
                    defaultValue={editando?.unidades_por_caixa ?? ""}
                    placeholder="ex.: 12"
                  />
                </div>
              </>
            )}

            {/* Pod: sabores como tags */}
            {categoria === "pod" && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sabor_input">Sabores / variações</Label>
                <input type="hidden" name="opcoes_variacao" value={sabores.join(",")} />
                <div className="flex gap-2">
                  <Input
                    id="sabor_input"
                    value={saborInput}
                    onChange={(e) => setSaborInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        adicionarSabor();
                      }
                    }}
                    placeholder="Digite um sabor e Enter (ou separe por vírgula)"
                  />
                  <Button type="button" variant="outline" onClick={adicionarSabor}>
                    <Plus /> Add
                  </Button>
                </div>
                {sabores.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {sabores.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => removerSabor(s)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remover ${s}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  No WhatsApp, o bot vai perguntar o sabor antes da quantidade.
                </p>
              </div>
            )}
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
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="imagem">Imagem do produto</Label>
              <input type="hidden" name="remover_imagem" value={String(removerImagem)} />
              <div className="flex items-center gap-3">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Pré-visualização" className="size-16 rounded-lg border border-border object-cover" />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                    <ImageOff className="size-5" />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <Input
                    ref={fileRef}
                    id="imagem"
                    name="imagem"
                    type="file"
                    accept="image/*"
                    onChange={onSelecionarArquivo}
                    className="text-sm"
                  />
                  {preview && (
                    <button type="button" onClick={limparImagem} className="self-start text-xs text-destructive hover:underline">
                      Remover imagem
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">PNG/JPG até 5 MB. Usada no catálogo e nos fluxos do bot.</p>
                </div>
              </div>
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
