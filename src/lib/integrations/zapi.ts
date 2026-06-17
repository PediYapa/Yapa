import "server-only";

/**
 * Z-API — ponte WhatsApp (não-oficial). Envia mensagens em nome do número
 * conectado. Em Fase 1 usamos texto e botões simples. Se as credenciais não
 * estiverem configuradas, as funções viram no-op logado (modo desenvolvimento).
 *
 * Painel: https://app.z-api.io  ·  Docs: https://developer.z-api.io
 */

function cfg() {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instance || !token) return null;
  return { instance, token, clientToken };
}

export function zapiConfigurado(): boolean {
  return cfg() !== null;
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const c = cfg();
  if (!c) {
    console.info("[zapi] não configurado — simulando envio:", path, body);
    return { ok: true, data: { simulado: true } };
  }
  try {
    const res = await fetch(`https://api.z-api.io/instances/${c.instance}/token/${c.token}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c.clientToken ? { "Client-Token": c.clientToken } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Z-API ${res.status}`, data };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro Z-API" };
  }
}

/** Envia texto simples para um número (E.164 sem '+', ex.: 595994xxxxxx). */
export function enviarTexto(phone: string, message: string) {
  return post("send-text", { phone: phone.replace(/\D/g, ""), message });
}

/** Envia link de pagamento (texto com URL) ao cliente. */
export function enviarLinkPagamento(phone: string, url: string, valorFmt: string) {
  return enviarTexto(
    phone,
    `Para concluir seu pedido (${valorFmt}), finalize o pagamento aqui: ${url}`,
  );
}

/** Aciona a distribuidora/grupo parceiro com o resumo do pedido. */
export function notificarDistribuidora(phone: string, resumo: string) {
  return enviarTexto(phone, `🆕 Novo pedido Yapa\n\n${resumo}`);
}
