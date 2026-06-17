"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, KeyRound, Trash2, Copy } from "lucide-react";
import type { ApiTokenRow } from "@/lib/database.types";
import { TOKEN_SCOPES } from "@/lib/token-scopes";
import { criarToken, revogarToken, type CriarTokenResult } from "@/app/actions/tokens";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dataHoraBR } from "@/lib/format";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Gerando…" : "Gerar token"}</Button>;
}

export function TokensClient({ rows, canWrite }: { rows: ApiTokenRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [state, formAction] = useActionState<CriarTokenResult | undefined, FormData>(criarToken, undefined);

  useEffect(() => {
    if (state?.ok) {
      setPlaintext(state.plaintext);
      setAberto(false);
      router.refresh();
    }
  }, [state, router]);

  async function revogar(t: ApiTokenRow) {
    if (!confirm(`Revogar o token "${t.nome}"? As integrações que o usam deixarão de funcionar.`)) return;
    await revogarToken(t.id);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="API Tokens"
        description="Credenciais para integrações (Make, automações) acessarem a API do Yapa."
        action={canWrite ? <Button onClick={() => setAberto(true)}><Plus /> Novo token</Button> : undefined}
      />

      {plaintext && (
        <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-sm font-medium text-foreground">Token gerado com sucesso</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Guarde agora, não será exibido de novo.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm">
              {plaintext}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar"
              onClick={() => navigator.clipboard?.writeText(plaintext)}
            >
              <Copy />
            </Button>
          </div>
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={() => setPlaintext(null)}>Entendi, ocultar</Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<KeyRound />}
          title="Nenhum token"
          description="Gere um token para conectar integrações externas à API do Yapa."
          action={canWrite ? <Button onClick={() => setAberto(true)}><Plus /> Novo token</Button> : undefined}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Prefixo</TableHead>
                <TableHead>Escopos</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => {
                const revogado = t.revogado_em != null;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell className="font-mono text-xs">{t.prefixo}…</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {t.scopes
                          .split(",")
                          .filter(Boolean)
                          .map((s) => (
                            <Badge key={s} variant="outline">{s}</Badge>
                          ))}
                      </div>
                    </TableCell>
                    <TableCell>{dataHoraBR(t.ultimo_uso)}</TableCell>
                    <TableCell>
                      {revogado ? (
                        <Badge variant="destructive">Revogado</Badge>
                      ) : (
                        <Badge variant="success">Ativo</Badge>
                      )}
                    </TableCell>
                    <TableCell>{dataHoraBR(t.created_at)}</TableCell>
                    <TableCell>
                      {canWrite && !revogado && (
                        <div className="flex justify-end">
                          <Button variant="ghost" size="icon" aria-label="Revogar" onClick={() => revogar(t)}>
                            <Trash2 />
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

      <Dialog open={aberto} onClose={() => setAberto(false)} title="Novo token de API">
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" name="nome" required placeholder="Ex.: Integração Make" />
          </div>
          <div className="space-y-2">
            <Label>Escopos</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {TOKEN_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="scopes" value={s} className="size-4 rounded border-input" />
                  <span className="font-mono text-xs">{s}</span>
                </label>
              ))}
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
