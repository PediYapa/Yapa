"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Route, MapPin, Wallet, KeyRound } from "lucide-react";
import type { PedidoRow, DistribuidoraRow, PedidoStatus, FormaPagamento } from "@/lib/database.types";
import {
  mudarStatus,
  rotearPedido,
  atribuirDistribuidora,
  registrarPagamento,
  gerarCodigo,
} from "@/app/actions/pedidos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PEDIDO_STATUS_META, PEDIDO_TRANSICOES, proximoStatus } from "@/lib/intel/status";

const FORMAS: { value: FormaPagamento; label: string }[] = [
  { value: "dlocal", label: "dLocal" },
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
];

// Status a partir dos quais faz sentido rotear (definir distribuidora).
const PODE_ROTEAR: PedidoStatus[] = ["pago", "quebra"];

export function PedidoAcoes({
  pedido,
  distribuidoras,
}: {
  pedido: PedidoRow;
  distribuidoras: DistribuidoraRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const transicoes = PEDIDO_TRANSICOES[pedido.status];
  const proximo = proximoStatus(pedido.status);
  const ativas = distribuidoras.filter((d) => d.ativo);

  const [statusAlvo, setStatusAlvo] = useState<PedidoStatus | "">("");
  const [distSel, setDistSel] = useState<string>(pedido.distribuidora_id ?? "");
  const [forma, setForma] = useState<FormaPagamento>("dlocal");
  const [distPagamento, setDistPagamento] = useState<string>("");

  function run(fn: () => Promise<{ ok: boolean; error?: string } | { ok: true; id?: string }>) {
    setErro(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErro("error" in res ? res.error ?? "Erro" : "Erro");
      else router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Status */}
      <div className="space-y-2">
        <Label>Status</Label>
        {proximo && transicoes.includes(proximo) && (
          <Button
            className="w-full"
            disabled={pending}
            onClick={() => run(() => mudarStatus(pedido.id, proximo))}
          >
            <ArrowRight /> Avançar para {PEDIDO_STATUS_META[proximo].label}
          </Button>
        )}
        {transicoes.length > 0 ? (
          <div className="flex gap-2">
            <Select
              value={statusAlvo}
              onChange={(e) => setStatusAlvo(e.target.value as PedidoStatus | "")}
            >
              <option value="">Mudar para…</option>
              {transicoes.map((s) => (
                <option key={s} value={s}>{PEDIDO_STATUS_META[s].label}</option>
              ))}
            </Select>
            <Button
              variant="outline"
              disabled={pending || !statusAlvo}
              onClick={() => statusAlvo && run(() => mudarStatus(pedido.id, statusAlvo))}
            >
              Aplicar
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sem transições disponíveis neste status.</p>
        )}
      </div>

      {/* Roteamento */}
      <div className="space-y-2 border-t border-border pt-4">
        <Label>Distribuidora</Label>
        {PODE_ROTEAR.includes(pedido.status) && (
          <Button
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => run(() => rotearPedido(pedido.id))}
          >
            <Route /> Rotear automaticamente
          </Button>
        )}
        <div className="flex gap-2">
          <Select value={distSel} onChange={(e) => setDistSel(e.target.value)}>
            <option value="">Selecionar…</option>
            {ativas.map((d) => (
              <option key={d.id} value={d.id}>{d.nome}</option>
            ))}
          </Select>
          <Button
            variant="outline"
            disabled={pending || !distSel}
            onClick={() => distSel && run(() => atribuirDistribuidora(pedido.id, distSel))}
          >
            <MapPin /> Atribuir
          </Button>
        </div>
      </div>

      {/* Pagamento */}
      <div className="space-y-2 border-t border-border pt-4">
        <Label>Registrar pagamento</Label>
        <Select value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
          {FORMAS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </Select>
        {forma === "dinheiro" && (
          <Select value={distPagamento} onChange={(e) => setDistPagamento(e.target.value)}>
            <option value="">Quem recebeu o dinheiro…</option>
            {ativas.map((d) => (
              <option key={d.id} value={d.id}>{d.nome}</option>
            ))}
          </Select>
        )}
        <Button
          variant="outline"
          className="w-full"
          disabled={pending || (forma === "dinheiro" && !distPagamento)}
          onClick={() =>
            run(() =>
              registrarPagamento(pedido.id, forma, forma === "dinheiro" ? distPagamento : undefined),
            )
          }
        >
          <Wallet /> Registrar pagamento
        </Button>
      </div>

      {/* Código de validação */}
      <div className="space-y-2 border-t border-border pt-4">
        <Button
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={() => run(() => gerarCodigo(pedido.id))}
        >
          <KeyRound /> {pedido.codigo_validacao ? "Gerar novo código" : "Gerar código de validação"}
        </Button>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
