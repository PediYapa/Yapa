import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yapa — Gestão do Delivery",
  description: "Central de gestão do Yapa: pedidos, entregas, entregadores, distribuidoras, clientes e financeiro do delivery de bebidas em Ciudad del Este.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema lido do cookie no servidor → sem flash e sem mismatch de hidratação.
  const theme = (await cookies()).get("yapa_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="pt-BR" data-theme={theme} className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
