"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import type { ClienteRow, DistribuidoraRow, ProdutoRow } from "@/lib/database.types";
import { criarPedido } from "@/app/actions/pedidos";
import { aprovarPagamento } from "@/app/actions/aprovar-pagamento";
import type { ActionResult } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { gs } from "@/lib/format";

type ItemForm = { id: number; descricao: string; quantidade: string; preco: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Criando…" : "Criar pedido"}</Button>;
}

let nextId = 1;
function novoItem(): ItemForm {
  return { id: nextId++, descricao: "", quantidade: "1", preco: "" };
}

/**
 * Botão inline de aprovação rápida (mock do gateway) na lista de pedidos.
 * Aparece só para pedidos `aguardando_pagamento`. Marca pago e dispara a comanda.
 */
export function AprovarPagamentoButton({ pedidoId, temDistribuidora }: { pedidoId: string; temDistribuidora: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function aprovar() {
    setErro(null);
    startTransition(async () => {
      const res = await aprovarPagamento(pedidoId);
      if (!res.ok) setErro("error" in res ? res.error ?? "Erro" : "Erro");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={pending || !temDistribuidora} onClick={aprovar}>
        <CheckCircle2 /> {pending ? "Aprovando…" : "Aprovar"}
      </Button>
      {!temDistribuidora && <span className="text-[10px] text-amber-600">sem distribuidora</span>}
      {erro && <span className="max-w-40 text-right text-[10px] text-destructive">{erro}</span>}
    </div>
  );
}

export function NovoPedidoButton({
  clientes,
  distribuidoras,
  produtos,
}: {
  clientes: ClienteRow[];
  distribuidoras: DistribuidoraRow[];
  produtos: ProdutoRow[];
}) {
  void distribuidoras;
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<ItemForm[]>([novoItem()]);
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(criarPedido, undefined);

  useEffect(() => {
    if (state?.ok) {
      setAberto(false);
      setItens([novoItem()]);
      router.refresh();
      if (state.id) router.push(`/pedidos/${state.id}`);
    }
  }, [state, router]);

  function abrir() {
    setItens([novoItem()]);
    setAberto(true);
  }
  function adicionarItem() {
    setItens((prev) => [...prev, novoItem()]);
  }
  function removerItem(id: number) {
    setItens((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  }
  function atualizarItem(id: number, campo: keyof ItemForm, valor: string) {
    setItens((prev) => prev.map((it) => (it.id === id ? { ...it, [campo]: valor } : it)));
  }
  function aplicarProduto(id: number, produtoId: string) {
    const p = produtos.find((x) => x.id === produtoId);
    if (!p) return;
    setItens((prev) =>
      prev.map((it) => (it.id === id ? { ...it, descricao: p.nome, preco: String(p.preco_gs) } : it)),
    );
  }

  const total = itens.reduce(
    (s, it) => s + (Number(it.preco) || 0) * (Number(it.quantidade) || 0),
    0,
  );

  return (
    <>
      <Button onClick={abrir}><Plus /> Novo pedido</Button>

      <Dialog open={aberto} onClose={() => setAberto(false)} title="Novo pedido" className="max-w-2xl">
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone (WhatsApp) *</Label>
              <Input id="telefone" name="telefone" required placeholder="595994xxxxxx" list="clientes-tel" />
              <datalist id="clientes-tel">
                {clientes.map((c) => (
                  <option key={c.id} value={c.telefone}>{c.nome ?? c.telefone}</option>
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" placeholder="Nome do cliente" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="endereco_entrega">Endereço de entrega</Label>
              <Input id="endereco_entrega" name="endereco_entrega" placeholder="Rua, número, bairro…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="referencia">Ponto de referência</Label>
              <Input id="referencia" name="referencia" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="moeda">Moeda</Label>
              <Select id="moeda" name="moeda" defaultValue="GS">
                <option value="GS">Guarani (GS)</option>
                <option value="PIX">Pix (BRL)</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Itens *</Label>
              <Button type="button" variant="outline" size="sm" onClick={adicionarItem}><Plus /> Item</Button>
            </div>
            <div className="space-y-2">
              {itens.map((it) => (
                <div key={it.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-border p-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_5rem_8rem]">
                    <Input
                      name="item_descricao"
                      placeholder="Descrição (ex: Cerveja Brahma 1L)"
                      value={it.descricao}
                      onChange={(e) => atualizarItem(it.id, "descricao", e.target.value)}
                      list={`produtos-${it.id}`}
                      onInput={(e) => {
                        const p = produtos.find((x) => x.nome === (e.target as HTMLInputElement).value);
                        if (p) aplicarProduto(it.id, p.id);
                      }}
                    />
                    <datalist id={`produtos-${it.id}`}>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.nome}>{gs(p.preco_gs)}</option>
                      ))}
                    </datalist>
                    <Input
                      name="item_quantidade"
                      type="number"
                      min={1}
                      placeholder="Qtd"
                      value={it.quantidade}
                      onChange={(e) => atualizarItem(it.id, "quantidade", e.target.value)}
                    />
                    <Input
                      name="item_preco"
                      type="number"
                      min={0}
                      placeholder="Preço unit. (GS)"
                      value={it.preco}
                      onChange={(e) => atualizarItem(it.id, "preco", e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removerItem(it.id)}
                    aria-label="Remover item"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-right text-sm text-muted-foreground">
              Total: <span className="font-semibold text-foreground tabular-nums">{gs(total)}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacao">Observação</Label>
            <Textarea id="observacao" name="observacao" placeholder="Observações do pedido…" />
          </div>

          {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <SubmitButton />
          </div>
        </form>
      </Dialog>
    </>
  );
}
