import "server-only";

/**
 * Z-API — ponte WhatsApp (não-oficial). Envia mensagens em nome do número
 * conectado. Em Fase 1 usamos texto e botões simples. Credenciais podem vir
 * do banco (configuradas na tela de Configurações) ou de variáveis de ambiente.
 *
 * Painel: https://app.z-api.io  ·  Docs: https://developer.z-api.io
 */

export type ZapiConfig = {
  instance: string;
  token: string;
  clientToken?: string | null;
};

/** Lê config das variáveis de ambiente. */
function cfgFromEnv(): ZapiConfig | null {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  if (!instance || !token) return null;
  return { instance, token, clientToken: process.env.ZAPI_CLIENT_TOKEN };
}

/** Retorna true se as credenciais Z-API estão disponíveis (parâmetro, DB ou env). */
export function zapiConfigurado(cfg?: ZapiConfig | null): boolean {
  return cfg != null || cfgFromEnv() != null;
}

async function post(
  path: string,
  body: unknown,
  cfg?: ZapiConfig | null,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const c = cfg ?? cfgFromEnv();
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
export function enviarTexto(phone: string, message: string, cfg?: ZapiConfig | null) {
  return post("send-text", { phone: phone.replace(/\D/g, ""), message }, cfg);
}

/** Envia uma imagem (URL pública) com legenda opcional. */
export function enviarImagem(phone: string, imageUrl: string, caption?: string, cfg?: ZapiConfig | null) {
  return post("send-image", {
    phone: phone.replace(/\D/g, ""),
    image: imageUrl,
    ...(caption ? { caption } : {}),
  }, cfg);
}

/** Envia uma mensagem com botões de resposta rápida (Z-API: send-button-list). */
export function enviarBotoes(
  phone: string,
  message: string,
  botoes: { id: string; label: string }[],
  cfg?: ZapiConfig | null,
) {
  return post("send-button-list", {
    phone: phone.replace(/\D/g, ""),
    message,
    buttonList: {
      buttons: botoes.map((b) => ({ id: b.id, label: b.label })),
    },
  }, cfg);
}

/**
 * Envia uma enquete nativa do WhatsApp — máx. 12 opções, seleção única.
 *
 * Formato Z-API (send-poll): `message` (pergunta), `poll` (array de {name}),
 * `pollMaxOptions` (qtde selecionável). O voto volta no webhook como
 * `body.pollVote.options[].name` (NÃO como pollUpdateMessage.votes).
 * Ref.: https://developer.z-api.io/en/message/send-poll
 */
export function enviarPoll(
  phone: string,
  titulo: string,
  opcoes: string[],
  cfg?: ZapiConfig | null,
) {
  return post("send-poll", {
    phone: phone.replace(/\D/g, ""),
    message: titulo,
    poll: opcoes.map((nome) => ({ name: nome })),
    pollMaxOptions: 1,
  }, cfg);
}

/** Envia link de pagamento (texto com URL) ao cliente. */
export function enviarLinkPagamento(phone: string, url: string, valorFmt: string, cfg?: ZapiConfig | null) {
  return enviarTexto(
    phone,
    `Para concluir seu pedido (${valorFmt}), finalize o pagamento aqui: ${url}`,
    cfg,
  );
}

/** Aciona a distribuidora/grupo parceiro com o resumo do pedido. */
export function notificarDistribuidora(phone: string, resumo: string, cfg?: ZapiConfig | null) {
  return enviarTexto(phone, `🆕 Novo pedido Yapa\n\n${resumo}`, cfg);
}

/**
 * Envia texto para um GRUPO de WhatsApp (send-text aceita o ID do grupo no
 * campo phone). NÃO sanitiza: IDs de grupo da Z-API têm sufixos não-numéricos
 * (ex.: "1203630...-group") que seriam destruídos pelo replace(/\D/g, "").
 */
export function notificarGrupoMotoboys(grupoId: string, mensagem: string, cfg?: ZapiConfig | null) {
  return post("send-text", { phone: grupoId.trim(), message: mensagem }, cfg);
}
