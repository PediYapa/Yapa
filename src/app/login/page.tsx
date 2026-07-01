import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Painel de marca — Amarelo Yapa + preto */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#FFCC00] p-12 lg:flex">
        {/* Decoração */}
        <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-black/5" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full bg-black/5" />

        {/* Logo */}
        <div className="relative flex flex-col leading-none">
          <span className="text-3xl font-black tracking-tight text-black">PediYapa</span>
          <span className="mt-0.5 text-xs font-bold uppercase tracking-widest text-black/50">Bebidas a un toque</span>
        </div>

        {/* Copy central */}
        <div className="relative space-y-4">
          <h1 className="text-4xl font-black leading-tight tracking-tight text-black">
            Todo o delivery,<br />no seu controle.
          </h1>
          <p className="max-w-md font-medium text-black/60">
            Pedidos, entregas, distribuidoras e financeiro —
            a operação do Yapa em Ciudad del Este, num só lugar.
          </p>
        </div>

        <p className="relative text-sm font-semibold text-black/40">
          Yapa · Delivery de bebidas · Paraguai
        </p>
      </section>

      {/* Formulário */}
      <section className="flex flex-col items-center justify-center bg-neutral-950 px-6 py-10 sm:p-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo mobile */}
          <div className="lg:hidden flex flex-col leading-none">
            <span className="text-2xl font-black tracking-tight text-[#FFCC00]">PediYapa</span>
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Bebidas a un toque</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white">Entrar</h2>
            <p className="text-sm text-neutral-400">Acesse o painel de gestão do Yapa.</p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
