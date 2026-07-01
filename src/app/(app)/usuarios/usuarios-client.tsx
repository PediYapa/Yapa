"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import type { UserProfileRow, UserRole } from "@/lib/database.types";
import { criarUsuario, mudarPapel, alternarAtivo } from "@/app/actions/usuarios";
import type { ActionResult } from "@/lib/auth/guard";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dataBR } from "@/lib/format";

const PAPEL_META: Record<UserRole, { label: string; variant: "primary" | "accent" | "outline" }> = {
  owner: { label: "Owner", variant: "primary" },
  gerente: { label: "Gerente", variant: "accent" },
  operador: { label: "Operador", variant: "outline" },
  hub: { label: "Hub (parceiro)", variant: "outline" },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Criando…" : "Criar usuário"}
    </Button>
  );
}

export function UsuariosClient({
  rows,
  emails,
  canWrite,
  meuId,
}: {
  rows: UserProfileRow[];
  emails: Record<string, string>;
  canWrite: boolean;
  meuId: string;
}) {
  const router = useRouter();
  const [pendente, setPendente] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(
    criarUsuario,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      setAberto(false);
      router.refresh();
    }
  }, [state, router]);

  async function trocarPapel(u: UserProfileRow, role: UserRole) {
    if (role === u.role) return;
    setPendente(u.id);
    await mudarPapel(u.id, role);
    setPendente(null);
    router.refresh();
  }

  async function alternar(u: UserProfileRow) {
    const ativo = u.deactivated_at == null;
    if (!confirm(`${ativo ? "Desativar" : "Ativar"} o usuário ${u.nome}?`)) return;
    setPendente(u.id);
    await alternarAtivo(u.id, !ativo);
    setPendente(null);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Equipe com acesso ao painel do Yapa."
        action={
          canWrite ? (
            <Button onClick={() => setAberto(true)}>
              <Plus /> Novo usuário
            </Button>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Nenhum usuário"
          description="Os perfis de usuário aparecem aqui após o cadastro no sistema."
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-36"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => {
                const ativo = u.deactivated_at == null;
                const meta = PAPEL_META[u.role];
                const ehEu = u.id === meuId;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.nome}
                      {ehEu && (
                        <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {emails[u.id] ?? "—"}
                    </TableCell>
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
      )}

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title="Novo usuário"
        description="Cria um acesso ao painel. O usuário já entra com o e-mail e a senha definidos aqui."
      >
        <form action={formAction} className="flex flex-col gap-4">
          {state && !state.ok && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="nu-nome">Nome completo</Label>
            <Input id="nu-nome" name="nome" placeholder="Ex.: Ana Souza" required />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nu-email">E-mail</Label>
            <Input
              id="nu-email"
              name="email"
              type="email"
              placeholder="ana@pediyapa.com"
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nu-senha">Senha temporária</Label>
            <Input
              id="nu-senha"
              name="senha"
              type="password"
              placeholder="Mínimo 8 caracteres"
              minLength={8}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nu-role">Papel</Label>
            <Select id="nu-role" name="role" defaultValue="operador">
              <option value="gerente">Gerente — acesso completo</option>
              <option value="operador">Operador — acesso restrito por módulo</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <SubmitButton />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
