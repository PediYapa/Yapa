import "server-only";

/**
 * Entregas Expressas — logística terceirizada via padrão Open Delivery
 * (ABRASEL). Substitui o despacho por WhatsApp/grupo de motoboys: aqui é a
 * operadora quem aloca o entregador; nós só registramos a entrega e reagimos
 * aos webhooks de status.
 *
 * Docs: https://developer.entregasexpressas.com.br/open-delivery
 * Painel: https://developer.entregasexpressas.com.br/painel
 *
 * Fluxo: OAuth2 client_credentials (token 24h, cacheado em memória por
 * client_id) → POST /v1/logistics/delivery (retorna 202, aceite final via
 * webhook) → eventos ACCEPTED/REJECTED/.../ORDER_DELIVERED via webhook.
 */

const BASE_URL = "https://entregasexpressas.com.br/api/opendelivery";

export type EntregasExpressasConfig = {
  clientId: string;
  clientSecret: string;
  /** ID que NÓS geramos pro estabelecimento (não vem deles) — enviado como merchant.id. */
  merchantId: string;
  merchantNome: string;
};

/** Lê config das variáveis de ambiente (fallback quando a org não tem credenciais no DB). */
function cfgFromEnv(): EntregasExpressasConfig | null {
  const clientId = process.env.ENTREGAS_EXPRESSAS_CLIENT_ID;
  const clientSecret = process.env.ENTREGAS_EXPRESSAS_CLIENT_SECRET;
  const merchantId = process.env.ENTREGAS_EXPRESSAS_MERCHANT_ID;
  if (!clientId || !clientSecret || !merchantId) return null;
  return { clientId, clientSecret, merchantId, merchantNome: process.env.ENTREGAS_EXPRESSAS_MERCHANT_NOME ?? "Yapa" };
}

export function entregasExpressasConfigurado(cfg?: EntregasExpressasConfig | null): boolean {
  return cfg != null || cfgFromEnv() != null;
}

// --- Cache de token em memória (24h) — evita 1 request de OAuth por entrega.
// Chave por client_id: um processo pode atender múltiplas orgs.
type TokenCacheEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenCacheEntry>();

