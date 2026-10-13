import { cookies } from "next/headers";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { products, productVariants, quotes } from "@/db/schema";
import { auth } from "./auth";
import { thumbUrl } from "./media";
import { canAccessQuote } from "./security";

// Carrinho vive num cookie JSON (sem banco). Preços são sempre recalculados no servidor.
const COOKIE = "ahl_cart";
const MAX_AGE = 60 * 60 * 24 * 30;

/** Linha de produto do catálogo OU item personalizado (orçamento aprovado pelo cliente). */
export type CartLine = {
  productId?: string | null;
  quoteId?: string | null;
  variantId?: string | null;
  quantity: number;
  customization?: string | null;
};

export type CartItem = CartLine & {
  name: string;
  href: string;
  imageUrl: string | null;
  variantLabel: string | null;
  unitPriceCents: number;
  /** custo unitário atual (snapshot no pedido) */
  unitCostCents: number;
  totalCents: number;
  maxQty: number;
  isCustom: boolean;
  /** dados de embalagem para cotação de frete (0 = padrão das configurações) */
  shipping: { weightGrams: number; materialGrams: number; widthCm: number; heightCm: number; lengthCm: number };
  /** para o prazo de produção: minutos de máquina por unidade e se sai do estoque pronto */
  printMinutes: number;
  laborMinutes: number;
  inStock: boolean;
};

export type Cart = { items: CartItem[]; subtotalCents: number; count: number };

export function lineKey(l: Pick<CartLine, "productId" | "quoteId" | "variantId" | "customization">) {
  if (l.quoteId) return `q:${l.quoteId}`;
  return `${l.productId}|${l.variantId ?? ""}|${l.customization ?? ""}`;
}

export async function readCartLines(): Promise<CartLine[]> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((l) => (l?.productId || l?.quoteId) && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

export async function writeCartLines(lines: CartLine[]) {
  const store = await cookies();
  if (lines.length === 0) {
    store.delete(COOKIE);
    return;
  }
  store.set(COOKIE, JSON.stringify(lines), { maxAge: MAX_AGE, path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
}

/** Hidrata as linhas do cookie com dados atuais de produto/variação/orçamento. Remove itens inválidos. */
export async function getCart(): Promise<Cart> {
  const lines = await readCartLines();
  if (lines.length === 0) return { items: [], subtotalCents: 0, count: 0 };

  const productIds = [...new Set(lines.map((l) => l.productId).filter((v): v is string => !!v))];
  const quoteIds = [...new Set(lines.map((l) => l.quoteId).filter((v): v is string => !!v))];
  const variantIds = lines.map((l) => l.variantId).filter((v): v is string => !!v);

  const [prods, variants, quoteRows, session] = await Promise.all([
    productIds.length ? db.query.products.findMany({ where: inArray(products.id, productIds), with: { images: { orderBy: (i, { asc }) => asc(i.sortOrder) } } }) : [],
    variantIds.length ? db.query.productVariants.findMany({ where: inArray(productVariants.id, variantIds) }) : [],
    quoteIds.length ? db.query.quotes.findMany({ where: inArray(quotes.id, quoteIds), with: { customer: true } }) : [],
    quoteIds.length ? auth() : null,
  ]);

  const items: CartItem[] = [];
  for (const line of lines) {
    if (line.quoteId) {
      // Item personalizado: só entra se estiver orçado, dentro da validade e pertencer ao usuário logado
      const q = quoteRows.find((x) => x.id === line.quoteId);
      if (!q || q.status !== "quoted" || !q.priceCents) continue;
      if (q.validUntil && q.validUntil < new Date()) continue;
      if (!session?.user || !canAccessQuote(q, session.user)) continue;
      items.push({
        ...line,
        quantity: 1,
        name: `Personalizado: ${q.title}`,
        href: `/orcamento/${q.id}`,
        imageUrl: null,
        variantLabel: `${q.quantity} un. · ${q.number}`,
        unitPriceCents: q.priceCents,
        unitCostCents: q.costCents ?? 0,
        totalCents: q.priceCents,
        maxQty: 1,
        isCustom: true,
        // personalizado: sem ficha → embalagem padrão, peso estimado pelas gramas do orçamento (se houver)
        shipping: { weightGrams: 0, materialGrams: (q.estimatedGrams ?? 0) * (q.quantity || 1), widthCm: 0, heightCm: 0, lengthCm: 0 },
        printMinutes: (q.estimatedMinutes ?? 0) * (q.quantity || 1),
        laborMinutes: 15 * (q.quantity || 1), // personalizado: acabamento estimado
        inStock: false,
      });
      continue;
    }
    const p = prods.find((x) => x.id === line.productId);
    if (!p || p.status !== "active") continue;
    const v = line.variantId ? variants.find((x) => x.id === line.variantId && x.productId === p.id) : null;
    if (line.variantId && !v) continue;
    const unit = p.priceCents + (v?.priceDeltaCents ?? 0);
    const maxQty = v ? v.stockQty : p.stockQty;
    const quantity = Math.max(1, Math.min(line.quantity, maxQty > 0 ? maxQty : 99));
    items.push({
      ...line,
      quantity,
      name: p.name,
      href: `/produtos/${p.slug}`,
      imageUrl: thumbUrl(p.images),
      variantLabel: v ? `${v.name}: ${v.value}` : null,
      unitPriceCents: unit,
      unitCostCents: p.costCents,
      totalCents: unit * quantity,
      maxQty,
      isCustom: false,
      shipping: { weightGrams: p.weightGrams, materialGrams: p.materialGrams, widthCm: p.widthCm, heightCm: p.heightCm, lengthCm: p.lengthCm },
      printMinutes: p.printMinutes,
      laborMinutes: p.laborMinutes,
      inStock: maxQty >= quantity,
    });
  }
  const subtotalCents = items.reduce((s, i) => s + i.totalCents, 0);
  return { items, subtotalCents, count: items.reduce((s, i) => s + i.quantity, 0) };
}
