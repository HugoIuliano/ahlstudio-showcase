import { relations, sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AdapterAccountType } from "next-auth/adapters";

// Convenções:
//  - ids são texto (crypto.randomUUID())
//  - dinheiro em centavos (integer)
//  - datas como integer timestamp_ms (mode: "timestamp_ms")
//  - enums como text com union em TS (SQLite não tem enum nativo)

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

// =====================================================================
// AUTH (Auth.js) — users com papel + tabelas do adapter
// =====================================================================
/**
 * Papéis (RBAC): customer = comprador; support = atendimento/CRM; production = studio/estoque;
 * admin = tudo (financeiro, configurações, usuários, auditoria). Permissões em lib/rbac.ts.
 */
export const USER_ROLES = ["customer", "support", "production", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = sqliteTable("users", {
  id: id(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("email_verified", { mode: "timestamp_ms" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  role: text("role").$type<UserRole>().notNull().default("customer"),
  phone: text("phone"), // WhatsApp do cliente (editável em /conta)
  document: text("document"), // CPF/CNPJ opcional (nota fiscal / declaração de conteúdo)
  active: integer("active", { mode: "boolean" }).notNull().default(true), // bloqueio de acesso sem apagar histórico
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

export const accounts = sqliteTable(
  "accounts",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = sqliteTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// =====================================================================
// CATÁLOGO
// =====================================================================
export const PRODUCT_STATUS = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

/** stock = compra direta no carrinho · custom = item do catálogo que gera orçamento pré-preenchido */
export const PRODUCT_KINDS = ["stock", "custom"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const categories = sqliteTable("categories", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const products = sqliteTable(
  "products",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    sku: text("sku"),
    description: text("description"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    status: text("status").$type<ProductStatus>().notNull().default("draft"),
    kind: text("kind").$type<ProductKind>().notNull().default("stock"),
    // para kind=custom: roteiro de perguntas que pré-preenche a descrição do orçamento
    quoteBrief: text("quote_brief"),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    // tags geram seções dinâmicas na home: destaques, novidades, black-friday, limpa-estoque…
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    priceCents: integer("price_cents").notNull().default(0),
    compareAtPriceCents: integer("compare_at_price_cents"),
    stockQty: integer("stock_qty").notNull().default(0),
    targetStockQty: integer("target_stock_qty").notNull().default(0), // estoque saudável desejado (0 = sugerir pela velocidade de venda)
    // dados de produção (ERP) — usados para custo, fila de impressão e baixa de estoque
    materialId: text("material_id").references(() => materials.id, { onDelete: "set null" }),
    materialGrams: integer("material_grams").notNull().default(0),
    printMinutes: integer("print_minutes").notNull().default(0),
    laborMinutes: integer("labor_minutes").notNull().default(10), // pós-processamento por unidade (lixar, montar, embalar) — mão de obra
    costCents: integer("cost_cents").notNull().default(0),
    // permite o cliente pedir cor/texto/ajuste no carrinho
    isCustomizable: integer("is_customizable", { mode: "boolean" }).notNull().default(false),
    customizationHint: text("customization_hint"),
    // embalagem para cotação de frete (0 = usa o padrão das configurações; peso 0 = gramas de material + embalagem)
    weightGrams: integer("weight_grams").notNull().default(0),
    widthCm: integer("width_cm").notNull().default(0),
    heightCm: integer("height_cm").notNull().default(0),
    lengthCm: integer("length_cm").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_category_idx").on(t.categoryId), index("products_status_idx").on(t.status)],
);

/**
 * Ficha técnica (BOM): quais filamentos e quantas gramas cada unidade do produto consome.
 * products.materialGrams é a soma (denormalizada) e products.materialId o material principal.
 */
export const productMaterials = sqliteTable(
  "product_materials",
  {
    id: id(),
    productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    materialId: text("material_id").notNull().references(() => materials.id, { onDelete: "restrict" }),
    gramsPerUnit: integer("grams_per_unit").notNull().default(0),
    note: text("note"), // "corpo", "detalhe", "suporte"
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("product_materials_product_idx").on(t.productId)],
);

export const MEDIA_TYPES = ["image", "video"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** Mídia do produto (foto ou vídeo vertical, estilo Instagram). type é inferido da extensão da URL. */
export const productImages = sqliteTable("product_images", {
  id: id(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  type: text("type").$type<MediaType>().notNull().default("image"),
  posterUrl: text("poster_url"), // capa do vídeo (opcional)
  alt: text("alt"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Variação simples (ex.: Cor = Preto). priceDelta soma ao preço base. */
export const productVariants = sqliteTable("product_variants", {
  id: id(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // "Cor", "Tamanho"
  value: text("value").notNull(), // "Preto", "Grande"
  colorHex: text("color_hex"),
  priceDeltaCents: integer("price_delta_cents").notNull().default(0),
  stockQty: integer("stock_qty").notNull().default(0),
  materialId: text("material_id").references(() => materials.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
});

// =====================================================================
// CRM — clientes (independente de users: admin cadastra cliente do WhatsApp)
// =====================================================================
export const CUSTOMER_STAGES = ["lead", "active", "vip", "inactive"] as const;
export type CustomerStage = (typeof CUSTOMER_STAGES)[number];

export const customers = sqliteTable(
  "customers",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    document: text("document"), // CPF/CNPJ
    instagram: text("instagram"),
    stage: text("stage").$type<CustomerStage>().notNull().default("lead"),
    source: text("source"), // instagram, whatsapp, site, indicação, feira
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("customers_email_idx").on(t.email), index("customers_stage_idx").on(t.stage)],
);

/** Endereços: do cliente do CRM (customerId) e/ou do usuário logado (userId — "meus endereços" em /conta). */
export const addresses = sqliteTable(
  "addresses",
  {
    id: id(),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    label: text("label").default("Principal"), // Casa, Trabalho, Mãe…
    recipient: text("recipient"),
    phone: text("phone"),
    street: text("street").notNull(),
    number: text("number").notNull(),
    complement: text("complement"),
    district: text("district"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(), // só dígitos (8)
    reference: text("reference"), // ponto de referência para entrega local
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("addresses_user_idx").on(t.userId), index("addresses_customer_idx").on(t.customerId)],
);

/**
 * Zonas de entrega local (motoboy/carro do studio) por faixa de CEP.
 * cepStart/cepEnd são inteiros de 8 dígitos (13465000–13479999 = Americana).
 */
export const shippingZones = sqliteTable("shipping_zones", {
  id: id(),
  name: text("name").notNull(), // "Zona 1 — Americana"
  cepStart: integer("cep_start").notNull(),
  cepEnd: integer("cep_end").notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  costCents: integer("cost_cents").notNull().default(0), // custo estimado para o studio (combustível/tempo) — vai para o COGS do pedido
  freeFromCents: integer("free_from_cents").notNull().default(0), // 0 = nunca grátis
  minDays: integer("min_days").notNull().default(1),
  maxDays: integer("max_days").notNull().default(2),
  note: text("note"), // "entregas às terças e quintas"
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});
export type ShippingZone = typeof shippingZones.$inferSelect;

export const INTERACTION_TYPES = ["note", "whatsapp", "email", "call", "meeting", "instagram"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const interactions = sqliteTable("interactions", {
  id: id(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type").$type<InteractionType>().notNull().default("note"),
  content: text("content").notNull(),
  followUpAt: integer("follow_up_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

// =====================================================================
// ORÇAMENTOS / PROJETOS PERSONALIZADOS
// =====================================================================
export const QUOTE_STATUS = [
  "new", // cliente enviou
  "reviewing", // admin analisando / modelando
  "quoted", // preço enviado, aguardando cliente
  "approved", // cliente aprovou -> vira pedido
  "rejected",
  "cancelled",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUS)[number];

export const quotes = sqliteTable(
  "quotes",
  {
    id: id(),
    number: text("number").notNull().unique(), // ORC-2409-XXXX
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").$type<QuoteStatus>().notNull().default("new"),
    // orçamento originado de um item personalizado do catálogo (kind=custom)
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    // links de referência (Drive, Thingiverse, Printables, imagem…). Upload direto fica para depois (GCS).
    referenceLinks: text("reference_links", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    quantity: integer("quantity").notNull().default(1),
    desiredMaterial: text("desired_material"),
    desiredColor: text("desired_color"),
    dimensions: text("dimensions"), // "100 x 50 x 20 mm"
    deadline: text("deadline"),
    // preenchido pelo admin
    materialId: text("material_id").references(() => materials.id, { onDelete: "set null" }),
    estimatedGrams: integer("estimated_grams"),
    estimatedMinutes: integer("estimated_minutes"),
    costCents: integer("cost_cents"),
    priceCents: integer("price_cents"),
    validUntil: integer("valid_until", { mode: "timestamp_ms" }),
    adminNotes: text("admin_notes"),
    orderId: text("order_id"),
    // token para acesso do solicitante sem conta (?t=)
    accessToken: text("access_token").$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("quotes_status_idx").on(t.status), index("quotes_customer_idx").on(t.customerId)],
);

export const quoteMessages = sqliteTable("quote_messages", {
  id: id(),
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  authorName: text("author_name"),
  body: text("body").notNull(),
  isInternal: integer("is_internal", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

// =====================================================================
// PEDIDOS
// =====================================================================
export const ORDER_STATUS = [
  "pending_payment",
  "paid",
  "in_production",
  "ready", // pronto para retirada/envio
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

export const PAYMENT_STATUS = ["pending", "approved", "rejected", "refunded", "cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const PAYMENT_METHODS = ["mercadopago", "pix_manual", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SHIPPING_METHODS = ["pickup", "delivery", "correios"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export type ShippingAddress = {
  recipient: string;
  street: string;
  number: string;
  complement?: string;
  district?: string;
  city: string;
  state: string;
  zip: string;
  reference?: string; // ponto de referência (entrega local)
};

export const orders = sqliteTable(
  "orders",
  {
    id: id(),
    number: text("number").notNull().unique(), // PED-2409-XXXX
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").$type<OrderStatus>().notNull().default("pending_payment"),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("pending"),
    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull().default("pix_manual"),
    shippingMethod: text("shipping_method").$type<ShippingMethod>().notNull().default("pickup"),
    // snapshot da cotação escolhida: serviço ("SEDEX", "Zona 1 — Americana"), transportadora, prazo e CEP cotado
    shippingService: text("shipping_service"),
    shippingCarrier: text("shipping_carrier"),
    shippingDaysMin: integer("shipping_days_min"),
    shippingDaysMax: integer("shipping_days_max"),
    shippingZip: text("shipping_zip"),
    // o que o studio paga de fato pelo envio (etiqueta SuperFrete/Melhor Envio ou custo da entrega local) — entra no COGS
    shippingCostCents: integer("shipping_cost_cents").notNull().default(0),
    // prazo de produção (dias úteis) estimado no checkout a partir dos itens; admin pode ajustar. Entrega prevista = produção + frete.
    productionDays: integer("production_days").notNull().default(0),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    // snapshot do cliente no momento da compra
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone"),
    shippingAddress: text("shipping_address", { mode: "json" }).$type<ShippingAddress | null>(),
    customerNotes: text("customer_notes"),
    adminNotes: text("admin_notes"),
    trackingCode: text("tracking_code"),
    // token para acesso do comprador convidado à página do pedido (?t=)
    accessToken: text("access_token").$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
    // Mercado Pago
    mpPreferenceId: text("mp_preference_id"),
    mpPaymentId: text("mp_payment_id"),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("orders_status_idx").on(t.status), index("orders_customer_idx").on(t.customerId)],
);

export const orderItems = sqliteTable("order_items", {
  id: id(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  variantId: text("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  quoteId: text("quote_id").references(() => quotes.id, { onDelete: "set null" }),
  name: text("name").notNull(), // snapshot
  variantLabel: text("variant_label"),
  customization: text("customization"),
  quantity: integer("quantity").notNull().default(1),
  // quantas unidades faltavam em estoque na compra → viram job na fila quando o pedido é pago
  toProduceQty: integer("to_produce_qty").notNull().default(0),
  unitPriceCents: integer("unit_price_cents").notNull(),
  // snapshot do custo unitário no momento da compra (COGS histórico não muda se o produto for editado)
  unitCostCents: integer("unit_cost_cents"),
  totalCents: integer("total_cents").notNull(),
});

/** Linha do tempo do pedido (status, pagamento, envio, notas). */
export const orderEvents = sqliteTable("order_events", {
  id: id(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // created | payment | status | note | shipping
  message: text("message").notNull(),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

// =====================================================================
// ERP — materiais, estoque, impressoras, fila de impressão, despesas
// =====================================================================
export const MATERIAL_TYPES = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "Nylon", "Resina", "Outro"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const materials = sqliteTable("materials", {
  id: id(),
  name: text("name").notNull(), // "PLA Preto Voolt"
  type: text("type").$type<MaterialType>().notNull().default("PLA"),
  brand: text("brand"),
  color: text("color"),
  colorHex: text("color_hex"),
  costPerKgCents: integer("cost_per_kg_cents").notNull().default(0),
  stockGrams: integer("stock_grams").notNull().default(0),
  minStockGrams: integer("min_stock_grams").notNull().default(200),
  supplier: text("supplier"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const STOCK_REASONS = ["purchase", "print", "waste", "adjustment", "return"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: id(),
    materialId: text("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
    deltaGrams: integer("delta_grams").notNull(), // + entrada / - saída
    reason: text("reason").$type<StockReason>().notNull(),
    unitCostCents: integer("unit_cost_cents"), // custo do kg na compra
    refType: text("ref_type"), // print_job | order | manual
    refId: text("ref_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("stock_movements_material_idx").on(t.materialId)],
);

export const PRINTER_STATUS = ["idle", "printing", "maintenance", "offline"] as const;
export type PrinterStatus = (typeof PRINTER_STATUS)[number];

export const printers = sqliteTable("printers", {
  id: id(),
  name: text("name").notNull(), // "Ender 3 V2 #1"
  model: text("model"),
  status: text("status").$type<PrinterStatus>().notNull().default("idle"),
  hourlyCostCents: integer("hourly_cost_cents").notNull().default(150), // energia + desgaste
  bedSize: text("bed_size"), // "220x220x250"
  notes: text("notes"),
  totalPrintMinutes: integer("total_print_minutes").notNull().default(0),
  createdAt: createdAt(),
});

export const PRINT_JOB_STATUS = ["queued", "printing", "done", "failed", "cancelled"] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUS)[number];

export const printJobs = sqliteTable(
  "print_jobs",
  {
    id: id(),
    title: text("title").notNull(),
    status: text("status").$type<PrintJobStatus>().notNull().default("queued"),
    priority: integer("priority").notNull().default(0), // maior = mais urgente
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    orderItemId: text("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    quoteId: text("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: text("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    printerId: text("printer_id").references(() => printers.id, { onDelete: "set null" }),
    materialId: text("material_id").references(() => materials.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull().default(1), // planejadas
    // resultado da fornada
    producedQty: integer("produced_qty"), // boas
    failedQty: integer("failed_qty"), // perdidas
    wasteGrams: integer("waste_grams"), // material jogado fora (falhas, purga, suporte)
    estimatedMinutes: integer("estimated_minutes").notNull().default(0),
    laborMinutes: integer("labor_minutes").notNull().default(0), // pós-processamento total planejado (fila de mão de obra)
    actualMinutes: integer("actual_minutes"),
    estimatedGrams: integer("estimated_grams").notNull().default(0),
    actualGrams: integer("actual_grams"), // gramas nas peças boas
    // sem orderId e com productId => fornada para repor estoque
    addsToStock: integer("adds_to_stock", { mode: "boolean" }).notNull().default(false),
    // prazo alvo (pagamento + prazo de produção prometido ao cliente); a fila é ordenada por ele
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("print_jobs_status_idx").on(t.status), index("print_jobs_order_idx").on(t.orderId)],
);

export const EXPENSE_CATEGORIES = [
  "material", // filamento/resina (COGS)
  "supplies", // insumos do almoxarifado (COGS)
  "energy", // energia elétrica
  "cloud", // Cloud Run, Turso, domínio
  "software", // SaaS, licenças
  "rent", // aluguel / espaço
  "payroll", // pró-labore / equipe
  "shipping", // frete pago pela loja
  "marketing",
  "fees", // taxas de pagamento / bancárias
  "taxes", // impostos
  "maintenance", // manutenção de máquinas
  "equipment", // pequenos equipamentos (não capitalizados)
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
/** COGS entra na margem bruta; OPEX abaixo dela (EBITDA). */
export const EXPENSE_KINDS = ["cogs", "opex"] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export const expenses = sqliteTable(
  "expenses",
  {
    id: id(),
    description: text("description").notNull(),
    category: text("category").$type<ExpenseCategory>().notNull().default("other"),
    kind: text("kind").$type<ExpenseKind>().notNull().default("opex"),
    amountCents: integer("amount_cents").notNull(),
    date: integer("date", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    // recorrente mensal: vale de date até endDate (ou indefinido) e é contabilizada em cada mês
    recurring: integer("recurring", { mode: "boolean" }).notNull().default(false),
    endDate: integer("end_date", { mode: "timestamp_ms" }),
    supplier: text("supplier"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_date_idx").on(t.date), index("expenses_kind_idx").on(t.kind)],
);

// ---------- CAPEX: ativos com depreciação linear ----------
export const ASSET_CATEGORIES = ["machine", "computer", "tool", "furniture", "other"] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const assets = sqliteTable("assets", {
  id: id(),
  name: text("name").notNull(),
  category: text("category").$type<AssetCategory>().notNull().default("machine"),
  amountCents: integer("amount_cents").notNull(),
  purchaseDate: integer("purchase_date", { mode: "timestamp_ms" }).notNull(),
  usefulLifeMonths: integer("useful_life_months").notNull().default(36),
  salvageCents: integer("salvage_cents").notNull().default(0),
  printerId: text("printer_id").references(() => printers.id, { onDelete: "set null" }),
  note: text("note"),
  disposedAt: integer("disposed_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

// ---------- Receitas fora do e-commerce (feira, serviço de modelagem, venda direta) ----------
export const REVENUE_LINES = ["catalog", "custom", "service", "event", "wholesale", "other"] as const;
export type RevenueLine = (typeof REVENUE_LINES)[number];

export const manualRevenues = sqliteTable("manual_revenues", {
  id: id(),
  description: text("description").notNull(),
  line: text("line").$type<RevenueLine>().notNull().default("other"),
  amountCents: integer("amount_cents").notNull(),
  costCents: integer("cost_cents").notNull().default(0),
  date: integer("date", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  note: text("note"),
  createdAt: createdAt(),
});

// =====================================================================
// ALMOXARIFADO — insumos além de filamento (embalagem, LEDs, parafusos, ímãs, tinta…)
// =====================================================================
export const SUPPLY_CATEGORIES = ["packaging", "hardware", "electronics", "finishing", "tooling", "office", "other"] as const;
export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];
export const SUPPLY_UNITS = ["un", "par", "kit", "m", "cm", "kg", "g", "l", "ml", "folha"] as const;
export type SupplyUnit = (typeof SUPPLY_UNITS)[number];

export const supplies = sqliteTable("supplies", {
  id: id(),
  name: text("name").notNull(),
  sku: text("sku"),
  category: text("category").$type<SupplyCategory>().notNull().default("other"),
  unit: text("unit").$type<SupplyUnit>().notNull().default("un"),
  qty: real("qty").notNull().default(0),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
  minQty: real("min_qty").notNull().default(0),
  location: text("location"), // prateleira / caixa
  supplier: text("supplier"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const SUPPLY_REASONS = ["purchase", "use", "waste", "adjustment", "return"] as const;
export type SupplyReason = (typeof SUPPLY_REASONS)[number];

export const supplyMovements = sqliteTable(
  "supply_movements",
  {
    id: id(),
    supplyId: text("supply_id").notNull().references(() => supplies.id, { onDelete: "cascade" }),
    delta: real("delta").notNull(),
    reason: text("reason").$type<SupplyReason>().notNull(),
    unitCostCents: integer("unit_cost_cents"),
    refType: text("ref_type"),
    refId: text("ref_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("supply_movements_supply_idx").on(t.supplyId)],
);

/** Insumos por unidade de produto (complementa a BOM de filamento). */
export const productSupplies = sqliteTable(
  "product_supplies",
  {
    id: id(),
    productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    supplyId: text("supply_id").notNull().references(() => supplies.id, { onDelete: "restrict" }),
    qtyPerUnit: real("qty_per_unit").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("product_supplies_product_idx").on(t.productId)],
);

// =====================================================================
// ANEXOS — arquivos de referência (orçamentos) e de chamados.
// Guardados no próprio banco (libSQL BLOB) para não depender de storage pago; limite por arquivo em lib/uploads.ts.
// =====================================================================
export const ATTACHMENT_REFS = ["quote_message", "ticket_message"] as const;
export type AttachmentRef = (typeof ATTACHMENT_REFS)[number];

export const attachments = sqliteTable(
  "attachments",
  {
    id: id(),
    refType: text("ref_type").$type<AttachmentRef>().notNull(),
    refId: text("ref_id").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    uploaderId: text("uploader_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_ref_idx").on(t.refType, t.refId)],
);

// =====================================================================
// ATENDIMENTO — central de ajuda / chamados (ticketing)
// =====================================================================
export const TICKET_STATUS = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUS)[number];
export const TICKET_CATEGORIES = ["order", "quote", "payment", "product", "privacy", "other"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const tickets = sqliteTable(
  "tickets",
  {
    id: id(),
    number: text("number").notNull().unique(), // CHM-2409-XXXX
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    subject: text("subject").notNull(),
    category: text("category").$type<TicketCategory>().notNull().default("other"),
    status: text("status").$type<TicketStatus>().notNull().default("open"),
    priority: integer("priority").notNull().default(0),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    quoteId: text("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    accessToken: text("access_token").$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
    lastCustomerMessageAt: integer("last_customer_message_at", { mode: "timestamp_ms" }),
    lastAdminMessageAt: integer("last_admin_message_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tickets_status_idx").on(t.status), index("tickets_email_idx").on(t.email)],
);

export const ticketMessages = sqliteTable("ticket_messages", {
  id: id(),
  ticketId: text("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  authorName: text("author_name"),
  fromAdmin: integer("from_admin", { mode: "boolean" }).notNull().default(false),
  isInternal: integer("is_internal", { mode: "boolean" }).notNull().default(false),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  customer: one(customers, { fields: [tickets.customerId], references: [customers.id] }),
  order: one(orders, { fields: [tickets.orderId], references: [orders.id] }),
  quote: one(quotes, { fields: [tickets.quoteId], references: [quotes.id] }),
  messages: many(ticketMessages),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketMessages.ticketId], references: [tickets.id] }),
}));

// =====================================================================
// AUDITORIA / LOGS DE SISTEMA — tudo que acontece (cliente, backoffice e sistema)
// =====================================================================
export const AUDIT_CHANNELS = ["customer", "backoffice", "system"] as const;
export type AuditChannel = (typeof AUDIT_CHANNELS)[number];
export const AUDIT_LEVELS = ["info", "warn", "error"] as const;
export type AuditLevel = (typeof AUDIT_LEVELS)[number];

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    channel: text("channel").$type<AuditChannel>().notNull(),
    level: text("level").$type<AuditLevel>().notNull().default("info"),
    action: text("action").notNull(), // ex.: order.created, product.updated, auth.login_failed
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    entityType: text("entity_type"), // order | product | quote | ticket | user | settings | material | print_job…
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    path: text("path"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_actor_idx").on(t.actorId), index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_action_idx").on(t.action)],
);

// =====================================================================
// RATE LIMIT — contadores por chave (ip/e-mail + ação) em janelas fixas. Funciona com várias instâncias (Cloud Run).
// =====================================================================
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), // ex.: "login:ip:1.2.3.4"
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
  count: integer("count").notNull().default(0),
});

// =====================================================================
// LGPD — registro de consentimentos e solicitações do titular
// =====================================================================
export const CONSENT_TYPES = ["terms", "privacy", "cookies", "deletion_request", "export_request"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const consents = sqliteTable(
  "consents",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email"),
    type: text("type").$type<ConsentType>().notNull(),
    version: text("version").notNull(), // versão do documento aceito
    ip: text("ip"),
    userAgent: text("user_agent"),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("consents_email_idx").on(t.email), index("consents_type_idx").on(t.type)],
);

/** Configurações da loja (chave/valor). Ver src/lib/settings.ts para chaves conhecidas. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

// =====================================================================
// RELATIONS (para db.query.*)
// =====================================================================
export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  customer: one(customers, { fields: [users.id], references: [customers.userId] }),
  addresses: many(addresses),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({ products: many(products) }));

export const suppliesRelations = relations(supplies, ({ many }) => ({ movements: many(supplyMovements), usedIn: many(productSupplies) }));
export const supplyMovementsRelations = relations(supplyMovements, ({ one }) => ({ supply: one(supplies, { fields: [supplyMovements.supplyId], references: [supplies.id] }) }));
export const productSuppliesRelations = relations(productSupplies, ({ one }) => ({
  product: one(products, { fields: [productSupplies.productId], references: [products.id] }),
  supply: one(supplies, { fields: [productSupplies.supplyId], references: [supplies.id] }),
}));
export const assetsRelations = relations(assets, ({ one }) => ({ printer: one(printers, { fields: [assets.printerId], references: [printers.id] }) }));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  material: one(materials, { fields: [products.materialId], references: [materials.id] }),
  images: many(productImages),
  variants: many(productVariants),
  bom: many(productMaterials),
  suppliesBom: many(productSupplies),
  printJobs: many(printJobs),
}));

export const productMaterialsRelations = relations(productMaterials, ({ one }) => ({
  product: one(products, { fields: [productMaterials.productId], references: [products.id] }),
  material: one(materials, { fields: [productMaterials.materialId], references: [materials.id] }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  material: one(materials, { fields: [productVariants.materialId], references: [materials.id] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  user: one(users, { fields: [customers.userId], references: [users.id] }),
  addresses: many(addresses),
  interactions: many(interactions),
  orders: many(orders),
  quotes: many(quotes),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  customer: one(customers, { fields: [addresses.customerId], references: [customers.id] }),
  user: one(users, { fields: [addresses.userId], references: [users.id] }),
}));

export const interactionsRelations = relations(interactions, ({ one }) => ({
  customer: one(customers, { fields: [interactions.customerId], references: [customers.id] }),
  author: one(users, { fields: [interactions.authorId], references: [users.id] }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  customer: one(customers, { fields: [quotes.customerId], references: [customers.id] }),
  product: one(products, { fields: [quotes.productId], references: [products.id] }),
  material: one(materials, { fields: [quotes.materialId], references: [materials.id] }),
  messages: many(quoteMessages),
  printJobs: many(printJobs),
}));

export const quoteMessagesRelations = relations(quoteMessages, ({ one }) => ({
  quote: one(quotes, { fields: [quoteMessages.quoteId], references: [quotes.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
  events: many(orderEvents),
  printJobs: many(printJobs),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  variant: one(productVariants, { fields: [orderItems.variantId], references: [productVariants.id] }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));

export const materialsRelations = relations(materials, ({ many }) => ({
  movements: many(stockMovements),
  printJobs: many(printJobs),
  usedIn: many(productMaterials),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  material: one(materials, { fields: [stockMovements.materialId], references: [materials.id] }),
}));

export const printersRelations = relations(printers, ({ many }) => ({ jobs: many(printJobs) }));

export const printJobsRelations = relations(printJobs, ({ one }) => ({
  printer: one(printers, { fields: [printJobs.printerId], references: [printers.id] }),
  material: one(materials, { fields: [printJobs.materialId], references: [materials.id] }),
  order: one(orders, { fields: [printJobs.orderId], references: [orders.id] }),
  quote: one(quotes, { fields: [printJobs.quoteId], references: [quotes.id] }),
  product: one(products, { fields: [printJobs.productId], references: [products.id] }),
  variant: one(productVariants, { fields: [printJobs.variantId], references: [productVariants.id] }),
}));

// Tipos inferidos
export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductMaterial = typeof productMaterials.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteMessage = typeof quoteMessages.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Printer = typeof printers.$inferSelect;
export type PrintJob = typeof printJobs.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type ManualRevenue = typeof manualRevenues.$inferSelect;
export type Supply = typeof supplies.$inferSelect;
export type SupplyMovement = typeof supplyMovements.$inferSelect;
export type ProductSupply = typeof productSupplies.$inferSelect;
export type Consent = typeof consents.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type TicketMessage = typeof ticketMessages.$inferSelect;
