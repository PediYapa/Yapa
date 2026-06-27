"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FaturaCSVRow = {
  numero: number;
  nome: string;
  ruc: string;
  itens: string;
  valor: number;
  data: string;
};

/** Escapa um campo para CSV (aspas duplas + escape de aspas internas). */
function csvCampo(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Botão "Exportar CSV" — gera o arquivo no cliente a partir das linhas já
 * carregadas pela página (sem round-trip ao servidor). Separador ";" e BOM
 * UTF-8 para abrir corretamente no Excel em pt-BR.
 */
export function ExportarFaturasCSV({ linhas }: { linhas: FaturaCSVRow[] }) {
  function exportar() {
    const cabecalho = ["Pedido", "Nome", "RUC/CI", "Itens", "Valor (GS)", "Data"];
    const corpo = linhas.map((l) =>
      [l.numero, l.nome, l.ruc, l.itens, l.valor, l.data].map(csvCampo).join(";"),
    );
    const conteudo = "﻿" + [cabecalho.join(";"), ...corpo].join("\r\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `faturas-yapa-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button onClick={exportar} disabled={linhas.length === 0}>
      <Download /> Exportar CSV
    </Button>
  );
}
