"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import type { UserProfileRow, UserRole } from "@/lib/database.types";
import { mudarPapel, alternarAtivo } from "@/app/actions/usuarios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dataBR } from "@/lib/format";

const PAPEL_META: Record<UserRole, { label: string; variant: "primary" | "accent" | "outline" }> = {
  owner: { label: "Owner", variant: "primary" },
  gerente: { label: "Gerente", variant: "accent" },
  operador: { label: "Operador", variant: "outline" },
};

export function UsuariosClient({
  rows,
  canWrite,
  meuId,
}: {
  rows: UserProfileRow[];
  canWrite: boolean;
  meuId: string;
}) {
  const router = useRouter();
  const [pendente, setPendente] = useState<string | null>(null);

  async function trocarPapel(u: UserProfileRow, role: UserRole) {
    if (role === u.role) return;
    setPendente(u.id);
    await mudarPapel(u.id, role);
    setPendente(null);
    router.refresh();
  }

  async function alternar(u: UserProfileRow) {
    const ativo = u.deactivated_at == null;
    const verbo = ativo ? "Desativar" : "Ativar";
    if (!confirm(`${verbo} o usuário ${u.nome}?`)) return;
    setPendente(u.id);
    await alternarAtivo(u.id, !ativo);
    setPendente(null);
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="Nenhum usuário"
        description="Os perfis de usuário aparecem aqui após o cadastro no sistema."
      />
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Criado</TableHead>
            <TableHead className="w-40"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((u) => {
            const ativo = u.deactivated_at == null;
            const meta = PAPEL_META[u.role];
            const ehEu = u.id === meuId;
            return (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}{ehEu && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}</TableCell>
                <TableCell>
                  {canWrite && !ehEu ? (
                    <Select
                      value={u.role}
                      disabled={pendente === u.id}
                      onChange={(e) => trocarPapel(u, e.target.value as UserRole)}
                      className="h-8 w-36 text-xs"
                    >
                      <option value="owner">Owner</option>
                      <option value="gerente">Gerente</option>
                      <option value="operador">Operador</option>
                    </Select>
                  ) : (
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {ativo ? (
                    <Badge variant="success">Ativo</Badge>
                  ) : (
                    <Badge variant="destructive">Desativado</Badge>
                  )}
                </TableCell>
                <TableCell>{dataBR(u.created_at)}</TableCell>
                <TableCell>
                  {canWrite && !ehEu && (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant={ativo ? "outline" : "default"}
                        disabled={pendente === u.id}
                        onClick={() => alternar(u)}
                      >
                        {ativo ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
