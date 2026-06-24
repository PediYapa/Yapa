"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Play,
  MessageSquare,
  Image as ImageIcon,
  MousePointerClick,
  ShoppingCart,
  UserRound,
  CreditCard,
  ExternalLink,
  MapPin,
  Keyboard,
  Plus,
  Save,
  Trash2,
  Power,
  PowerOff,
  X,
  Workflow,
  FileUp,
  FileDown,
} from "lucide-react";
import type { FluxoRow, FluxoNodeData, FluxoNoTipo, FluxoBotao } from "@/lib/database.types";
import { salvarFluxo, ativarFluxo, desativarFluxo, excluirFluxo } from "@/app/actions/fluxos";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { gs } from "@/lib/format";

type ProdutoOpt = { id: string; nome: string; preco_gs: number; imagem_url: string | null };
type NoData = FluxoNodeData & Record<string, unknown>;
type NoFluxo = Node<NoData>;

// Contexto p/ o custom node exibir nome/imagem do produto escolhido.
const ProdutosCtx = createContext<Map<string, ProdutoOpt>>(new Map());

const META: Record<FluxoNoTipo, { label: string; icon: typeof Play; cor: string }> = {
  inicio: { label: "Início", icon: Play, cor: "text-emerald-600" },
  texto: { label: "Texto", icon: MessageSquare, cor: "text-sky-600" },
  imagem: { label: "Imagem", icon: ImageIcon, cor: "text-violet-600" },
  botoes: { label: "Botões", icon: MousePointerClick, cor: "text-amber-600" },
  produto: { label: "Produto", icon: ShoppingCart, cor: "text-rose-600" },
  humano: { label: "Atendente", icon: UserRound, cor: "text-slate-600" },
  payment_dlocal: { label: "Pagamento", icon: CreditCard, cor: "text-green-600" },
  external_link: { label: "Link Externo", icon: ExternalLink, cor: "text-blue-600" },
  location_capture: { label: "Localização", icon: MapPin, cor: "text-orange-600" },
  captura: { label: "Captura", icon: Keyboard, cor: "text-indigo-600" },
};

/**
 * Classificação de saída dos nós (alinhada ao motor lógico em fluxo-engine.ts):
 *  - terminal  → encerra a conversa, SEM handle de saída (atendente / checkout-pagamento).
 *  - ramificado → um handle de saída por opção (botoes). id do handle = id do botão.
 *  - linear    → um único handle genérico (inicio, texto, imagem, produto, link, localização).
 */
function ehTerminal(tipo: FluxoNoTipo): boolean {
  return tipo === "humano" || tipo === "payment_dlocal";
}
function ehRamificado(d: FluxoNodeData): boolean {
  return d.tipo === "botoes" && (d.botoes ?? []).length > 0;
}