async function getAccessToken(cfg: EntregasExpressasConfig): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const cached = tokenCache.get(cfg.clientId);
  // margem de 60s pra não usar um token que expira no meio da chamada seguinte
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return { ok: true, token: cached.token };
  }
  try {
    const res = await fetch(`${BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `oauth/token ${res.status}: ${JSON.stringify(data)}` };
    const { access_token, expires_in } = data as { access_token: string; expires_in: number };
    tokenCache.set(cfg.clientId, { token: access_token, expiresAt: Date.now() + expires_in * 1000 });
    return { ok: true, token: access_token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro oauth/token" };
  }
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  cfg: EntregasExpressasConfig,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const tok = await getAccessToken(cfg);
  if (!tok.ok) return { ok: false, error: tok.error };
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tok.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `${path} ${res.status}: ${JSON.stringify(data)}`, status: res.status };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : `erro ${path}` };
  }
}

// --- Schemas (só os campos que usamos) ------------------------------------

export type AddressLogistics = {
  country: string; // ISO 3166-1 alpha-2, ex.: "BR" ou "PY"
  state: string;    // ISO 3166-2, ex.: "BR-SP"
  city: string;
  district: string;
  street: string;
  number: string;
  postalCode: string;
  complement: string; // pode ser vazio, mas precisa existir
  latitude?: number;
  longitude?: number;
};

export type Price = { value: number; currency: "BRL" };

export type Vehicle = {
  type: ("MOTORBIKE_BAG" | "MOTORBIKE_BOX" | "CAR" | "BICYCLE" | "SCOOTER" | "VUC")[];
  container: "NORMAL" | "THERMIC";
  containerSize?: "SMALL" | "MEDIUM" | "LARGE" | "EXTRA_LARGE";
  instruction?: string;
};

export type CriarEntregaInput = {
  orderId: string; // UUID gerado por nós
  orderDisplayId: string;
  customerName: string;
  customerPhone?: string;
  pickupAddress: AddressLogistics;
  deliveryAddress: AddressLogistics;
  vehicle: Vehicle;
  totalOrderPrice: Price;
  totalWeight: number; // gramas
  returnToMerchant: boolean;
  canCombine: boolean;
  onlinePayment: boolean;
  payments: {
    method: "OFFLINE" | "ONLINE";
    wirelessPos?: boolean;
    offlineMethod?: { type: "CREDIT" | "DEBIT" | "MEAL_VOUCHER" | "FOOD_VOUCHER" | "PIX" | "CASH" | "CREDIT_DEBIT" | "OTHER"; amount: Price }[];
    change?: Price;
  };
  confirmationCodeRequired?: boolean;
  items?: { name: string; quantity: number }[];
  limitTimes: { pickupLimit: number; deliveryLimit: number; orderCreatedAt: string };
};

export type CriarEntregaResponse = {
  deliveryId: string;
  orderId: string;
  status: "PENDING";
  createdAt: string;
};

/** Registra uma nova entrega. 202 = aceito pra processamento; aceite/rejeição real chega via webhook. */
export function criarEntrega(input: CriarEntregaInput, cfg: EntregasExpressasConfig) {
  return request<CriarEntregaResponse>("POST", "/v1/logistics/delivery", cfg, {
    merchant: { id: cfg.merchantId, name: cfg.merchantNome },
    ...input,
  });
}

export type SimularEntregaInput = Omit<
  CriarEntregaInput,
  "orderId" | "orderDisplayId" | "customerName" | "customerPhone" | "payments" | "confirmationCodeRequired" | "items"
> & { orderDeliveryFee?: Price };

export type SimularEntregaResponse = {
  deliveryPrice: Price;
  vehicles: { availableVehicles: number; nextAvailableVehicle: number };
  ETAs: {
    updateMethod: "ONLINE" | "OFFLINE";
    pickupEtaInMinutes: number;
    pickupEtaDatetime: string;
    deliveryEtaInMinutes: number;
    deliveryEtaDatetime: string;
    maxDeliveryTime: string;
  };
};

/** Simula preço/ETA antes de criar a entrega — útil pra mostrar frete no checkout. */
export function simularEntrega(input: SimularEntregaInput, cfg: EntregasExpressasConfig) {
  return request<SimularEntregaResponse>("POST", "/v1/logistics/availability", cfg, {
    merchant: { id: cfg.merchantId, name: cfg.merchantNome },
    ...input,
  });
}

export type CancelarEntregaReason =
  | "CONSUMER_CANCELLATION_REQUESTED" | "NO_SHOW" | "PROBLEM_AT_MERCHANT"
  | "HIGH_ACCEPTANCE_TIME" | "INCORRECT_ORDER_OR_PRODUCT_PICKUP"
  | "PROBLEM_RESOLUTION" | "DISCOMBINE_ORDER" | "OTHER";

/** Cancela uma entrega em curso. Pode gerar cobrança adicional se já aceita — ver additionalCharges na resposta. */
export function cancelarEntrega(
  orderId: string,
  reason: CancelarEntregaReason,
  cfg: EntregasExpressasConfig,
  opts?: { action?: "RETURN_TO_STORE" | "CANCEL_DELIVERY"; message?: string },
) {
  return request<{ additionalCharges: boolean }>("POST", `/v1/logistics/cancel/${orderId}`, cfg, {
    reason,
    ...opts,
  });
}

/** Avisa que o pedido está pronto pra coleta antes do previsto (só necessário se notifyReadyForPickup=true na criação). */
export function marcarProntoParaColeta(orderId: string, cfg: EntregasExpressasConfig) {
  return request<void>("POST", `/v1/logistics/readyForPickup/${orderId}`, cfg);
}

/** Consulta o estado completo de uma entrega (histórico de eventos, localização do entregador). */
export function consultarEntrega(orderId: string, cfg: EntregasExpressasConfig) {
  return request<Record<string, unknown>>("GET", `/v1/logistics/delivery/${orderId}`, cfg);
}
