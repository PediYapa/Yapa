/**
 * Câmbio — conversão obrigatória para Guarani (GS).
 * O Yapa precifica e contabiliza tudo em GS; pagamentos em Pix (BRL) são
 * convertidos. Taxa via env CAMBIO_BRL_GS (GS por 1 BRL). Determinístico.
 */
import type { Moeda } from "@/lib/database.types";

export function taxaBrlParaGs(): number {
  const raw = Number(process.env.CAMBIO_BRL_GS);
  return Number.isFinite(raw) && raw > 0 ? raw : 1450; // fallback de referência
}

/** Converte um valor de qualquer moeda para Guarani. */
export function paraGuarani(valor: number, moeda: Moeda): number {
  if (moeda === "GS") return valor;
  // PIX e BRL chegam em reais
  return Math.round(valor * taxaBrlParaGs());
}
