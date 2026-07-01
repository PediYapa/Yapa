"use client";

import { useState, useTransition, useRef } from "react";
import { Plus, Check, Loader2, Trash2, PackageSearch, UploadCloud, Sparkles } from "lucide-react";
import { atualizarQuantidadeEstoque, removerEstoque } from "@/app/actions/hub";

export type ItemEstoque = { id: string; produto_id: string; nome: string; quantidade: number };

const MAX_LINHAS_CSV = 500;

/** Divide uma linha de CSV respeitando aspas duplas. */
function splitLinha(linha: string, delim: string): string[] {
  const out: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { campo += '"'; i++; }
      else aspas = !aspas;
    } else if (c === delim && !aspas) {
      out.push(campo); campo = "";
    } else campo += c;
  }
  out.push(campo);
  return out.map((s) => s.trim());
}

/**
 * Parser CSV nativo e tolerante: detecta o delimitador (`,` `;` ou tab), tenta
 * reconhecer as colunas de nome e quantidade pelo cabeçalho (senão assume
 * col.0 = nome, col.1 = quantidade). Robusto contra planilhas sujas.
 */
function parseCSV(texto: string): { nome_sujo: string; qtd: string }[] {
  const linhas = texto.split(/\r\n|\n|\r/).filter((l) => l.trim());
  if (linhas.length === 0) return [];

  const cont = (d: string) => (linhas[0].match(new RegExp(`\\${d}`, "g")) ?? []).length;
  const delim = cont(";") > cont(",") ? ";" : cont("\t") > cont(",") ? "\t" : ",";

  const rows = linhas.map((l) => splitLinha(l, delim));
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const head = rows[0].map(norm);
  const iNome = head.findIndex((h) => /(nome|produto|descri|item|articulo)/.test(h));
  const iQtd = head.findIndex((h) => /(qtd|quant|estoque|stock|caixa|volume|cantidad)/.test(h));

  const temCabecalho = iNome >= 0 || iQtd >= 0;
  const colNome = iNome >= 0 ? iNome : 0;
  const colQtd = iQtd >= 0 ? iQtd : 1;
  const inicio = temCabecalho ? 1 : 0;

  const out: { nome_sujo: string; qtd: string }[] = [];
  for (let i = inicio; i < rows.length && out.length < MAX_LINHAS_CSV; i++) {
    const nome = (rows[i][colNome] ?? "").trim();
    const qtd = (rows[i][colQtd] ?? "").trim();
    if (nome) out.push({ nome_sujo: nome, qtd });
  }
  return out;
}

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

  const [importando, setImportando] = useState(false);
  const [importMsg, setImportMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Aplica os itens gravados: sobrescreve os existentes (por produto) e adiciona os novos. */
  function mesclarItens(novos: ItemEstoque[]) {
    setItens((prev) => {
      const mapa = new Map(prev.map((i) => [i.produto_id, i]));
      for (const n of novos) mapa.set(n.produto_id, n);
      // Novos primeiro (recém-importados no topo), preservando a ordem geral.
      const recem = novos.map((n) => n.produto_id);
      const resto = prev.filter((i) => !recem.includes(i.produto_id));
      return [...novos.map((n) => mapa.get(n.produto_id)!), ...resto];
    });
  }

  async function importarArquivo(file: File) {
    setImportMsg(null);
    setErro(null);
    const texto = await file.text();
    const linhas = parseCSV(texto);
    if (linhas.length === 0) {
      setImportMsg({ tipo: "erro", texto: "Não achei produtos na planilha. Verifique o arquivo." });
      return;
    }
    setImportando(true);
    try {
      const res = await fetch("/api/hub/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linhas, hub: distribuidoraId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setImportMsg({ tipo: "erro", texto: data.error ?? "Falha na importação." });
        return;
      }
      if (Array.isArray(data.itens) && data.itens.length) mesclarItens(data.itens as ItemEstoque[]);
      const naoRec = data.naoReconhecidos ? ` · ${data.naoReconhecidos} não reconhecido(s)` : "";
      setImportMsg({ tipo: "ok", texto: `${data.atualizados} produto(s) atualizado(s) com sucesso${naoRec}.` });
    } catch {
      setImportMsg({ tipo: "erro", texto: "Falha de conexão durante a importação." });
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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

        {/* Importação em massa via CSV (motor WIP em lote) */}
        <div className="mt-4 border-t border-neutral-800 pt-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importarArquivo(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importando}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700 py-3 text-sm font-medium text-neutral-300 transition-colors hover:border-[#FFCC00] hover:text-[#FFCC00] disabled:opacity-50"
          >
            <UploadCloud className="size-5" />
            Importar Planilha (CSV)
          </button>

          {importando && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#FFCC00]/10 px-3 py-2.5 text-sm text-[#FFCC00]">
              <Sparkles className="size-4 animate-pulse" />
              <span>A Inteligência Artificial está organizando seu estoque…</span>
              <Loader2 className="ml-auto size-4 animate-spin" />
            </div>
          )}
          {importMsg && !importando && (
            <p className={`mt-3 text-sm ${importMsg.tipo === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {importMsg.texto}
            </p>
          )}
        </div>
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
              <EstoqueRow key={`${it.id}:${it.quantidade}`} item={it} limiteBaixo={limiteBaixo} onRemover={() => remover(it.id)} />
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
