/** Fábricas de dados para os testes — inserem direto no banco de teste. */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, materials, printers, productMaterials, products, productVariants, users } from "@/db/schema";

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export function fd(obj: Record<string, string | number | File | undefined | null>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) if (v != null) f.append(k, v instanceof File ? v : String(v));
  return f;
}

export async function makeUser(role: "customer" | "support" | "production" | "admin" = "customer", overrides: Partial<{ email: string; name: string; passwordHash: string; active: boolean }> = {}) {
  const email = overrides.email ?? `${role}-${uid()}@teste.local`;
  const [u] = await db.insert(users).values({ email, name: overrides.name ?? `Usuário ${role}`, role, passwordHash: overrides.passwordHash ?? "$2a$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345", active: overrides.active ?? true }).returning();
  return u;
}

export async function makeMaterial(overrides: Partial<{ name: string; costPerKgCents: number; stockGrams: number }> = {}) {
  const [m] = await db.insert(materials).values({ name: overrides.name ?? `PLA Teste ${uid()}`, type: "PLA", costPerKgCents: overrides.costPerKgCents ?? 10000, stockGrams: overrides.stockGrams ?? 1000, minStockGrams: 100 }).returning();
  return m;
}

export async function makePrinter() {
  const [p] = await db.insert(printers).values({ name: `Máquina ${uid()}`, hourlyCostCents: 120 }).returning();
  return p;
}

export async function makeCategory() {
  const s = uid();
  const [c] = await db.insert(categories).values({ name: `Cat ${s}`, slug: `cat-${s}` }).returning();
  return c;
}

export async function makeProduct(overrides: Partial<{ name: string; priceCents: number; stockQty: number; kind: "stock" | "custom"; status: "draft" | "active" | "archived"; materialId: string; gramsPerUnit: number; printMinutes: number; costCents: number; isCustomizable: boolean }> = {}) {
  const s = uid();
  const material = overrides.materialId ? await db.query.materials.findFirst({ where: eq(materials.id, overrides.materialId) }) : await makeMaterial();
  const [p] = await db
    .insert(products)
    .values({
      name: overrides.name ?? `Produto ${s}`,
      slug: `produto-${s}`,
      status: overrides.status ?? "active",
      kind: overrides.kind ?? "stock",
      priceCents: overrides.priceCents ?? 4990,
      stockQty: overrides.stockQty ?? 10,
      materialId: material!.id,
      materialGrams: overrides.gramsPerUnit ?? 50,
      printMinutes: overrides.printMinutes ?? 120,
      costCents: overrides.costCents ?? 1500,
      isCustomizable: overrides.isCustomizable ?? false,
    })
    .returning();
  await db.insert(productMaterials).values({ productId: p.id, materialId: material!.id, gramsPerUnit: overrides.gramsPerUnit ?? 50, sortOrder: 0 });
  return { product: p, material: material! };
}

export async function makeVariant(productId: string, value: string, stockQty = 5, materialId?: string) {
  const [v] = await db.insert(productVariants).values({ productId, name: "Cor", value, stockQty, materialId: materialId ?? null }).returning();
  return v;
}

export function pngFile(name = "foto.png", bytes = 1024) {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}
