"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, productImages, productMaterials, products, productVariants, PRODUCT_KINDS, PRODUCT_STATUS } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { parseBRLToCents } from "@/lib/money";
import { parseMediaLines } from "@/lib/media";
import { bomGrams, parseBom } from "@/lib/production";
import { normalizeTags } from "@/lib/tags";
import { slugify } from "@/lib/utils";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";

function revalidateCatalog(slug?: string) {
  revalidatePath("/");
  revalidatePath("/produtos");
  if (slug) revalidatePath(`/produtos/${slug}`);
  revalidatePath("/admin/produtos");
}

// ---------- categorias ----------
const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nome obrigatório"),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("products.manage");
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const slug = slugify(d.name);
  const values = { name: d.name, slug, description: d.description || null, imageUrl: d.imageUrl || null, sortOrder: d.sortOrder };
  if (d.id) await db.update(categories).set(values).where(eq(categories.id, d.id));
  else await db.insert(categories).values(values);
  await audit({ action: d.id ? "category.updated" : "category.created", entityType: "category", entityId: d.id ?? slug, summary: `Categoria "${d.name}"` });
  revalidateCatalog();
  revalidatePath("/admin/categorias");
  return { ok: true, message: "Categoria salva" };
}

export async function deleteCategoryAction(formData: FormData) {
  await requirePermission("products.manage");
  await db.delete(categories).where(eq(categories.id, String(formData.get("id"))));
  await audit({ action: "category.deleted", entityType: "category", entityId: String(formData.get("id")), summary: "Categoria excluída" });
  revalidateCatalog();
  revalidatePath("/admin/categorias");
}

// ---------- produtos ----------
const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nome obrigatório"),
  slug: z.string().optional(),
  sku: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(PRODUCT_STATUS),
  kind: z.enum(PRODUCT_KINDS).default("stock"),
  quoteBrief: z.string().max(3000).optional(),
  featured: z.string().optional(),
  tags: z.string().optional(), // separadas por vírgula
  price: z.string().min(1, "Preço obrigatório"),
  compareAtPrice: z.string().optional(),
  stockQty: z.coerce.number().int().default(0),
  targetStockQty: z.coerce.number().int().min(0).default(0),
  bom: z.string().optional(), // JSON [{materialId, gramsPerUnit, note}]
  printMinutes: z.coerce.number().int().min(0).default(0),
  laborMinutes: z.coerce.number().int().min(0).default(10),
  weightGrams: z.coerce.number().int().min(0).default(0),
  widthCm: z.coerce.number().int().min(0).max(105).default(0),
  heightCm: z.coerce.number().int().min(0).max(105).default(0),
  lengthCm: z.coerce.number().int().min(0).max(105).default(0),
  cost: z.string().optional(),
  isCustomizable: z.string().optional(),
  customizationHint: z.string().optional(),
  images: z.string().optional(), // uma URL por linha
});

export async function saveProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("products.manage");
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const slug = slugify(d.slug || d.name);
  const bom = parseBom(d.bom);

  const clash = await db.query.products.findFirst({
    where: d.id ? and(eq(products.slug, slug), ne(products.id, d.id)) : eq(products.slug, slug),
  });
  if (clash) return { error: `Já existe um produto com o slug "${slug}"` };

  const values = {
    name: d.name,
    slug,
    sku: d.sku || null,
    description: d.description || null,
    categoryId: d.categoryId || null,
    status: d.status,
    kind: d.kind,
    quoteBrief: d.quoteBrief || null,
    featured: d.featured === "on",
    tags: normalizeTags(d.tags),
    priceCents: parseBRLToCents(d.price),
    compareAtPriceCents: d.compareAtPrice ? parseBRLToCents(d.compareAtPrice) : null,
    stockQty: d.stockQty,
    targetStockQty: d.targetStockQty,
    // ficha técnica: material principal = primeira linha da BOM; gramas = soma
    materialId: bom[0]?.materialId ?? null,
    materialGrams: bomGrams(bom),
    printMinutes: d.printMinutes,
    laborMinutes: d.laborMinutes,
    // embalagem para frete (0 = padrão das configurações)
    weightGrams: d.weightGrams,
    widthCm: d.widthCm,
    heightCm: d.heightCm,
    lengthCm: d.lengthCm,
    costCents: parseBRLToCents(d.cost),
    isCustomizable: d.isCustomizable === "on",
    customizationHint: d.customizationHint || null,
  };

  let id = d.id;
  if (id) await db.update(products).set(values).where(eq(products.id, id));
  else [{ id }] = await db.insert(products).values(values).returning({ id: products.id });

  // BOM: substitui a lista inteira
  await db.delete(productMaterials).where(eq(productMaterials.productId, id));
  if (bom.length) await db.insert(productMaterials).values(bom.map((l, i) => ({ productId: id!, materialId: l.materialId, gramsPerUnit: l.gramsPerUnit, note: l.note ?? null, sortOrder: i })));

  // Mídias: substitui a lista inteira pela textarea (uma por linha: "url" ou "url | poster"); vídeo detectado pela extensão
  const media = parseMediaLines(d.images);
  await db.delete(productImages).where(eq(productImages.productId, id));
  if (media.length) await db.insert(productImages).values(media.map((m, i) => ({ productId: id!, url: m.url, type: m.type, posterUrl: m.posterUrl, sortOrder: i })));

  await audit({ action: d.id ? "product.updated" : "product.created", entityType: "product", entityId: id, summary: `Produto "${d.name}" · ${values.status} · R$ ${(values.priceCents / 100).toFixed(2)}`, meta: { priceCents: values.priceCents, costCents: values.costCents, stockQty: values.stockQty } });
  revalidateCatalog(slug);
  if (!d.id) redirect(`/admin/produtos/${id}`);
  return { ok: true, message: "Produto salvo" };
}

export async function deleteProductAction(formData: FormData) {
  await requirePermission("products.manage");
  await db.delete(products).where(eq(products.id, String(formData.get("id"))));
  await audit({ action: "product.deleted", entityType: "product", entityId: String(formData.get("id")), summary: "Produto excluído", level: "warn" });
  revalidateCatalog();
  redirect("/admin/produtos");
}

// ---------- variações ----------
const variantSchema = z.object({
  productId: z.string(),
  name: z.string().min(1, "Nome (ex.: Cor)"),
  value: z.string().min(1, "Valor (ex.: Preto)"),
  colorHex: z.string().optional(),
  priceDelta: z.string().optional(),
  stockQty: z.coerce.number().int().default(0),
  materialId: z.string().optional(),
});

export async function addVariantAction(formData: FormData) {
  await requirePermission("products.manage");
  const parsed = variantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const d = parsed.data;
  await db.insert(productVariants).values({
    productId: d.productId,
    name: d.name,
    value: d.value,
    colorHex: d.colorHex || null,
    priceDeltaCents: parseBRLToCents(d.priceDelta),
    stockQty: d.stockQty,
    materialId: d.materialId || null,
  });
  const p = await db.query.products.findFirst({ where: eq(products.id, d.productId) });
  revalidateCatalog(p?.slug);
  revalidatePath(`/admin/produtos/${d.productId}`);
}

export async function deleteVariantAction(formData: FormData) {
  await requirePermission("products.manage");
  const id = String(formData.get("id"));
  const v = await db.query.productVariants.findFirst({ where: eq(productVariants.id, id), with: { product: true } });
  await db.delete(productVariants).where(eq(productVariants.id, id));
  revalidateCatalog(v?.product.slug);
  if (v) revalidatePath(`/admin/produtos/${v.productId}`);
}
