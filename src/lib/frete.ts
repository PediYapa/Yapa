/**
 * Frete por distância (puro, sem API externa e sem I/O — testável).
 *
 * A distância cliente↔distribuidora é em linha reta (Haversine, reusa
 * lib/intel/roteamento.ts) e cai numa tabela de faixas fixas em Guarani.
 * O frete é contabilizado SEPARADO do valor dos produtos (pedidos.taxa_entrega_gs);
 * o total exibido ao cliente é a soma.
 */
import { haversineKm } from "@/lib/intel/roteamento";

/** Faixas de frete por km (fácil de ajustar). `null` = fora de cobertura. */
export const FAIXAS_FRETE_GS: { ate_km: number; valor_gs: number }[] = [
  { ate_km: 2, valor_gs: 10_000 },
  { ate_km: 5, valor_gs: 15_000 },
  { ate_km: 8, valor_gs: 20_000 },
];

/** Distância em linha reta em km (fórmula de Haversine). */
export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm({ latitude: lat1, longitude: lng1 }, { latitude: lat2, longitude: lng2 }) ?? 0;
}

/**
 * Frete em GS pela faixa de distância. Retorna null acima da última faixa
 * (> 8 km — o geo-routing já barra antes, mas validamos de novo aqui).
 */
export function calcularFreteGs(distKm: number): number | null {
  if (!Number.isFinite(distKm) || distKm < 0) return null;
  const faixa = FAIXAS_FRETE_GS.find((f) => distKm <= f.ate_km);
  return faixa ? faixa.valor_gs : null;
}

/** "3,2" — km com uma casa decimal e vírgula (padrão pt/es). */
export function formatarKm(distKm: number): string {
  return distKm.toFixed(1).replace(".", ",");
}
