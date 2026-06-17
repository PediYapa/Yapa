/**
 * Tipos do banco — escritos à mão a partir de db/schema.sql.
 * IMPORTANTE: usar `type` (não `interface`) — o postgrest-js faz
 * `Row extends Record<string, unknown>`, e interfaces falham nessa checagem
 * (não têm index signature implícita), o que faria as queries virarem `never`.
 *
 * Ao provisionar o Supabase, REGENERAR com:
 *   supabase gen types typescript --schema yapa   (ou MCP generate_typescript_types)
 * e substituir este arquivo.
 */

export type UserRole = "owner" | "gerente" | "operador";
export type ProdutoCategoria = "cerveja" | "destilado" | "pod" | "vape" | "voucher" | "outro";
export type PedidoStatus =
  | "recebido" | "aguardando_pagamento" | "pago" | "roteado" | "em_separacao"
  | "despachado" | "em_entrega" | "entregue" | "cancelado" | "estornado" | "quebra";
export type Moeda = "GS" | "PIX" | "BRL";
export type FormaPagamento = "dlocal" | "pix" | "dinheiro";
export type EntregaStatus = "aguardando" | "coletado" | "em_entrega" | "entregue" | "cancelada";
export type PagamentoStatus = "pendente" | "pago" | "estornado" | "falha";
export type ConversaStatus = "aberta" | "pendente" | "resolvida" | "arquivada";

export type OrgRow = {
  id: string;
  nome: string;
  cidade: string | null;
  pais: string | null;
  created_at: string;
};

export type UserProfileRow = {
  id: string;
  org_id: string;
  nome: string;
  role: UserRole;
  module_permissions: Record<string, ("read" | "write")[]>;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClienteRow = {
  id: string;
  org_id: string;
  nome: string | null;
  telefone: string;
  zona: string | null;
  endereco: string | null;
  referencia: string | null;
  latitude: number | null;
  longitude: number | null;
  total_pedidos: number;
  ticket_medio_gs: number | null;
  ultima_compra: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DistribuidoraRow = {
  id: string;
  org_id: string;
  nome: string;
  contato: string | null;
  telefone: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  raio_km: number;
  link_maps: string | null;
  recebe_dinheiro: boolean;
  saldo_d1_gs: number;
  ativo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProdutoRow = {
  id: string;
  org_id: string;
  nome: string;
  categoria: ProdutoCategoria;
  preco_gs: number;
  distribuidora_id: string | null;
  disponivel: boolean;
  descricao: string | null;
  imagem_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EntregadorRow = {
  id: string;
  org_id: string;
  nome: string;
  telefone: string | null;
  grupo_parceiro: string | null;
  distribuidora_base_id: string | null;
  ativo: boolean;
  entregas_completadas: number;
  notas: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PedidoRow = {
  id: string;
  org_id: string;
  numero: number;
  cliente_id: string | null;
  distribuidora_id: string | null;
  status: PedidoStatus;
  canal: string;
  moeda: Moeda;
  forma_pagamento: FormaPagamento | null;
  valor_total_gs: number;
  valor_origem: number | null;
  codigo_validacao: string | null;
  endereco_entrega: string | null;
  referencia: string | null;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PedidoItemRow = {
  id: string;
  org_id: string;
  pedido_id: string;
  produto_id: string | null;
  descricao: string;
  quantidade: number;
  preco_unit_gs: number;
  subtotal_gs: number;
  created_at: string;
};

export type EntregaRow = {
  id: string;
  org_id: string;
  pedido_id: string;
  entregador_id: string | null;
  status: EntregaStatus;
  horario_despacho: string | null;
  horario_coleta: string | null;
  horario_entrega_prevista: string | null;
  horario_entrega_realizado: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

export type PagamentoRow = {
  id: string;
  org_id: string;
  pedido_id: string;
  provedor: FormaPagamento;
  moeda: Moeda;
  valor: number;
  valor_gs: number;
  status: PagamentoStatus;
  recebido_por_distribuidora_id: string | null;
  abatido_em: string | null;
  referencia_externa: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversaMensagem = {
  de: "cliente" | "bot" | "humano";
  texto: string;
  tipo: string;
  em: string;
};

export type ConversaRow = {
  id: string;
  org_id: string;
  cliente_id: string | null;
  telefone: string;
  canal: string;
  status: ConversaStatus;
  handoff_humano: boolean;
  mensagens: ConversaMensagem[];
  ultima_mensagem_em: string | null;
  pedido_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiTokenRow = {
  id: string;
  org_id: string;
  nome: string;
  token_hash: string;
  prefixo: string;
  scopes: string;
  expires_at: string | null;
  ultimo_uso: string | null;
  revogado_em: string | null;
  created_by: string | null;
  created_at: string;
};

type TableShape<R> = {
  Row: R;
  Insert: Partial<R>;
  Update: Partial<R>;
  Relationships: [];
};

export type Database = {
  yapa: {
    Tables: {
      orgs: TableShape<OrgRow>;
      user_profiles: TableShape<UserProfileRow>;
      clientes: TableShape<ClienteRow>;
      distribuidoras: TableShape<DistribuidoraRow>;
      produtos: TableShape<ProdutoRow>;
      entregadores: TableShape<EntregadorRow>;
      pedidos: TableShape<PedidoRow>;
      pedido_itens: TableShape<PedidoItemRow>;
      entregas: TableShape<EntregaRow>;
      pagamentos: TableShape<PagamentoRow>;
      conversas: TableShape<ConversaRow>;
      api_tokens: TableShape<ApiTokenRow>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
    Enums: {
      user_role: UserRole;
      produto_categoria: ProdutoCategoria;
      pedido_status: PedidoStatus;
      moeda: Moeda;
      forma_pagamento: FormaPagamento;
      entrega_status: EntregaStatus;
      pagamento_status: PagamentoStatus;
      conversa_status: ConversaStatus;
    };
  };
};
