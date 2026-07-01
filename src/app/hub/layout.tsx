import type { Metadata } from "next";
import { Package } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "Yapa Partners — Estoque",
  description: "Portal de gestão de estoque para hubs parceiros Yapa.",
};

/**
 * Layout isolado do portal de parceiros. Dark mode estrito, acento Amarelo Yapa
 * (#FFCC00), tipografia grande e área central estreita — pensado para bodegas
 * (celular/tablet). Não usa o app-shell administrativo.
 */
export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#FFCC00] text-neutral-950">
              <Package className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="text-base font-bold">
                Yapa <span className="text-[#FFCC00]">Partners</span>
              </p>
              <p className="text-[11px] text-neutral-400">Gestão de estoque</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
