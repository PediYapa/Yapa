"use client";

import { useState, useTransition, useRef } from "react";
import { Plus, Check, Loader2, Trash2, PackageSearch } from "lucide-react";
import { atualizarQuantidadeEstoque, removerEstoque } from "@/app/actions/hub";

export type ItemEstoque = { id: string; produto_id: string; nome: string; quantidade: number };

/**
 * Gestão de estoque do hub — edição in-line (onBlur → UPDATE silencioso) e
 * adição de produtos via motor WIP (route handler + IA). Dark + Amarelo Yapa,
 * botões e áreas de toque grandes para uso em balcão.
 */
export function EstoqueClient({
  distribuidoraId,
  itens: itensIniciais,
  limiteBaixo,
}: {
  distribuidoraId: string;
  itens: ItemEstoque[];
  limiteBaixo: number;
}) {
  const [itens, setItens] = useState<ItemEstoque[]>(itensIniciais);
  const [texto, setTexto] = useState("");
  const [addPending, startAdd] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const inputAddRef = useRef<HTMLInputElement>(null);

  function adicionar() {
    const t = texto.trim();
    if (!t || addPending) return;
    setErro(null);
    startAdd(async () => {
      try {
        const res = await fetch("/api/hub/wip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto: t, hub: distribuidoraId }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setErro(data.error ?? "Não foi possível adicionar.");
          return;
        }
        const novo = data.item as ItemEstoque;
        setItens((prev) => (prev.some((i) => i.produto_id === novo.produto_id) ? prev : [novo, ...prev]));
        setTexto("");
        inputAddRef.current?.focus();
      } catch {
        setErro("Falha de conexão. Tente novamente.");
      }
    });
  }

  function remover(id: string) {
    setItens((prev) => prev.filter((i) => i.id !== id));
    void removerEstoque(id);
  }

  return (
    <div className="mt-6">
      {/* Adicionar produto (motor WIP) */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <label className="text-sm font-medium text-neutral-200">Adicionar produto ao meu estoque</label>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <PackageSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
            <input
              ref={inputAddRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              placeholder="Ex.: Brahma latão 12un"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 py-3 pl-9 pr-3 text-base text-neutral-100 placeholder:text-neutral-600 focus:border-[#FFCC00] focus:outline-none"
            />
          </div>
          <button
            onClick={adicionar}
            disabled={addPending || !texto.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-[#FFCC00] px-4 text-base font-semibold text-neutral-950 transition-opacity disabled:opacity-40"
          >
            {addPending ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
            Add
          </button>
        </div>
        {erro && <p className="mt-2 text-sm text-red-400">{erro}</p>}
      </div>

      {/* Tabela de estoque — apenas Nome e Quantidade */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-800">
        <div className="flex items-center justify-between bg-neutral-900 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
          <span>Produto</span>
          <span>Quantidade (caixas)</span>
        </div>
        {itens.length === 0 ? (
          <p className="bg-neutral-950 px-4 py-8 text-center text-sm text-neutral-500">
            Nenhum produto no seu estoque ainda. Use o campo acima para adicionar.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800 bg-neutral-950">
            {itens.map((it) => (
              <EstoqueRow key={it.id} item={it} limiteBaixo={limiteBaixo} onRemover={() => remover(it.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EstoqueRow({
  item,
  limiteBaixo,
  onRemover,
}: {
  item: ItemEstoque;
  limiteBaixo: number;
  onRemover: () => void;
}) {
  const [valor, setValor] = useState(String(item.quantidade));
  const [estado, setEstado] = useState<"idle" | "salvando" | "salvo">("idle");
  const salvoAnterior = useRef(item.quantidade);

  function salvar() {
    const q = Math.max(0, Math.floor(Number(valor) || 0));
    setValor(String(q));
    if (q === salvoAnterior.current) return; // nada mudou
    setEstado("salvando");
    atualizarQuantidadeEstoque(item.id, q).then((res) => {
      if (res.ok) {
        salvoAnterior.current = q;
        setEstado("salvo");
        setTimeout(() => setEstado("idle"), 1500);
      } else {
        setEstado("idle");
      }
    });
  }

  const baixo = Number(valor) < limiteBaixo;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex-1 text-base font-medium text-neutral-100">{item.nome}</span>

      <div className="flex items-center gap-2">
        <span className="w-5 text-[#FFCC00]">
          {estado === "salvando" && <Loader2 className="size-4 animate-spin" />}
          {estado === "salvo" && <Check className="size-4" />}
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={`w-20 rounded-lg border bg-neutral-900 py-2 text-center text-lg font-bold tabular-nums focus:outline-none ${
            baixo ? "border-red-500/50 text-red-400" : "border-neutral-700 text-neutral-100 focus:border-[#FFCC00]"
          }`}
        />
        <button
          onClick={onRemover}
          aria-label="Remover produto"
          className="rounded-lg p-2 text-neutral-600 transition-colors hover:bg-neutral-800 hover:text-red-400"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}