/** Nó visual do fluxo. Botões expõem um handle de saída por botão (ramificação). */
function NoCard({ data, selected }: NodeProps<NoFluxo>) {
  const produtos = useContext(ProdutosCtx);
  const d = data as FluxoNodeData;
  const meta = META[d.tipo];
  const Icon = meta.icon;
  const prod = d.produto_id ? produtos.get(d.produto_id) : undefined;

  return (
    <div
      className={`min-w-44 max-w-56 rounded-xl border bg-card shadow-sm ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      {d.tipo !== "inicio" && <Handle type="target" position={Position.Top} className="!size-2.5 !bg-muted-foreground" />}

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Icon className={`size-4 ${meta.cor}`} />
        <span className="text-xs font-semibold">{meta.label}</span>
      </div>

      <div className="px-3 py-2 text-xs text-muted-foreground">
        {d.tipo === "inicio" && <span>Ponto de entrada da conversa.</span>}
        {d.tipo === "texto" && <span className="line-clamp-3 text-foreground">{d.texto || "(sem texto)"}</span>}
        {d.tipo === "imagem" && (
          <span className="line-clamp-2">{d.imagem_url ? "Imagem (URL definida)" : "(sem imagem)"}</span>
        )}
        {d.tipo === "produto" && (
          <span className="text-foreground">{prod ? `${prod.nome} — ${gs(prod.preco_gs)}` : "(escolha um produto)"}</span>
        )}
        {d.tipo === "humano" && <span>Transfere para atendimento humano.</span>}
        {d.tipo === "botoes" && (
          <div className="space-y-1">
            <p className="text-foreground">{d.texto || "(pergunta)"}</p>
            <div className="flex flex-col gap-1 pt-1">
              {(d.botoes ?? []).length === 0 && <span className="italic">(sem botões)</span>}
              {(d.botoes ?? []).map((b) => (
                <span key={b.id} className="rounded-md bg-muted px-2 py-0.5 text-center text-[11px] text-foreground">
                  {b.label || "—"}
                </span>
              ))}
            </div>
          </div>
        )}
        {d.tipo === "payment_dlocal" && (
          <span className="line-clamp-2">{d.texto || "Gera link de pagamento via DLocal."}</span>
        )}
        {d.tipo === "external_link" && (
          <div className="space-y-0.5">
            <span className="line-clamp-2 text-foreground">{d.texto || "(sem mensagem)"}</span>
            {d.link_url && <span className="block truncate text-blue-500">{d.link_url}</span>}
            {!d.link_url && <span className="italic">(sem URL)</span>}
          </div>
        )}
        {d.tipo === "location_capture" && (
          <span className="line-clamp-2">{d.texto || "Solicita localização do cliente."}</span>
        )}
        {d.tipo === "captura" && (
          <div className="space-y-0.5">
            <span className="line-clamp-2 text-foreground">{d.texto || "(sem pergunta)"}</span>
            <span className="block text-indigo-500">
              {d.variavel ? `→ contexto.${d.variavel}` : "(variável não definida)"}
              {d.tipo_valor === "numero" ? ` (${d.min_valor ?? 1}–${d.max_valor ?? 99})` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Rótulos das ramificações: alinham visualmente cada botão ao seu handle. */}
      {ehRamificado(d) && (
        <div className="flex gap-1 border-t border-border px-3 pb-3 pt-1.5">
          {(d.botoes ?? []).map((b) => (
            <span key={b.id} className="flex-1 truncate text-center text-[10px] text-amber-600" title={b.label}>
              {b.label || "—"}
            </span>
          ))}
        </div>
      )}

      {/* Saídas (handles) — alinhadas ao motor: ramificado / terminal / linear. */}
      {ehRamificado(d) ? (
        (d.botoes ?? []).map((b, i, arr) => (
          <Handle
            key={b.id}
            id={b.id}
            type="source"
            position={Position.Bottom}
            title={b.label}
            style={{ left: `${((i + 1) / (arr.length + 1)) * 100}%` }}
            className="!size-3 !border-2 !border-card !bg-amber-500"
          />
        ))
      ) : ehTerminal(d.tipo) ? null : (
        <Handle type="source" position={Position.Bottom} className="!size-3 !border-2 !border-card !bg-primary" />
      )}
    </div>
  );
}

const nodeTypes = { noFluxo: NoCard };

/** Conjunto de tipos válidos derivado do META — único ponto de verdade. */
const TIPOS_VALIDOS = new Set(Object.keys(META));

function novoNo(tipo: FluxoNoTipo, i: number): NoFluxo {
  const data: FluxoNodeData =
    tipo === "botoes"
      ? { tipo, texto: "Escolha uma opção:", botoes: [{ id: `btn-${crypto.randomUUID().split("-")[0]}`, label: "Opção 1" }] }
      : tipo === "captura"
        ? { tipo, texto: "Quantas unidades?", variavel: "quantidade", tipo_valor: "numero", min_valor: 1, max_valor: 99 }
        : { tipo, texto: "" };
  return {
    id: crypto.randomUUID(),
    type: "noFluxo",
    position: { x: 120 + (i % 3) * 80, y: 80 + i * 70 },
    data: data as NoData,
  };
}

/** Serializa uma aresta no formato do validador Zod (descarta sujeira do React Flow). */
function serializarEdge(e: Edge) {
  const origem = e.data?.origemOpcaoId;
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    ...(typeof origem === "string" ? { data: { origemOpcaoId: origem } } : {}),
  };
}

export function FluxosClient({
  fluxos,
  produtos,
  canWrite,
}: {
  fluxos: FluxoRow[];
  produtos: ProdutoOpt[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const produtosMap = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const [editId, setEditId] = useState<string | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [nodes, setNodes] = useState<NoFluxo[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [addSeq, setAddSeq] = useState(0);
  const [modalImport, setModalImport] = useState(false);
  const [importTexto, setImportTexto] = useState("");
  const [importErro, setImportErro] = useState<string | null>(null);

  const fluxoAtual = editId && editId !== "novo" ? fluxos.find((f) => f.id === editId) : undefined;
  const selNode = nodes.find((n) => n.id === selId) ?? null;

  function abrir(f: FluxoRow) {
    setEditId(f.id);
    setNome(f.nome);
    setNodes((f.nodes ?? []).map((n) => ({ ...n, type: "noFluxo", data: n.data as NoData })));
    setEdges((f.edges ?? []).map((e) => ({ ...e, data: e.data ?? undefined })));
    setSelId(null);
    setErro(null);
  }
  function novoFluxo() {
    setEditId("novo");
    setNome("Novo fluxo");
    setNodes([novoNo("inicio", 0)]);
    setEdges([]);
    setSelId(null);
    setErro(null);
  }
  function fechar() {
    setEditId(null);
    setSelId(null);
  }

  const onNodesChange = useCallback(
    (changes: NodeChange<NoFluxo>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) => {
        // Mantém no máximo uma saída por handle (e por nó simples).
        const limpos = eds.filter((e) => {
          if (e.source !== conn.source) return true;
          return (e.sourceHandle ?? null) !== (conn.sourceHandle ?? null);
        });
        // Grava origemOpcaoId na aresta recém-criada: sourceHandle é o canônico
        // (lido pelo engine), e data.origemOpcaoId é o espelho explícito p/ backend/debug.
        return addEdge(conn, limpos).map((e) =>
          conn.sourceHandle &&
          e.source === conn.source &&
          (e.sourceHandle ?? null) === (conn.sourceHandle ?? null)
            ? { ...e, data: { ...(e.data ?? {}), origemOpcaoId: conn.sourceHandle } }
            : e,
        );
      });
    },
    [],
  );

  function addNo(tipo: FluxoNoTipo) {
    const n = novoNo(tipo, addSeq + 1);
    setAddSeq((s) => s + 1);
    setNodes((nds) => [...nds, n]);
    setSelId(n.id);
  }

  function patchSel(patch: Partial<FluxoNodeData>) {
    if (!selId) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selId ? { ...n, data: { ...(n.data as FluxoNodeData), ...patch } as NoData } : n)),
    );
  }

  function removerSel() {
    if (!selId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selId));
    setEdges((eds) => eds.filter((e) => e.source !== selId && e.target !== selId));
    setSelId(null);
  }

  // Botões do nó selecionado (tipo "botoes")
  function addBotao() {
    const d = selNode?.data as FluxoNodeData | undefined;
    if (!d) return;
    const atuais = d.botoes ?? [];
    if (atuais.length >= 3) return;
    patchSel({ botoes: [...atuais, { id: `btn-${crypto.randomUUID().split("-")[0]}`, label: `Opção ${atuais.length + 1}` }] });
  }
  function editBotao(id: string, label: string) {
    const d = selNode?.data as FluxoNodeData | undefined;
    patchSel({ botoes: (d?.botoes ?? []).map((b) => (b.id === id ? { ...b, label } : b)) });
  }
  function removerBotao(id: string) {
    const d = selNode?.data as FluxoNodeData | undefined;
    patchSel({ botoes: (d?.botoes ?? []).filter((b) => b.id !== id) });
    setEdges((eds) => eds.filter((e) => e.sourceHandle !== id));
  }

  function importarJSON() {
    try {
      const parsed = JSON.parse(importTexto) as { nodes?: unknown[]; edges?: unknown[] };
      const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
      const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];

      // Sanitiza cada nó: valida tipo, remove nulls, limpa botões, garante position numérica.
      const nosLimpos: NoFluxo[] = rawNodes.flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const n = raw as Record<string, unknown>;

        const pos = (n.position ?? {}) as Record<string, unknown>;
        const position = {
          x: typeof pos.x === "number" && isFinite(pos.x) ? pos.x : 0,
          y: typeof pos.y === "number" && isFinite(pos.y) ? pos.y : 0,
        };

        const rawData = (typeof n.data === "object" && n.data ? n.data : {}) as Record<string, unknown>;
        if (!TIPOS_VALIDOS.has(rawData.tipo as string)) return []; // tipo desconhecido → descarta

        const tipo = rawData.tipo as FluxoNoTipo;

        const botoes = Array.isArray(rawData.botoes)
          ? (rawData.botoes as unknown[])
              .filter((b): b is { id: string; label: string } =>
                !!b && typeof b === "object" &&
                typeof (b as Record<string, unknown>).id === "string" &&
                ((b as Record<string, unknown>).id as string).trim().length > 0 &&
                typeof (b as Record<string, unknown>).label === "string" &&
                ((b as Record<string, unknown>).label as string).trim().length > 0)
              .slice(0, 3)
              .map((b) => ({ id: b.id.trim(), label: b.label.trim() }))
          : undefined;

        // Apenas campos string não-nulos chegam ao Zod — null é o maior culpado de falhas.
        const data: FluxoNodeData = {
          tipo,
          ...(typeof rawData.texto === "string" ? { texto: rawData.texto } : {}),
          ...(typeof rawData.imagem_url === "string" ? { imagem_url: rawData.imagem_url } : {}),
          ...(typeof rawData.produto_id === "string" ? { produto_id: rawData.produto_id } : {}),
          ...(typeof rawData.link_url === "string" ? { link_url: rawData.link_url } : {}),
          ...(botoes !== undefined ? { botoes } : {}),
          // campos do nó "captura"
          ...(typeof rawData.variavel === "string" ? { variavel: rawData.variavel } : {}),
          ...(rawData.tipo_valor === "numero" || rawData.tipo_valor === "texto" ? { tipo_valor: rawData.tipo_valor } : {}),
          ...(typeof rawData.min_valor === "number" ? { min_valor: rawData.min_valor } : {}),
          ...(typeof rawData.max_valor === "number" ? { max_valor: rawData.max_valor } : {}),
          // flags dos nós "produto" e "botoes"
          ...(rawData.pede_quantidade === true ? { pede_quantidade: true } : {}),
          ...(typeof rawData.salvar_em_contexto === "string" ? { salvar_em_contexto: rawData.salvar_em_contexto } : {}),
        };

        return [{
          id: typeof n.id === "string" && n.id.trim() ? n.id.trim() : crypto.randomUUID(),
          type: "noFluxo" as const,
          position,
          data: data as NoData,
        }];
      });

      const arestasLimpas: Edge[] = rawEdges.flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const e = raw as Record<string, unknown>;
        const source = typeof e.source === "string" ? e.source.trim() : "";
        const target = typeof e.target === "string" ? e.target.trim() : "";
        if (!source || !target) return [];
        const eData = (typeof e.data === "object" && e.data ? e.data : {}) as Record<string, unknown>;
        const origemId = typeof eData.origemOpcaoId === "string" ? eData.origemOpcaoId : undefined;
        // sourceHandle: usa o explícito do JSON, cai em origemOpcaoId se ausente.
        // Sem sourceHandle, o engine não encontra a aresta saindo de um botão → loop.
        const sourceHandle = typeof e.sourceHandle === "string" ? e.sourceHandle : origemId;
        const origem = origemId ?? sourceHandle;
        return [{
          id: typeof e.id === "string" && e.id.trim() ? e.id.trim() : crypto.randomUUID(),
          source,
          target,
          sourceHandle,
          targetHandle: typeof e.targetHandle === "string" ? e.targetHandle : undefined,
          ...(origem ? { data: { origemOpcaoId: origem } } : {}),
        }];
      });

      if (nosLimpos.length === 0) {
        setImportErro("Nenhum nó válido encontrado. Verifique se 'nodes' contém tipos reconhecidos.");
        return;
      }

      setNodes(nosLimpos);
      setEdges(arestasLimpas);
      setSelId(null);
      setModalImport(false);
      setImportTexto("");
      setImportErro(null);
    } catch {
      setImportErro("JSON inválido. Verifique o formato e tente novamente.");
    }
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const payload = {
      id: editId && editId !== "novo" ? editId : undefined,
      nome,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data as FluxoNodeData,
      })),
      edges: edges.map(serializarEdge),
    };
    const res = await salvarFluxo(payload);
    setSalvando(false);
    if (!res.ok) {
      setErro(res.error);
      return;
    }
    if (editId === "novo" && res.id) setEditId(res.id);
    router.refresh();
  }

  /** Exporta nodes/edges no formato do validador Zod, sem sujeira do React Flow. */
  function exportarJSON() {
    const payload = {
      nome: nome || "fluxo",
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data as FluxoNodeData,
      })),
      edges: edges.map(serializarEdge),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fluxo-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function alternarAtivo() {
    if (!fluxoAtual) return;
    const res = fluxoAtual.ativo ? await desativarFluxo(fluxoAtual.id) : await ativarFluxo(fluxoAtual.id);
    if (!res.ok) setErro(res.error);
    else router.refresh();
  }

  async function excluir() {
    if (!fluxoAtual) return;
    if (!confirm(`Excluir o fluxo "${fluxoAtual.nome}"?`)) return;
    const res = await excluirFluxo(fluxoAtual.id);
    if (!res.ok) setErro(res.error);
    else {
      fechar();
      router.refresh();
    }
  }

  const PALETA: FluxoNoTipo[] = ["texto", "imagem", "botoes", "captura", "produto", "humano", "payment_dlocal", "external_link", "location_capture"];

  return (
    <div>
      <PageHeader
        title="Fluxos"
        description="Monte a conversa do bot no WhatsApp: texto, imagem, botões e produtos do catálogo."
        action={canWrite ? <Button onClick={novoFluxo}><Plus /> Novo fluxo</Button> : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Lista de fluxos */}
        <div className="space-y-2">
          {fluxos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhum fluxo ainda.
            </p>
          ) : (
            fluxos.map((f) => (
              <button
                key={f.id}
                onClick={() => abrir(f)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                  editId === f.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Workflow className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{f.nome}</span>
                </span>
                {f.ativo && <Badge variant="success">Ativo</Badge>}
              </button>
            ))
          )}
        </div>

        {/* Editor */}
        {editId === null ? (
          <EmptyState
            icon={<Workflow />}
            title="Selecione ou crie um fluxo"
            description="O fluxo ativo passa a responder automaticamente as mensagens recebidas no WhatsApp."
            action={canWrite ? <Button onClick={novoFluxo}><Plus /> Novo fluxo</Button> : undefined}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-card">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="h-9 max-w-xs"
                placeholder="Nome do fluxo"
                disabled={!canWrite}
              />
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {canWrite && (
                  <Button variant="outline" size="sm" onClick={() => setModalImport(true)}>
                    <FileUp /> Importar JSON
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={exportarJSON}>
                  <FileDown /> Exportar JSON
                </Button>
                {fluxoAtual && (
                  <Button variant={fluxoAtual.ativo ? "outline" : "default"} size="sm" onClick={alternarAtivo} disabled={!canWrite}>
                    {fluxoAtual.ativo ? <><PowerOff /> Desativar</> : <><Power /> Ativar</>}
                  </Button>
                )}
                <Button variant="default" size="sm" onClick={salvar} disabled={!canWrite || salvando}>
                  <Save /> {salvando ? "Salvando…" : "Salvar"}
                </Button>
                {fluxoAtual && (
                  <Button variant="ghost" size="icon" onClick={excluir} disabled={!canWrite} aria-label="Excluir">
                    <Trash2 />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={fechar} aria-label="Fechar"><X /></Button>
              </div>
            </div>

            {/* Paleta */}
            {canWrite && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                <span className="text-xs text-muted-foreground">Adicionar:</span>
                {PALETA.map((t) => {
                  const Icon = META[t].icon;
                  return (
                    <Button key={t} variant="outline" size="sm" onClick={() => addNo(t)}>
                      <Icon /> {META[t].label}
                    </Button>
                  );
                })}
              </div>
            )}

            {erro && <p className="border-b border-border px-3 py-2 text-sm text-destructive">{erro}</p>}

            <div className="grid lg:grid-cols-[1fr_280px]">
              {/* Canvas */}
              <div className="h-[60vh] min-h-80">
                <ProdutosCtx.Provider value={produtosMap}>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={(_, n) => setSelId(n.id)}
                    onPaneClick={() => setSelId(null)}
                    nodesConnectable={canWrite}
                    nodesDraggable={canWrite}
                    fitView
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                </ProdutosCtx.Provider>
              </div>

              {/* Inspetor */}
              <div className="border-t border-border p-3 lg:border-l lg:border-t-0">
                {!selNode ? (
                  <p className="text-sm text-muted-foreground">
                    Clique num nó para editar. Arraste das bolinhas para conectar os passos.
                  </p>
                ) : (
                  <NoInspector
                    node={selNode}
                    produtos={produtos}
                    canWrite={canWrite}
                    onPatch={patchSel}
                    onRemover={removerSel}
                    onAddBotao={addBotao}
                    onEditBotao={editBotao}
                    onRemoverBotao={removerBotao}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Importar JSON */}
      {modalImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Importar JSON</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setModalImport(false); setImportTexto(""); setImportErro(null); }}
                aria-label="Fechar"
              >
                <X />
              </Button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Cole o JSON do fluxo abaixo. Os nós e conexões atuais serão substituídos.
              </p>
              <Textarea
                value={importTexto}
                onChange={(e) => { setImportTexto(e.target.value); setImportErro(null); }}
                placeholder={'{"nodes": [...], "edges": [...]}'}
                className="h-48 font-mono text-xs"
              />
              {importErro && <p className="text-sm text-destructive">{importErro}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { setModalImport(false); setImportTexto(""); setImportErro(null); }}
              >
                Cancelar
              </Button>
              <Button onClick={importarJSON} disabled={!importTexto.trim()}>
                <FileUp /> Importar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoInspector({
  node,
  produtos,
  canWrite,
  onPatch,
  onRemover,
  onAddBotao,
  onEditBotao,
  onRemoverBotao,
}: {
  node: NoFluxo;
  produtos: ProdutoOpt[];
  canWrite: boolean;
  onPatch: (patch: Partial<FluxoNodeData>) => void;
  onRemover: () => void;
  onAddBotao: () => void;
  onEditBotao: (id: string, label: string) => void;
  onRemoverBotao: (id: string) => void;
}) {
  const d = node.data as FluxoNodeData;
  const meta = META[d.tipo];
  const Icon = meta.icon;
  const prod = d.produto_id ? produtos.find((p) => p.id === d.produto_id) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${meta.cor}`} />
        <span className="text-sm font-semibold">{meta.label}</span>
      </div>

      {d.tipo === "inicio" && (
        <p className="text-xs text-muted-foreground">
          Entrada do fluxo. Conecte-o ao primeiro passo. (Não envia mensagem.)
        </p>
      )}

      {d.tipo === "texto" && (
        <div className="space-y-1">
          <Label>Mensagem</Label>
          <Textarea
            value={d.texto ?? ""}
            onChange={(e) => onPatch({ texto: e.target.value })}
            placeholder="Texto enviado ao cliente"
            disabled={!canWrite}
          />
        </div>
      )}

      {d.tipo === "imagem" && (
        <>
          <div className="space-y-1">
            <Label>URL da imagem</Label>
            <Input
              value={d.imagem_url ?? ""}
              onChange={(e) => onPatch({ imagem_url: e.target.value })}
              placeholder="https://…"
              disabled={!canWrite}
            />
          </div>
          <div className="space-y-1">
            <Label>Legenda (opcional)</Label>
            <Textarea value={d.texto ?? ""} onChange={(e) => onPatch({ texto: e.target.value })} disabled={!canWrite} />
          </div>
        </>
      )}

      {d.tipo === "produto" && (
        <>
          <div className="space-y-1">
            <Label>Produto do catálogo</Label>
            <Select
              value={d.produto_id ?? ""}
              onChange={(e) => onPatch({ produto_id: e.target.value || undefined })}
              disabled={!canWrite}
            >
              <option value="">Selecione…</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Select>
          </div>
          {prod && (
            <div className="flex items-center gap-2 rounded-lg border border-border p-2">
              {prod.imagem_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={prod.imagem_url} alt={prod.nome} className="size-12 rounded object-cover" />
              ) : (
                <div className="flex size-12 items-center justify-center rounded bg-muted text-muted-foreground">
                  <ImageIcon className="size-4" />
                </div>
              )}
              <div className="text-xs">
                <p className="font-medium">{prod.nome}</p>
                <p className="text-muted-foreground">{gs(prod.preco_gs)}</p>
                {!prod.imagem_url && <p className="text-amber-600">Sem imagem no catálogo</p>}
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>Texto adicional (opcional)</Label>
            <Textarea value={d.texto ?? ""} onChange={(e) => onPatch({ texto: e.target.value })} disabled={!canWrite} />
          </div>
          <div className="space-y-1">
            <Label>Pede quantidade antes de adicionar ao carrinho?</Label>
            <Select
              value={d.pede_quantidade ? "true" : "false"}
              onChange={(e) => onPatch({ pede_quantidade: e.target.value === "true" || undefined })}
              disabled={!canWrite}
            >
              <option value="false">Não — adiciona com quantidade 1</option>
              <option value="true">Sim — funil Produto → Formato → Quantidade</option>
            </Select>
            {d.pede_quantidade && (
              <p className="text-xs text-indigo-600">Conecte este nó a um "Botões" (formato) e depois a um "Captura" (quantidade=&quot;quantidade&quot;).</p>
            )}
          </div>
        </>
      )}

      {d.tipo === "humano" && (
        <div className="space-y-1">
          <Label>Mensagem antes de transferir (opcional)</Label>
          <Textarea
            value={d.texto ?? ""}
            onChange={(e) => onPatch({ texto: e.target.value })}
            placeholder="Ex.: Um atendente vai te ajudar agora."
            disabled={!canWrite}
          />
          <p className="text-xs text-muted-foreground">Liga o handoff humano e pausa o bot nesta conversa.</p>
        </div>
      )}

      {d.tipo === "botoes" && (
        <>
          <div className="space-y-1">
            <Label>Pergunta</Label>
            <Textarea value={d.texto ?? ""} onChange={(e) => onPatch({ texto: e.target.value })} disabled={!canWrite} />
          </div>
          <div className="space-y-2">
            <Label>Botões (máx. 3)</Label>
            {(d.botoes ?? []).map((b: FluxoBotao) => (
              <div key={b.id} className="flex items-center gap-1">
                <Input value={b.label} onChange={(e) => onEditBotao(b.id, e.target.value)} disabled={!canWrite} className="h-9" />
                {canWrite && (
                  <Button variant="ghost" size="icon" onClick={() => onRemoverBotao(b.id)} aria-label="Remover botão">
                    <X />
                  </Button>
                )}
              </div>
            ))}
            {canWrite && (d.botoes ?? []).length < 3 && (
              <Button variant="outline" size="sm" onClick={onAddBotao}><Plus /> Botão</Button>
            )}
            <p className="text-xs text-muted-foreground">
              Cada botão tem uma saída própria — conecte ao passo correspondente.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Salvar escolha no contexto (opcional)</Label>
            <Input
              value={d.salvar_em_contexto ?? ""}
              onChange={(e) => onPatch({ salvar_em_contexto: e.target.value || undefined })}
              placeholder="ex: formato"
              disabled={!canWrite}
            />
            <p className="text-xs text-muted-foreground">
              Se preenchido, o label do botão clicado é salvo em contexto[chave]. Use <strong>formato</strong> para guardar Caixa/Unidade antes do nó Captura.
            </p>
          </div>
        </>
      )}

      {d.tipo === "payment_dlocal" && (
        <div className="space-y-1">
          <Label>Mensagem antes do pagamento (opcional)</Label>
          <Textarea
            value={d.texto ?? ""}
            onChange={(e) => onPatch({ texto: e.target.value })}
            placeholder="Ex.: Finalize seu pedido pelo link abaixo."
            disabled={!canWrite}
          />
          <p className="text-xs text-muted-foreground">
            Gera um link de pagamento via DLocal (cartão/Pix).
          </p>
        </div>
      )}

      {d.tipo === "external_link" && (
        <>
          <div className="space-y-1">
            <Label>URL do link</Label>
            <Input
              value={d.link_url ?? ""}
              onChange={(e) => onPatch({ link_url: e.target.value })}
              placeholder="https://…"
              disabled={!canWrite}
            />
          </div>
          <div className="space-y-1">
            <Label>Mensagem (opcional)</Label>
            <Textarea
              value={d.texto ?? ""}
              onChange={(e) => onPatch({ texto: e.target.value })}
              placeholder="Ex.: Acesse nosso cardápio completo:"
              disabled={!canWrite}
            />
          </div>
        </>
      )}

      {d.tipo === "location_capture" && (
        <div className="space-y-1">
          <Label>Mensagem de solicitação</Label>
          <Textarea
            value={d.texto ?? ""}
            onChange={(e) => onPatch({ texto: e.target.value })}
            placeholder="Ex.: Por favor, envie sua localização pelo WhatsApp."
            disabled={!canWrite}
          />
          <p className="text-xs text-muted-foreground">
            Solicita ao cliente que compartilhe a localização via WhatsApp.
          </p>
        </div>
      )}

      {d.tipo === "captura" && (
        <>
          <div className="space-y-1">
            <Label>Pergunta enviada ao cliente</Label>
            <Textarea
              value={d.texto ?? ""}
              onChange={(e) => onPatch({ texto: e.target.value })}
              placeholder="Ex.: Quantas unidades você quer?"
              disabled={!canWrite}
            />
          </div>
          <div className="space-y-1">
            <Label>Variável de destino</Label>
            <Input
              value={d.variavel ?? ""}
              onChange={(e) => onPatch({ variavel: e.target.value })}
              placeholder="quantidade"
              disabled={!canWrite}
            />
            <p className="text-xs text-muted-foreground">
              Salvo em contexto[variável]. Use <strong>quantidade</strong> para finalizar o carrinho automaticamente.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Tipo de valor esperado</Label>
            <Select
              value={d.tipo_valor ?? "numero"}
              onChange={(e) => onPatch({ tipo_valor: e.target.value as "numero" | "texto" })}
              disabled={!canWrite}
            >
              <option value="numero">Número inteiro (ex.: 3)</option>
              <option value="texto">Texto livre</option>
            </Select>
          </div>
          {(d.tipo_valor === "numero" || !d.tipo_valor) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Mínimo</Label>
                <Input
                  type="number"
                  value={d.min_valor ?? 1}
                  onChange={(e) => onPatch({ min_valor: Number(e.target.value) || 1 })}
                  disabled={!canWrite}
                />
              </div>
              <div className="space-y-1">
                <Label>Máximo</Label>
                <Input
                  type="number"
                  value={d.max_valor ?? 99}
                  onChange={(e) => onPatch({ max_valor: Number(e.target.value) || 99 })}
                  disabled={!canWrite}
                />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Aceita texto escrito: "quero três" → 3. O bot re-pergunta automaticamente se o valor for inválido.
          </p>
        </>
      )}

      {canWrite && d.tipo !== "inicio" && (
        <Button variant="ghost" size="sm" onClick={onRemover} className="text-destructive">
          <Trash2 /> Remover nó
        </Button>
      )}
    </div>
  );
}
