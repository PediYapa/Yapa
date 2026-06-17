"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { requestPasswordResetAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YapaLogo } from "@/components/yapa-logo";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending} size="lg">
      {pending ? "Enviando…" : "Enviar link de recuperação"}
    </Button>
  );
}

export default function RecuperarSenhaPage() {
  const [state, formAction] = useActionState<AuthState, FormData>(requestPasswordResetAction, undefined);
  const sent = state !== undefined && !state?.error;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <YapaLogo />
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground">
            Enviaremos um link para redefinir sua senha.
          </p>
        </div>

        {sent ? (
          <p className="rounded-lg bg-success/10 px-3 py-3 text-sm text-success">
            Se o e-mail existir, o link de recuperação foi enviado. Confira sua caixa de entrada.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" required placeholder="voce@yapa.com.py" />
            </div>
            <SubmitButton />
          </form>
        )}

        <Link href="/login" className="block text-sm text-primary hover:underline">
          ← Voltar para o login
        </Link>
      </div>
    </main>
  );
}
