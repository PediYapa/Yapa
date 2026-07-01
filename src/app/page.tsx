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
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex flex-col leading-none">
            <span className="text-xl font-black tracking-tight text-[#FFCC00]">PediYapa</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Bebidas a un toque</span>
          </div>
          <Link
            href="/login"
            className="rounded-xl border border-neutral-700 px-4 py-1.5 text-sm font-semibold text-neutral-200 transition-colors hover:border-[#FFCC00] hover:text-[#FFCC00]"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero — fundo amarelo, texto preto, identidade máxima */}
        <section className="relative overflow-hidden bg-[#FFCC00] px-6 pb-24 pt-20 text-center">
          {/* Decoração sutil */}
          <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-black/5" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 size-40 rounded-full bg-black/5" />

          <div className="relative mx-auto max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-black/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-black/70">
              🍺 Ciudad del Este · Paraguay
            </div>
            <h1 className="mt-5 text-5xl font-black leading-[1.05] tracking-tight text-black sm:text-6xl lg:text-7xl">
              Bebidas a<br />
              <span className="italic">un toque.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-base font-medium text-black/70 sm:text-lg">
              Pedí por WhatsApp y recibí en tu domicilio. Distribuidoras locales,
              entrega nocturna y pago seguro.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="https://wa.me/5950993555959"
                className="inline-flex items-center gap-2 rounded-2xl bg-black px-7 py-3.5 text-base font-bold text-[#FFCC00] shadow-lg transition-transform hover:scale-105"
              >
                <WhatsAppIcon />
                Pedir por WhatsApp
              </a>
              <a
                href="#contacto"
                className="rounded-2xl border-2 border-black/30 px-7 py-3.5 text-base font-bold text-black transition-colors hover:border-black hover:bg-black/10"
              >
                Contactarnos
              </a>
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="py-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-[#FFCC00]">Simple y rápido</span>
              <h2 className="mt-2 text-3xl font-black text-white">¿Cómo funciona?</h2>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {[
                {
                  n: "01",
                  title: "Pedí por WhatsApp",
                  desc: "Mandá un mensaje con lo que querés. Nuestro bot gestiona tu pedido automáticamente, sin apps ni registros.",
                },
                {
                  n: "02",
                  title: "Te asignamos el depósito más cercano",
                  desc: "El sistema geolocaliza tu dirección y elige la distribuidora más próxima para agilizar la entrega.",
                },
                {
                  n: "03",
                  title: "Recibís en tu puerta",
                  desc: "Tu pedido llega rápido. Pagá en efectivo o por link de pago seguro vía dLocal (PIX o tarjeta).",
                },
              ].map((s) => (
                <div key={s.n} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
                  <span className="text-4xl font-black text-[#FFCC00]/30">{s.n}</span>
                  <h3 className="mt-3 text-base font-bold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Por qué PediYapa */}
        <section className="bg-neutral-900 py-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-[#FFCC00]">Ventajas</span>
              <h2 className="mt-2 text-3xl font-black text-white">Por qué elegir PediYapa</h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: "🌙", title: "Entrega nocturna", desc: "Disponible hasta tarde, cuando más lo necesitás." },
                { icon: "📍", title: "Geo-routing", desc: "Siempre el depósito más cercano a vos." },
                { icon: "💳", title: "Pago seguro", desc: "PIX, tarjeta o efectivo — vía dLocal certificada." },
                { icon: "🤖", title: "Bot inteligente", desc: "Pedido listo en segundos, sin apps ni cuentas." },
              ].map((f) => (
                <div key={f.title} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
                  <span className="text-2xl">{f.icon}</span>
                  <h3 className="mt-3 font-bold text-white">{f.title}</h3>
                  <p className="mt-1 text-sm text-neutral-400">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA de fechar */}
        <section className="bg-[#FFCC00] py-16 text-center">
          <div className="mx-auto max-w-xl px-6">
            <h2 className="text-3xl font-black text-black">¿Listo para pedir?</h2>
            <p className="mt-2 font-medium text-black/70">Mandá un "Hola" por WhatsApp y empezá ahora.</p>
            <a
              href="https://wa.me/5950993555959"
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-black px-8 py-4 text-base font-bold text-[#FFCC00] shadow-lg transition-transform hover:scale-105"
            >
              <WhatsAppIcon />
              Pedir ahora
            </a>
          </div>
        </section>

        {/* Información Legal */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-black text-white">Información de la empresa</h2>
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-sm">
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
                  <dt className="text-neutral-400">{dt}</dt>
                  <dd className="mt-0.5 font-semibold text-white">{dd}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Formulário de Contato */}
        <section id="contacto" className="bg-neutral-900 py-16">
          <div className="mx-auto max-w-xl px-6">
            <h2 className="text-center text-2xl font-black text-white">Contacto</h2>
            <p className="mt-2 text-center text-sm text-neutral-400">
              Respondemos en menos de 24 horas.
            </p>
            <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
              <ContactForm />
            </div>
            <div className="mt-6 flex flex-col items-center gap-2 text-sm text-neutral-500">
              <a href="mailto:contato@pediyapa.com" className="hover:text-[#FFCC00]">
                contato@pediyapa.com
              </a>
              <a href="https://wa.me/5950993555959" className="hover:text-[#FFCC00]">
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

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
