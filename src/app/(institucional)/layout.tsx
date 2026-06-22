import Link from "next/link";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function InstitucionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight hover:opacity-80">
            Yapa
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Entrar
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <LandingFooter />
    </div>
  );
}
