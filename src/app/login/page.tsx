import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { YapaLogo } from "@/components/yapa-logo";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Painel de marca */}
      <section className="wave-divider relative hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <YapaLogo className="text-primary-foreground [&_*]:text-primary-foreground" />
        <div className="space-y-4">
          <h1 className="font-display text-4xl font-semibold leading-tight">
            Todo o delivery,<br />no seu controle.
          </h1>
          <p className="max-w-md text-primary-foreground/80">
            Pedidos, entregas, entregadores, distribuidoras e financeiro — a operação do Yapa
            em Ciudad del Este, num só lugar.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">Yapa · Delivery de bebidas · Paraguai</p>
      </section>

      {/* Formulário */}
      <section className="flex flex-col items-center justify-center px-6 py-10 sm:p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <YapaLogo />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-semibold">Entrar</h2>
            <p className="text-sm text-muted-foreground">Acesse o painel de gestão do Yapa.</p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
