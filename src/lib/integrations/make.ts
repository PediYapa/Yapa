import "server-only";

/**
 * Make — orquestração externa do bot. O Yapa pode disparar webhooks para
 * cenários do Make (ex.: fan-out de notificações, integrações secundárias).
 * Sem URL configurada, vira no-op logado.
 */

export async function dispararMake(evento: string, payload: unknown): Promise<{ ok: boolean }> {
  const url = process.env.MAKE_WEBHOOK_URL;
  if (!url) {
    console.info("[make] webhook não configurado — evento ignorado:", evento);
    return { ok: true };
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evento, payload }),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
