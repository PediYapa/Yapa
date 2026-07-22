/** Formatação pt-BR centralizada. */

export function brl(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Guarani paraguaio (sem casas decimais): 150000 → ₲ 150.000 */
export function gs(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `₲ ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(value)}`;
}

/** Valor em qualquer moeda do Yapa. moeda="GS" → Guarani; senão BRL. */
export function valor(value: number | null | undefined, moeda: "GS" | "PIX" | "BRL" = "GS"): string {
  return moeda === "GS" ? gs(value) : brl(value);
}

export function num(value: number | null | undefined, max = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: max }).format(value);
}

export function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function dataBR(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(d);
}

export function dataHoraBR(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}

/** Tempo relativo curto pt-BR: "agora", "há 5 min", "há 2 h", "há 3 d"; acima de 30 dias cai pra data. */
export function tempoRelativoBR(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const seg = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (seg < 60) return "agora";
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias <= 30) return `há ${dias} d`;
  return dataBR(d);
}

/** Telefone BR para exibição: +5511999998888 → (11) 99999-8888 */
export function telBR(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "").replace(/^55/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}
