"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { assets, expenses, manualRevenues, productSupplies, supplies, supplyMovements, ASSET_CATEGORIES, EXPENSE_CATEGORIES, EXPENSE_KINDS, REVENUE_LINES, SUPPLY_CATEGORIES, SUPPLY_REASONS, SUPPLY_UNITS } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { DEFAULT_EXPENSE_KIND } from "@/lib/labels";
import { parseBRLToCents } from "@/lib/money";
import type { ActionState } from "@/components/ui/form-message";

const money = (v: unknown) => parseBRLToCents(String(v ?? ""));
const revalidateFinance = () => ["/admin/financeiro", "/admin/forecast", "/admin/relatorios", "/admin"].forEach((p) => revalidatePath(p));

// ---------- despesas (OPEX/COGS, avulsas ou recorrentes) ----------
const expenseSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(2, "Descrição obrigatória").max(160),
  category: z.enum(EXPENSE_CATEGORIES),
  kind: z.enum(EXPENSE_KINDS).optional(),
  amount: z.string().min(1, "Valor obrigatório"),
  date: z.string().optional(),
  recurring: z.string().optional(),
  endDate: z.string().optional(),
  supplier: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

export async function saveExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("finance.manage");
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const values = {
    description: d.description,
    category: d.category,
    kind: d.kind ?? DEFAULT_EXPENSE_KIND[d.category],
    amountCents: money(d.amount),
    date: d.date ? new Date(`${d.date}T12:00:00`) : new Date(),
    recurring: d.recurring === "on",
    endDate: d.endDate ? new Date(`${d.endDate}T12:00:00`) : null,
    supplier: d.supplier || null,
    note: d.note || null,
  };
  if (values.amountCents <= 0) return { error: "Valor precisa ser maior que zero" };
  if (d.id) await db.update(expenses).set(values).where(eq(expenses.id, d.id));
  else await db.insert(expenses).values(values);
  await audit({ action: d.id ? "expense.updated" : "expense.created", entityType: "expense", entityId: d.id, summary: `${values.recurring ? "Recorrente" : "Despesa"} "${d.description}" · R$ ${(values.amountCents / 100).toFixed(2)} (${d.category}/${values.kind})` });
  revalidateFinance();
  return { ok: true, message: "Lançamento salvo" };
}

export async function deleteExpenseAction(formData: FormData) {
  await requirePermission("finance.manage");
  const id = String(formData.get("id"));
  await db.delete(expenses).where(eq(expenses.id, id));
  await audit({ action: "expense.deleted", entityType: "expense", entityId: id, summary: "Lançamento excluído", level: "warn" });
  revalidateFinance();
}

// ---------- CAPEX ----------
const assetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nome obrigatório").max(120),
  category: z.enum(ASSET_CATEGORIES),
  amount: z.string().min(1, "Valor obrigatório"),
  purchaseDate: z.string().min(1, "Data obrigatória"),
  usefulLifeMonths: z.coerce.number().int().min(1).max(240).default(36),
  salvage: z.string().optional(),
  printerId: z.string().optional(),
  note: z.string().max(500).optional(),
});

export async function saveAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("finance.manage");
  const parsed = assetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const values = { name: d.name, category: d.category, amountCents: money(d.amount), purchaseDate: new Date(`${d.purchaseDate}T12:00:00`), usefulLifeMonths: d.usefulLifeMonths, salvageCents: money(d.salvage), printerId: d.printerId || null, note: d.note || null };
  if (d.id) await db.update(assets).set(values).where(eq(assets.id, d.id));
  else await db.insert(assets).values(values);
  await audit({ action: d.id ? "asset.updated" : "asset.created", entityType: "asset", entityId: d.id, summary: `CAPEX "${d.name}" · R$ ${(values.amountCents / 100).toFixed(2)} · ${d.usefulLifeMonths} meses` });
  revalidateFinance();
  return { ok: true, message: "Ativo salvo" };
}

export async function disposeAssetAction(formData: FormData) {
  await requirePermission("finance.manage");
  const id = String(formData.get("id"));
  await db.update(assets).set({ disposedAt: new Date() }).where(eq(assets.id, id));
  await audit({ action: "asset.disposed", entityType: "asset", entityId: id, summary: "Ativo baixado" });
  revalidateFinance();
}

// ---------- receitas manuais ----------
const revenueSchema = z.object({
  description: z.string().min(2, "Descrição obrigatória").max(160),
  line: z.enum(REVENUE_LINES),
  amount: z.string().min(1, "Valor obrigatório"),
  cost: z.string().optional(),
  date: z.string().optional(),
  note: z.string().max(500).optional(),
});

export async function addManualRevenueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("finance.manage");
  const parsed = revenueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const amountCents = money(d.amount);
  if (amountCents <= 0) return { error: "Valor precisa ser maior que zero" };
  await db.insert(manualRevenues).values({ description: d.description, line: d.line, amountCents, costCents: money(d.cost), date: d.date ? new Date(`${d.date}T12:00:00`) : new Date(), note: d.note || null });
  await audit({ action: "revenue.manual_created", entityType: "revenue", summary: `Receita "${d.description}" · R$ ${(amountCents / 100).toFixed(2)} (${d.line})` });
  revalidateFinance();
  return { ok: true, message: "Receita lançada" };
}

