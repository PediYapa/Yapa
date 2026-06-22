export const metadata = { title: "Términos y Condiciones — Yapa Delivery" };

export default function TerminosPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Términos y Condiciones de Uso</h1>
      <p className="mt-2 text-sm text-muted-foreground">Última actualización: junio de 2025</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="text-lg font-semibold">1. Sobre la Plataforma</h2>
          <p className="mt-3 text-muted-foreground">
            Yapa es una plataforma digital de facilitación de pedidos y delivery nocturno de bebidas
            operada como Persona Física bajo el RUC paraguayo 9373240-6, con sede en Ciudad del Este,
            Alto Paraná, Paraguay. La plataforma conecta a consumidores finales con distribuidoras
            locales de bebidas, automatizando el proceso de pedido a través de WhatsApp y gestionando
            la entrega a domicilio.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Aceptación de los Términos</h2>
          <p className="mt-3 text-muted-foreground">
            Al realizar un pedido a través de cualquier canal de Yapa (WhatsApp, sitio web o
            cualquier medio oficial), el cliente acepta íntegramente los presentes Términos y
            Condiciones. Si no está de acuerdo con alguna de las disposiciones aquí establecidas,
            deberá abstenerse de utilizar el servicio.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Descripción del Servicio</h2>
          <p className="mt-3 text-muted-foreground">
            Yapa ofrece el servicio de delivery de bebidas (cervezas, destilados, vinos y productos
            relacionados) exclusivamente en Ciudad del Este y zonas habilitadas. El horario de
            operación es nocturno; los horarios exactos están sujetos a disponibilidad de los
            distribuidores locales y se comunican a través de los canales oficiales.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Restricciones de Edad</h2>
          <p className="mt-3 text-muted-foreground">
            La venta y entrega de bebidas alcohólicas está restringida a personas mayores de 18 años,
            conforme a la legislación paraguaya vigente. Al realizar un pedido, el cliente declara
            ser mayor de edad. Yapa se reserva el derecho de solicitar documento de identidad al
            momento de la entrega y negarse a entregar si no se comprueba la mayoría de edad.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Precios y Pagos</h2>
          <p className="mt-3 text-muted-foreground">
            Los precios se expresan en Guaraníes (PYG) o en Reales Brasileños (BRL) según la
            modalidad de pago elegida. Los pagos con tarjeta o Pix son procesados de forma segura
            a través del gateway <strong>dLocal</strong>, certificado PCI-DSS. Yapa no almacena ni
            tiene acceso a los datos de tarjeta del cliente; toda la transacción ocurre en el
            entorno seguro de dLocal.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Responsabilidades</h2>
          <p className="mt-3 text-muted-foreground">
            Yapa actúa como intermediario logístico entre el cliente y la distribuidora. La calidad
            y temperatura de los productos son responsabilidad de la distribuidora asignada. En caso
            de productos defectuosos o equivocados, el cliente deberá comunicarse a través de los
            canales de contacto oficiales dentro de las 2 horas posteriores a la recepción del
            pedido.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">7. Modificaciones</h2>
          <p className="mt-3 text-muted-foreground">
            Yapa se reserva el derecho de modificar estos Términos en cualquier momento. Los cambios
            serán comunicados a través del sitio web oficial. El uso continuado del servicio implica
            la aceptación de los Términos actualizados.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">8. Contacto</h2>
          <p className="mt-3 text-muted-foreground">
            Para consultas sobre estos Términos, contáctenos en{" "}
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
