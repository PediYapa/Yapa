export const metadata = { title: "Política de Privacidad — Yapa Delivery" };

export default function PrivacidadPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-muted-foreground">Última actualización: junio de 2025</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="text-lg font-semibold">1. Responsable del Tratamiento</h2>
          <p className="mt-3 text-muted-foreground">
            Yapa Delivery, operado como Persona Física bajo el RUC 9373240-6, con sede en Ciudad del
            Este, Paraguay, es el responsable del tratamiento de los datos personales recabados a
            través de sus canales de atención.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Datos que Recopilamos</h2>
          <p className="mt-3 text-muted-foreground">Para prestar el servicio de delivery, recopilamos únicamente:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li><strong>Nombre completo</strong> — para identificar al cliente.</li>
            <li><strong>Número de teléfono (WhatsApp)</strong> — canal principal de comunicación y entrega.</li>
            <li><strong>Dirección o Pin de ubicación</strong> — para coordinar la entrega a domicilio.</li>
            <li><strong>Historial de pedidos</strong> — para mejorar la experiencia y gestionar garantías.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Datos que NO Recopilamos</h2>
          <p className="mt-3 text-muted-foreground">
            Yapa <strong>no almacena ni procesa datos de tarjeta de crédito o débito</strong>. Toda
            transacción con tarjeta o Pix se realiza exclusivamente en el entorno seguro del gateway
            de pagos <strong>dLocal</strong>, que cuenta con certificación PCI-DSS Nivel 1. Yapa
            únicamente recibe la confirmación de pago (aprobado/rechazado), nunca los datos
            financieros del cliente.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Finalidad del Tratamiento</h2>
          <p className="mt-3 text-muted-foreground">Los datos recopilados se utilizan exclusivamente para:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Procesar y entregar los pedidos solicitados.</li>
            <li>Comunicar el estado del pedido en tiempo real.</li>
            <li>Mejorar la asignación logística y el tiempo de entrega.</li>
            <li>Cumplir con obligaciones legales y fiscales vigentes en Paraguay.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Base Legal</h2>
          <p className="mt-3 text-muted-foreground">
            El tratamiento de datos se basa en la ejecución del contrato de delivery entre Yapa y el
            cliente, conforme a la Ley N.° 6534/2020 de Protección de Datos Personales de Paraguay.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Compartición de Datos</h2>
          <p className="mt-3 text-muted-foreground">
            Los datos del cliente se comparten únicamente con la distribuidora local asignada para
            efectuar la entrega, y con dLocal para el procesamiento de pagos. No vendemos, cedemos
            ni transferimos datos personales a terceros con fines comerciales o publicitarios.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">7. Seguridad</h2>
          <p className="mt-3 text-muted-foreground">
            Los datos se almacenan en servidores seguros gestionados por Supabase (infraestructura
            AWS), con cifrado en tránsito (TLS) y en reposo. El acceso está restringido al personal
            autorizado de Yapa mediante autenticación de dos factores.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">8. Derechos del Titular</h2>
          <p className="mt-3 text-muted-foreground">
            El cliente puede ejercer sus derechos de acceso, rectificación, supresión y oposición al
            tratamiento de sus datos enviando una solicitud a{" "}
            <a href="mailto:contato@pediyapa.com" className="text-primary underline underline-offset-2">
              contato@pediyapa.com
            </a>
            . Responderemos en un plazo máximo de 15 días hábiles.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">9. Cookies</h2>
          <p className="mt-3 text-muted-foreground">
            El sitio web de Yapa utiliza únicamente cookies de sesión estrictamente necesarias para
            el funcionamiento de la plataforma de gestión interna. No se utilizan cookies de
            rastreo, analítica o publicidad de terceros.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">10. Contacto</h2>
          <p className="mt-3 text-muted-foreground">
            Para consultas relacionadas con la privacidad de sus datos, contáctenos en{" "}
            <a href="mailto:contato@pediyapa.com" className="text-primary underline underline-offset-2">
              contato@pediyapa.com
            </a>{" "}
            o por WhatsApp al <strong>+595 0993 555 959</strong>.
          </p>
        </section>
      </div>
    </div>
  );
}
