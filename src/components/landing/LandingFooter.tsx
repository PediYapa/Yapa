import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <span className="text-base font-semibold text-foreground">Yapa Delivery</span>
            <p className="mt-2 text-sm text-muted-foreground">
              Delivery de bebidas en Ciudad del Este, Paraguay.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Operado bajo RUC 9373240-6</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Políticas</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/terminos" className="text-muted-foreground transition-colors hover:text-foreground">
                  Términos y Condiciones
                </Link>
              </li>
              <li>
                <Link href="/privacidad" className="text-muted-foreground transition-colors hover:text-foreground">
                  Política de Privacidad
                </Link>
              </li>
              <li>
                <Link href="/reembolsos" className="text-muted-foreground transition-colors hover:text-foreground">
                  Política de Reembolso
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Contacto</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a
                  href="mailto:contato@pediyapa.com"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  contato@pediyapa.com
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/5950993555959"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  +595 0993 555 959
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Yapa Delivery — Ciudad del Este, Paraguay. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
