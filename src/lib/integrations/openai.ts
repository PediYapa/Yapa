import "server-only";

/**
 * Agente de pedidos — interpreta a mensagem livre do cliente no WhatsApp e
 * extrai uma intenção estruturada de pedido. Em produção chama a OpenAI; sem
 * chave, usa um parser heurístico (suficiente para testes locais e Fase 1
 * "bot rústico/ruim-bom" guiado por opções).
 */

export type ItemIntencao = { descricao: string; quantidade: number };
export type IntencaoPedido = {
  intencao: "pedido" | "duvida" | "saudacao" | "outro";
  itens: ItemIntencao[];
  endereco?: string;
  resposta_sugerida: string;
};

const SYSTEM_PROMPT = `Você é o atendente do Yapa, um delivery de bebidas em Ciudad del Este (Paraguai).
Seja direto e simpático. A partir da mensagem do cliente, identifique a intenção e os itens do pedido
(bebidas, pods, etc.) com quantidades. Responda SEMPRE em JSON no formato:
{"intencao":"pedido|duvida|saudacao|outro","itens":[{"descricao":"...","quantidade":1}],"endereco":"...opcional...","resposta_sugerida":"..."}`;

export async function interpretarMensagem(texto: string): Promise<IntencaoPedido> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return heuristica(texto);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: texto },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!res.ok) return heuristica(texto);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return heuristica(texto);
    const parsed = JSON.parse(content);
    return {
      intencao: parsed.intencao ?? "outro",
      itens: Array.isArray(parsed.itens) ? parsed.itens : [],
      endereco: parsed.endereco,
      resposta_sugerida: parsed.resposta_sugerida ?? "",
    };
  } catch {
    return heuristica(texto);
  }
}

/** Parser simples: detecta "N x produto" e palavras de saudação. */
function heuristica(texto: string): IntencaoPedido {
  const t = texto.toLowerCase().trim();
  if (/^(oi|ol[áa]|bom dia|boa tarde|boa noite|hola)\b/.test(t)) {
    return {
      intencao: "saudacao",
      itens: [],
      resposta_sugerida: "Olá! Bem-vindo ao Yapa 🍻 O que você gostaria de pedir hoje?",
    };
  }
  const itens: ItemIntencao[] = [];
  const regex = /(\d+)\s*(?:x|un|unidades?)?\s*([a-zà-ú][a-zà-ú\s]{2,30})/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(texto)) !== null) {
    itens.push({ quantidade: parseInt(m[1], 10), descricao: m[2].trim() });
  }
  if (itens.length > 0) {
    return {
      intencao: "pedido",
      itens,
      resposta_sugerida: "Anotado! Vou confirmar os itens e te enviar o link de pagamento.",
    };
  }
  return {
    intencao: "outro",
    itens: [],
    resposta_sugerida: "Pode me dizer o que você quer pedir? Ex.: '2 Heineken e 1 pod'.",
  };
}
