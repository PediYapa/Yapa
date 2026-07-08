import "server-only";

/**
 * Adapter dLocal Go → porta de pagamento (lib/pagamentos/gateway.ts).
 *
 * Fina camada de tradução sobre lib/dlocal.ts (que mantém o conhecimento
 * duro da API: auth Bearer key:secret, timeouts, link abierto sem country).
 * ⚠️ Conta dLocal ainda NÃO aprovada — o adapter existe pronto para o caso
 * de aprovação futura; sem credenciais na env, `configurado()` = false e a
 * porta considera o pagamento online indisponível.
 */
import type { PaymentGateway } from "@/lib/pagamentos/gateway";
import { createPaymentLink, getPayment, dlocalGoConfigurado } from "@/lib/dlocal";

export const dlocalGateway: PaymentGateway = {
  id: "dlocal",
  nome: "dLocal Go",
  formaPagamento: "dlocal",

  configurado: () => dlocalGoConfigurado(),

  async criarLink(params) {
    const r = await createPaymentLink({
      pedidoId: params.pedidoId,
      amount: Math.round(params.valorGs),
      description: params.descricao,
      appUrl: params.appUrl,
    });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, gatewayId: r.paymentId, url: r.redirectUrl, status: r.status };
  },

  async consultar(gatewayId) {
    const r = await getPayment(gatewayId);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, pago: r.status === "PAID", status: r.status, pedidoId: r.orderId || null };
  },
};
