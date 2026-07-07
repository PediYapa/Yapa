/**
 * Textos das mensagens do dispatch de motoboys — centralizados para ajustar
 * copy sem tocar na lógica (grupo, DMs e notificação do cliente).
 *
 * ⚠️ Privacidade: nome, telefone e PIN exato do cliente só vão no DM do
 * motoboy vencedor — NUNCA no grupo.
 */
import { gs } from "@/lib/format";
import { formatarKm } from "@/lib/frete";

/** Anúncio da corrida no grupo de motoboys (sem dados pessoais do cliente). */
export function msgCorridaGrupo(input: {
  numeroCorrida: number;
  distribuidoraNome: string;
  enderecoResumido: string | null;
  distanciaKm: number | null;
  taxaEntregaGs: number | null;
  /** true = pago online; false = dinheiro (motoboy cobra o total na entrega). */
  pagoOnline: boolean;
  /** produtos + frete — só usado quando pagamento é em dinheiro. */
  totalCobrarGs: number;
}): string {
  const pagamento = input.pagoOnline
    ? "Pago online"
    : `Dinheiro — cobrar ${gs(input.totalCobrarGs)} na entrega`;
  return [
    `🛵 *CORRIDA #${input.numeroCorrida}*`,
    `Retirada: ${input.distribuidoraNome}`,
    `Entrega: ${input.enderecoResumido ?? "endereço no DM do vencedor"}`,
    `Distância: ${input.distanciaKm != null ? `${formatarKm(input.distanciaKm)} km` : "—"}`,
    `Valor da corrida: ${gs(input.taxaEntregaGs)}`,
    `Pagamento do pedido: ${pagamento}`,
    "",
    `Responda *P ${input.numeroCorrida}* para aceitar.`,
  ].join("\n");
}

/** Confirmação pública no grupo — só o nome do motoboy vencedor. */
export function msgCorridaAceitaGrupo(numeroCorrida: number, nomeMotoboy: string): string {
  return `✅ Corrida #${numeroCorrida} é do ${nomeMotoboy}.`;
}

/** DM ao vencedor: dados completos do cliente (fora do grupo). */
export function msgDmVencedor(input: {
  numeroCorrida: number;
  clienteNome: string | null;
  clienteTelefone: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  /** null quando pago online (nada a cobrar). */
  cobrarGs: number | null;
}): string {
  const partes = [
    `🛵 *Corrida #${input.numeroCorrida} é sua!*`,
    "",
    `*Cliente:* ${input.clienteNome ?? "—"}`,
    `*Telefone:* ${input.clienteTelefone ?? "—"}`,
    `*Endereço:* ${input.endereco ?? "—"}`,
  ];
  if (input.latitude != null && input.longitude != null) {
    partes.push(`*PIN:* https://maps.google.com/?q=${input.latitude},${input.longitude}`);
  }
  partes.push(
    "",
    input.cobrarGs != null
      ? `💵 *Cobrar na entrega: ${gs(input.cobrarGs)}* (produtos + frete)`
      : "✅ Pedido pago online — nada a cobrar do cliente.",
    "",
    `Ao entregar, responda *E ${input.numeroCorrida}* no grupo para confirmar.`,
  );
  return partes.join("\n");
}

/** DM discreto ao perdedor (não responder no grupo, para não gerar ruído). */
export const MSG_CORRIDA_JA_ACEITA = "Essa corrida já foi aceita por outro colega 🙏";

/** DM ao motoboy após confirmar a entrega com "E <n>". */
export function msgDmEntregaConfirmada(numeroCorrida: number): string {
  return `✅ Entrega da corrida #${numeroCorrida} confirmada. Valeu! 💛`;
}

/** WhatsApp do cliente quando o motoboy confirma a entrega. */
export function msgClienteEntregue(numeroPedido: number): string {
  return `🎉 Seu pedido #${numeroPedido} foi entregue! Obrigado por comprar com a Yapa 💛`;
}
