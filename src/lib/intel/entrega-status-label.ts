/**
 * Mapa PURO evento_externo (Open Delivery / Entregas Expressas) → rótulo/tom
 * pra UI. Sem I/O e sem classes CSS aqui — o tom é semântico; quem renderiza
 * (ex.: EntregaStatusCell em pedidos-realtime.tsx) traduz tom → estilo.
 */
import type { EntregaEventoExterno } from "@/lib/database.types";

export type EntregaStatusTone = "neutro" | "azul" | "indigo" | "verde" | "cinza" | "vermelho";

export type EntregaStatusLabel = { label: string; tone: EntregaStatusTone };

const MAPA: Record<EntregaEventoExterno, EntregaStatusLabel> = {
  PENDING: { label: "Aguardando motoboy", tone: "neutro" },
  ACCEPTED: { label: "Motoboy aceitou", tone: "azul" },
  PICKUP_ONGOING: { label: "A caminho do hub", tone: "azul" },
  ARRIVED_AT_MERCHANT: { label: "Motoboy no hub", tone: "azul" },
  ORDER_PICKED: { label: "A caminho do cliente", tone: "indigo" },
  DELIVERY_ONGOING: { label: "A caminho do cliente", tone: "indigo" },
  ARRIVED_AT_CUSTOMER: { label: "Chegou ao cliente", tone: "indigo" },
  ORDER_DELIVERED: { label: "Entregue", tone: "verde" },
  DELIVERY_FINISHED: { label: "Entregue", tone: "verde" },
  RETURNING_TO_MERCHANT: { label: "Retornando ao hub", tone: "cinza" },
  RETURNED_TO_MERCHANT: { label: "Retornando ao hub", tone: "cinza" },
  REJECTED: { label: "Cancelado pela operadora", tone: "vermelho" },
  CANCELLED: { label: "Cancelado pela operadora", tone: "vermelho" },
};

/** null/undefined (pedido sem entrega vinculada ou sem evento ainda) → null → a UI mostra "—". */
export function entregaStatusLabel(evento: EntregaEventoExterno | null | undefined): EntregaStatusLabel | null {
  if (!evento) return null;
  return MAPA[evento] ?? null;
}
