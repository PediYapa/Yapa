import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { ContactForm } from "@/components/landing/ContactForm";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">Yapa</span>
          <Link
            href="/login"
            className="rounded-xl border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pb-20 pt-24 text-center">
          <div className="inline-block rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Ciudad del Este · Paraguay
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            El delivery de bebidas<br />más rápido de CDE
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
            Pedí por WhatsApp y recibí en tu domicilio. Distribuidoras locales,
            entrega nocturna y pago seguro vía dLocal.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="https://wa.me/5950993555959"
              className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Pedir por WhatsApp
            </a>
            <a
              href="#contacto"
              className="rounded-xl border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              Contactarnos
            </a>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="bg-muted/30 py-16">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="text-center text-2xl font-semibold">¿Cómo funciona?</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {[
                { n: "01", title: "Pedí por WhatsApp", desc: "Mandá un mensaje con lo que querés. Nuestro sistema gestiona el pedido automáticamente." },
                { n: "02", title: "Te asignamos el depósito más cercano", desc: "El sistema geolocaliza tu dirección y elige la distribuidora más próxima para agilizar la entrega." },
                { n: "03", title: "Recibís en tu puerta", desc: "Tu pedido llega rápido. Pagá en efectivo o por link de pago seguro vía dLocal." },
              ].map((s) => (
                <div key={s.n} className="rounded-2xl border border-border bg-card p-6">
                  <span className="text-3xl font-semibold text-primary/40">{s.n}</span>
                  <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Información Legal */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold">Información de la empresa</h2>
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border bg-card p-6 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                { dt: "Razón social", dd: "Operación Persona Física" },
                { dt: "RUC", dd: "9373240-6" },
                { dt: "País de operación", dd: "Paraguay" },
                { dt: "Ciudad", dd: "Ciudad del Este" },
                { dt: "E-mail de contacto", dd: "contato@pediyapa.com" },
                { dt: "WhatsApp", dd: "+595 0993 555 959" },
                { dt: "Pasarela de pago", dd: "dLocal (certificada PCI-DSS)" },
                { dt: "Rubro", dd: "Delivery de bebidas (nocturno)" },
              ].map(({ dt, dd }) => (
                <div key={dt}>
                  <dt className="text-muted-foreground">{dt}</dt>
                  <dd className="mt-0.5 font-medium">{dd}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Formulário de Contato */}
        <section id="contacto" className="bg-muted/30 py-16">
          <div className="mx-auto max-w-xl px-6">
            <h2 className="text-center text-2xl font-semibold">Contacto</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Respondemos en menos de 24 horas.
            </p>
            <div className="mt-8 rounded-2xl border border-border bg-card p-6">
              <ContactForm />
            </div>
            <div className="mt-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <a href="mailto:contato@pediyapa.com" className="hover:text-foreground">
                contato@pediyapa.com
              </a>
              <a href="https://wa.me/5950993555959" className="hover:text-foreground">
                WhatsApp: +595 0993 555 959
              </a>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
