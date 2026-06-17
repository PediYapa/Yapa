"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Ponto = { dia: string; pedidos: number; faturamentoGs: number };

export function DashboardChart({ data }: { data: Ponto[] }) {
  const fmt = data.map((d) => ({ ...d, label: d.dia.slice(8) + "/" + d.dia.slice(5, 7) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={fmt} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "color-mix(in oklch, var(--primary) 8%, transparent)" }}
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            fontSize: 12,
            color: "var(--foreground)",
          }}
          formatter={(value) => [value as number, "Pedidos"]}
        />
        <Bar dataKey="pedidos" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
