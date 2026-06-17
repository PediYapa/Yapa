"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import type { EntregaStatus, EntregadorRow } from "@/lib/database.types";
import { atribuirEntregador, mudarStatusEntrega } from "@/app/actions/despacho";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type EntregadorMini = Pick<EntregadorRow, "id" | "nome" | "telefone" | "ativo">;

/** Próximo passo do fluxo feliz a partir do status atual. */
const PROXIMO: Partial<Record<EntregaStatus, { alvo: EntregaStatus; label: string }>> = {
  aguardando: { alvo: "coletado", label: "Coletar" },
  coletado: { alvo: "em_entrega", label: "Sair p/ entrega" },
  em_entrega: { alvo: "entregue", label: "Confirmar entrega" },
};

const FINAIS: EntregaStatus[] = ["entregue", "cancelada"];

export function DespachoClient({
  entregaId,
  status,
  entregadorId,
  entregadores,
}: {
  entregaId: string;
  status: EntregaStatus;
  entregadorId: string | null;
  entregadores: EntregadorMini[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function atribuir(novoId: string) {
    setErro(null);
    startTransition(async () => {
      const res = await atribuirEntregador(entregaId, novoId || null);
      if (!res.ok) return setErro(res.error);
      router.refresh();
    });
  }

  function avancar(novo: EntregaStatus) {
    setErro(null);
    startTransition(async () => {
      const res = await mudarStatusEntrega(entregaId, novo);
      if (!res.ok) return setErro(res.error);
      router.refresh();
    });
  }

  const proximo = PROXIMO[status];
  const encerrada = FINAIS.includes(status);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="h-9 w-44 text-xs"
          value={entregadorId ?? ""}
          disabled={pending || encerrada}
          onChange={(e) => atribuir(e.target.value)}
          aria-label="Atribuir entregador"
        >
          <option value="">Sem entregador</option>
          {entregadores.map((ent) => (
            <option key={ent.id} value={ent.id} disabled={!ent.ativo}>
              {ent.nome}
              {ent.ativo ? "" : " (inativo)"}
            </option>
          ))}
        </Select>

        {proximo && (
          <Button
            size="sm"
            variant="accent"
            disabled={pending}
            onClick={() => avancar(proximo.alvo)}
          >
            <Check /> {proximo.label}
          </Button>
        )}

        {!encerrada && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            disabled={pending}
            onClick={() => avancar("cancelada")}
          >
            <X /> Cancelar
          </Button>
        )}
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
