/**
 * Câmbio — conversão obrigatória para Guarani (GS).
 * O Yapa precifica e contabiliza tudo em GS; pagamentos em Pix (BRL) são
 * convertidos. Taxa via env CAMBIO_BRL_GS (GS por 1 BRL). Determinístico.
 */
import type { Moeda } from "@/lib/database.types";

/**
 * Retorna a taxa BRL→GS. Prioridade:
 *   1. valor salvo na org (vindo do banco)
 *   2. variável de ambiente CAMBIO_BRL_GS
 *   3. fallback de referência
 */
export function taxaBrlParaGs(taxaDaOrg?: number | null): number {
  if (taxaDaOrg != null && Number.isFinite(taxaDaOrg) && taxaDaOrg > 0) return taxaDaOrg;
  const raw = Number(process.env.CAMBIO_BRL_GS);
  return Number.isFinite(raw) && raw > 0 ? raw : 1450;
}

/** Converte um valor de qualquer moeda para Guarani. */
export function paraGuarani(valor: number, moeda: Moeda): number {
  if (moeda === "GS") return valor;
  // PIX e BRL chegam em reais
  return Math.round(valor * taxaBrlParaGs());
}

/** Converte um valor em Guarani para BRL (reais), com 2 casas decimais. */
export function guaraniParaBrl(valorGs: number, taxaDaOrg?: number | null): number {
  const taxa = taxaBrlParaGs(taxaDaOrg);
  return Number((valorGs / taxa).toFixed(2));
}