export async function deleteManualRevenueAction(formData: FormData) {
  await requirePermission("finance.manage");
  const id = String(formData.get("id"));
  await db.delete(manualRevenues).where(eq(manualRevenues.id, id));
  await audit({ action: "revenue.manual_deleted", entityType: "revenue", entityId: id, summary: "Receita manual excluída", level: "warn" });
  revalidateFinance();
}

// ---------- almoxarifado ----------
const supplySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nome obrigatório").max(120),
  sku: z.string().max(40).optional(),
  category: z.enum(SUPPLY_CATEGORIES),
  unit: z.enum(SUPPLY_UNITS),
  unitCost: z.string().optional(),
  minQty: z.coerce.number().min(0).default(0),
  initialQty: z.coerce.number().min(0).optional(),
  location: z.string().max(60).optional(),
  supplier: z.string().max(120).optional(),
  active: z.string().optional(),
});

export async function saveSupplyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("stock.manage");
  const parsed = supplySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const values = { name: d.name, sku: d.sku || null, category: d.category, unit: d.unit, unitCostCents: money(d.unitCost), minQty: d.minQty, location: d.location || null, supplier: d.supplier || null, active: d.id ? d.active === "on" : true };
  if (d.id) {
    await db.update(supplies).set(values).where(eq(supplies.id, d.id));
  } else {
    const [s] = await db.insert(supplies).values({ ...values, qty: d.initialQty ?? 0 }).returning();
    if (d.initialQty) await db.insert(supplyMovements).values({ supplyId: s.id, delta: d.initialQty, reason: "purchase", unitCostCents: values.unitCostCents, note: "Estoque inicial" });
  }
  await audit({ action: d.id ? "supply.updated" : "supply.created", entityType: "supply", entityId: d.id, summary: `Insumo "${d.name}" (${d.unit}) · R$ ${(values.unitCostCents / 100).toFixed(2)}/${d.unit}` });
  revalidatePath("/admin/almoxarifado");
  return { ok: true, message: "Insumo salvo" };
}

export async function deleteSupplyAction(formData: FormData) {
  await requirePermission("stock.manage");
  const id = String(formData.get("id"));
  await db.delete(supplies).where(eq(supplies.id, id));
  await audit({ action: "supply.deleted", entityType: "supply", entityId: id, summary: "Insumo excluído", level: "warn" });
  revalidatePath("/admin/almoxarifado");
}

const supplyMoveSchema = z.object({
  supplyId: z.string(),
  delta: z.coerce.number().refine((n) => n !== 0, "Informe a quantidade"),
  reason: z.enum(SUPPLY_REASONS),
  unitCost: z.string().optional(),
  note: z.string().max(200).optional(),
});

export async function addSupplyMovementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("stock.manage");
  const parsed = supplyMoveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const signed = d.reason === "adjustment" ? d.delta : ["purchase", "return"].includes(d.reason) ? Math.abs(d.delta) : -Math.abs(d.delta);
  const unitCostCents = d.unitCost ? money(d.unitCost) : null;
  await db.insert(supplyMovements).values({ supplyId: d.supplyId, delta: signed, reason: d.reason, unitCostCents, note: d.note || null, refType: "manual" });
  await db.update(supplies).set({ qty: sql`${supplies.qty} + ${signed}` }).where(eq(supplies.id, d.supplyId));
  if (d.reason === "purchase" && unitCostCents) {
    await db.update(supplies).set({ unitCostCents }).where(eq(supplies.id, d.supplyId));
    const s = await db.query.supplies.findFirst({ where: eq(supplies.id, d.supplyId) });
    await db.insert(expenses).values({ description: `Compra de ${Math.abs(signed)} ${s?.unit ?? "un"} — ${s?.name ?? "insumo"}`, category: "supplies", kind: "cogs", amountCents: Math.round(Math.abs(signed) * unitCostCents), supplier: s?.supplier ?? null });
  }
  await audit({ action: "supply.movement", entityType: "supply", entityId: d.supplyId, summary: `Insumo ${signed > 0 ? "+" : ""}${signed} (${d.reason})${d.note ? ` · ${d.note}` : ""}` });
  revalidatePath("/admin/almoxarifado");
  revalidateFinance();
  return { ok: true, message: "Movimentação registrada" };
}

/** Insumos por unidade de um produto (complemento da BOM). Recebe JSON [{supplyId, qtyPerUnit}]. */
export async function saveProductSuppliesAction(formData: FormData) {
  await requirePermission("products.manage");
  const productId = String(formData.get("productId"));
  let lines: { supplyId: string; qtyPerUnit: number }[] = [];
  try {
    const arr = JSON.parse(String(formData.get("lines") ?? "[]"));
    lines = Array.isArray(arr) ? arr.map((l) => ({ supplyId: String(l.supplyId ?? ""), qtyPerUnit: Number(l.qtyPerUnit) || 0 })).filter((l) => l.supplyId && l.qtyPerUnit > 0) : [];
  } catch {
    lines = [];
  }
  await db.delete(productSupplies).where(eq(productSupplies.productId, productId));
  if (lines.length) await db.insert(productSupplies).values(lines.map((l, i) => ({ productId, supplyId: l.supplyId, qtyPerUnit: l.qtyPerUnit, sortOrder: i })));
  await audit({ action: "product.supplies_updated", entityType: "product", entityId: productId, summary: `${lines.length} insumo(s) na ficha técnica` });
  revalidatePath(`/admin/produtos/${productId}`);
}
