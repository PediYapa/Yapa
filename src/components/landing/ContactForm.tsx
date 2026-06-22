"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { enviarContato } from "@/app/actions/contatos";
import type { ActionResult } from "@/lib/auth/guard";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Enviando…" : "Enviar mensaje"}
    </button>
  );
}

export function ContactForm() {
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(
    enviarContato,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="cf-nome" className="block text-sm font-medium text-foreground">
          Nome completo
        </label>
        <input
          id="cf-nome"
          name="nome"
          type="text"
          required
          autoComplete="name"
          placeholder="Seu nome"
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cf-email" className="block text-sm font-medium text-foreground">
          E-mail
        </label>
        <input
          id="cf-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="seu@email.com"
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cf-mensagem" className="block text-sm font-medium text-foreground">
          Mensagem
        </label>
        <textarea
          id="cf-mensagem"
          name="mensagem"
          required
          rows={4}
          placeholder="Como podemos ajudar?"
          className="w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {state && (
        <p className={`text-sm ${state.ok ? "text-green-600" : "text-destructive"}`}>
          {state.ok ? "¡Mensaje enviado! Nos pondremos en contacto pronto." : state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
