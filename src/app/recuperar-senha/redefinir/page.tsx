"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YapaLogo } from "@/components/yapa-logo";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) return setErro("A senha deve ter ao menos 8 caracteres.");
    if (senha !== confirma) return setErro("As senhas não coincidem.");

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) return setErro("Não foi possível redefinir. Solicite um novo link.");
    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-8">
        <YapaLogo />
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold">Nova senha</h1>
          <p className="text-sm text-muted-foreground">Defina uma nova senha de acesso.</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="senha">Nova senha</Label>
            <Input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirma">Confirmar senha</Label>
            <Input id="confirma" type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
          </div>
          {erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </div>
      </form>
    </main>
  );
}
