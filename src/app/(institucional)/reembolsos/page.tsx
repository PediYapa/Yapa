export const metadata = { title: "Política de Reembolso y Cancelación — Yapa Delivery" };

export default function ReembolsosPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Política de Reembolso y Cancelación</h1>
      <p className="mt-2 text-sm text-muted-foreground">Última actualización: junio de 2025</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="text-lg font-semibold">1. Cancelación sin Costo</h2>
          <div className="mt-3 rounded-xl border border-border bg-muted/40 p-4">
            <p className="font-medium text-foreground">
              El cliente puede cancelar su pedido sin costo alguno <strong>únicamente si
              notifica al equipo de Yapa antes de que el entregador salga del depósito local</strong>.
            </p>
          </div>
          <p className="mt-3 text-muted-foreground">
            Para solicitar la cancelación, contáctenos de inmediato por WhatsApp al{" "}
            <strong>+595 0993 555 959</strong> o por e-mail a{" "}
            <a href="mailto:contato@pediyapa.com" className="text-primary underline underline-offset-2">
              contato@pediyapa.com
            </a>
            , indicando el número de su pedido y la solicitud de cancelación.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Cancelación con Entregador en Ruta</h2>
          <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/60 p-4 dark:border-amber-800/40 dark:bg-amber-900/20">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Si la cancelación se solicita cuando el entregador ya está en camino hacia el domicilio,
              <strong> se cobrará el costo logístico del flete</strong> correspondiente al trayecto
              ya iniciado.
            </p>
          </div>
          <p className="mt-3 text-muted-foreground">
            Este cobro cubre los gastos operativos del entregador (combustible, tiempo y desgaste
            del vehículo) que no pueden recuperarse una vez que el proceso de entrega se ha iniciado.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Reembolsos por Problemas de Calidad</h2>
          <p className="mt-3 text-muted-foreground">
            Si el pedido llega con productos defectuosos, equivocados o en mal estado, el cliente
            deberá comunicarse dentro de las <strong>2 horas</strong> posteriores a la recepción,
            enviando fotos del producto como evidencia. Yapa evaluará el caso y, de verificarse el
            error, se coordinará el reenvío o el reembolso del monto correspondiente.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Plazos de Reembolso</h2>
          <p className="mt-3 text-muted-foreground">
            Los reembolsos aprobados se procesan en los siguientes plazos según la forma de pago:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li><strong>Pix / Tarjeta vía dLocal:</strong> hasta 5 días hábiles, según los plazos del banco emisor.</li>
            <li><strong>Efectivo:</strong> devuelto en el próximo pedido o de manera acordada con el equipo.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Pedidos No Entregados</h2>
          <p className="mt-3 text-muted-foreground">
            Si el pedido no puede ser entregado por causas imputables a Yapa (dirección no
            encontrada por error del sistema, falta de stock, fuerza mayor, etc.), el cliente
            recibirá un reembolso completo sin costo adicional.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Cómo Solicitar un Reembolso</h2>
          <p className="mt-3 text-muted-foreground">
            Para iniciar una solicitud de reembolso, contáctenos por cualquiera de estos canales:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              WhatsApp: <strong>+595 0993 555 959</strong>
            </li>
            <li>
              E-mail:{" "}
              <a href="mailto:contato@pediyapa.com" className="text-primary underline underline-offset-2">
                contato@pediyapa.com
              </a>
            </li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            Incluya el número de pedido, el motivo de la solicitud y, si aplica, fotografías como
            evidencia. Responderemos en un plazo máximo de 48 horas hábiles.
          </p>
        </section>
      </div>
    </div>
  );
}
