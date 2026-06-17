"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { gs } from "@/lib/format";
import { abaterSaldoD1 } from "@/app/actions/financeiro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type DistribuidoraSaldo = {
  id: string;
  nome: string;
  saldo_d1_gs: number;
};

export function FinanceiroClient({
  distribuidoras,
  canWrite,
}: {
  distribuidoras: DistribuidoraSaldo[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pendente, setPendente] = useState<string | null>(null);

  async function abater(d: DistribuidoraSaldo) {
    if (!confirm(`Confirmar o abate de ${gs(d.saldo_d1_gs)} em dinheiro de ${d.nome}?`)) return;
    setPendente(d.id);
    await abaterSaldoD1(d.id);
    setPendente(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Controle D+1 — dinheiro por distribuidora</CardTitle>
      </CardHeader>
      <CardContent>
        {distribuidoras.length === 0 ? (
          <EmptyState
            icon={<Wallet />}
            title="Nada a abater"
            description="Quando uma distribuidora receber pedidos em dinheiro, o saldo a acertar aparece aqui."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Distribuidora</TableHead>
                <TableHead className="text-right">Saldo a abater</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {distribuidoras.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{gs(d.saldo_d1_gs)}</TableCell>
                  <TableCell>
                    {canWrite && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pendente === d.id}
                          onClick={() => abater(d)}
                        >
                          {pendente === d.id ? "Abatendo…" : "Abater saldo"}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
