import type {
  CustomerStage,
  AssetCategory,
  ExpenseCategory,
  ExpenseKind,
  RevenueLine,
  SupplyCategory,
  SupplyReason,
  InteractionType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrintJobStatus,
  PrinterStatus,
  ProductStatus,
  QuoteStatus,
  ShippingMethod,
  StockReason,
  TicketCategory,
  TicketStatus,
} from "@/db/schema";

// Rótulos em pt-BR + cor do badge para cada enum do domínio.
type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";
type LabelMap<T extends string> = Record<T, { label: string; tone: Tone }>;

export const orderStatusLabels: LabelMap<OrderStatus> = {
  pending_payment: { label: "Aguardando pagamento", tone: "warning" },
  paid: { label: "Pago", tone: "success" },
  in_production: { label: "Em produção", tone: "info" },
  ready: { label: "Pronto", tone: "accent" },
  shipped: { label: "Enviado", tone: "info" },
  delivered: { label: "Entregue", tone: "success" },
  cancelled: { label: "Cancelado", tone: "neutral" },
  refunded: { label: "Reembolsado", tone: "danger" },
};

export const paymentStatusLabels: LabelMap<PaymentStatus> = {
  pending: { label: "Pendente", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Recusado", tone: "danger" },
  refunded: { label: "Reembolsado", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  mercadopago: "Mercado Pago",
  pix_manual: "PIX (manual)",
  cash: "Dinheiro",
  other: "Outro",
};

export const shippingMethodLabels: Record<ShippingMethod, string> = {
  pickup: "Retirada no studio",
  delivery: "Entrega local",
  correios: "Correios / transportadora",
};

export const quoteStatusLabels: LabelMap<QuoteStatus> = {
  new: { label: "Novo", tone: "warning" },
  reviewing: { label: "Em análise", tone: "info" },
  quoted: { label: "Orçado", tone: "accent" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Recusado", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export const productStatusLabels: LabelMap<ProductStatus> = {
  draft: { label: "Rascunho", tone: "neutral" },
  active: { label: "Ativo", tone: "success" },
  archived: { label: "Arquivado", tone: "danger" },
};

export const customerStageLabels: LabelMap<CustomerStage> = {
  lead: { label: "Lead", tone: "warning" },
  active: { label: "Ativo", tone: "success" },
  vip: { label: "VIP", tone: "accent" },
  inactive: { label: "Inativo", tone: "neutral" },
};

export const interactionTypeLabels: Record<InteractionType, string> = {
  note: "Nota",
  whatsapp: "WhatsApp",
  email: "E-mail",
  call: "Ligação",
  meeting: "Reunião",
  instagram: "Instagram",
};

export const printJobStatusLabels: LabelMap<PrintJobStatus> = {
  queued: { label: "Na fila", tone: "warning" },
  printing: { label: "Imprimindo", tone: "info" },
  done: { label: "Concluído", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export const printerStatusLabels: LabelMap<PrinterStatus> = {
  idle: { label: "Livre", tone: "success" },
  printing: { label: "Imprimindo", tone: "info" },
  maintenance: { label: "Manutenção", tone: "warning" },
  offline: { label: "Offline", tone: "neutral" },
};

export const stockReasonLabels: Record<StockReason, string> = {
  purchase: "Compra",
  print: "Impressão",
  waste: "Refugo",
  adjustment: "Ajuste",
  return: "Devolução",
};

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  material: "Filamento / resina",
  supplies: "Insumos (almoxarifado)",
  energy: "Energia",
  cloud: "Cloud / hospedagem",
  software: "Software / SaaS",
  rent: "Aluguel / espaço",
  payroll: "Pró-labore / equipe",
  shipping: "Frete",
  marketing: "Marketing",
  fees: "Taxas de pagamento",
  taxes: "Impostos",
  maintenance: "Manutenção",
  equipment: "Equipamentos (pequenos)",
  other: "Outro",
};
export const expenseKindLabels: Record<ExpenseKind, string> = { cogs: "COGS (custo do produto)", opex: "OPEX (operação)" };
/** Categoria → tipo padrão (o admin pode mudar no lançamento). */
export const DEFAULT_EXPENSE_KIND: Record<ExpenseCategory, ExpenseKind> = {
  material: "cogs", supplies: "cogs", energy: "cogs", shipping: "cogs", fees: "cogs",
  cloud: "opex", software: "opex", rent: "opex", payroll: "opex", marketing: "opex", taxes: "opex", maintenance: "opex", equipment: "opex", other: "opex",
};
export const assetCategoryLabels: Record<AssetCategory, string> = { machine: "Máquina do studio", computer: "Computador", tool: "Ferramenta", furniture: "Mobiliário", other: "Outro" };
export const revenueLineLabels: Record<RevenueLine, string> = { catalog: "Catálogo (e-commerce)", custom: "Personalizados", service: "Serviço (modelagem/consultoria)", event: "Feira / evento", wholesale: "Atacado / revenda", other: "Outra" };
export const supplyCategoryLabels: Record<SupplyCategory, string> = { packaging: "Embalagem", hardware: "Ferragem (parafuso, ímã, inserto)", electronics: "Eletrônico (LED, bateria)", finishing: "Acabamento (tinta, lixa, cola)", tooling: "Ferramental / bico / peça", office: "Escritório", other: "Outro" };
export const supplyReasonLabels: Record<SupplyReason, string> = { purchase: "Compra", use: "Uso em produção", waste: "Perda", adjustment: "Ajuste", return: "Devolução" };

export const ticketStatusLabels: LabelMap<TicketStatus> = {
  open: { label: "Aberto", tone: "warning" },
  pending: { label: "Aguardando cliente", tone: "info" },
  resolved: { label: "Resolvido", tone: "success" },
  closed: { label: "Fechado", tone: "neutral" },
};

export const ticketCategoryLabels: Record<TicketCategory, string> = {
  order: "Pedido / entrega",
  quote: "Orçamento / personalizado",
  payment: "Pagamento",
  product: "Produto / defeito",
  privacy: "Meus dados (LGPD)",
  other: "Outro assunto",
};

export type { Tone };
