"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  expenses,
  materials,
  productSupplies,
  supplies,
  supplyMovements,
  orderEvents,
  orders,
  printers,
  printJobs,
  products,
  productVariants,
  stockMovements,
  MATERIAL_TYPES,
  PRINT_JOB_STATUS,
  PRINTER_STATUS,
  STOCK_REASONS,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { clearBacklogCache } from "@/lib/production-queue";
import { parseBRLToCents } from "@/lib/money";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";

// ---------- materiais ----------
const materialSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nome obrigatório"),
  type: z.enum(MATERIAL_TYPES),
  brand: z.string().optional(),
  color: z.string().optional(),
  colorHex: z.string().optional(),
  costPerKg: z.string().optional(),
  minStockGrams: z.coerce.number().int().min(0).default(200),
  supplier: z.string().optional(),
  active: z.string().optional(),
  initialStockGrams: z.coerce.number().int().min(0).optional(),
});

export async function saveMaterialAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("stock.manage");
  const parsed = materialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const values = {
    name: d.name,
    type: d.type,
    brand: d.brand || null,
    color: d.color || null,
    colorHex: d.colorHex || null,
    costPerKgCents: parseBRLToCents(d.costPerKg),
    minStockGrams: d.minStockGrams,
    supplier: d.supplier || null,
    active: d.id ? d.active === "on" : true,
  };
  if (d.id) {
    await db.update(materials).set(values).where(eq(materials.id, d.id));
  } else {
    const [m] = await db.insert(materials).values({ ...values, stockGrams: d.initialStockGrams ?? 0 }).returning();
    if (d.initialStockGrams) {
      await db.insert(stockMovements).values({ materialId: m.id, deltaGrams: d.initialStockGrams, reason: "purchase", unitCostCents: values.costPerKgCents, note: "Estoque inicial" });
    }
  }
  await audit({ action: d.id ? "material.updated" : "material.created", entityType: "material", entityId: d.id ?? d.name, summary: `Material "${d.name}" · R$ ${(values.costPerKgCents / 100).toFixed(2)}/kg` });
  revalidatePath("/admin/estoque");
  return { ok: true, message: "Material salvo" };
}

export async function deleteMaterialAction(formData: FormData) {
  await requirePermission("stock.manage");
  await db.delete(materials).where(eq(materials.id, String(formData.get("id"))));
  await audit({ action: "material.deleted", entityType: "material", entityId: String(formData.get("id")), summary: "Material excluído", level: "warn" });
  revalidatePath("/admin/estoque");
}

const movementSchema = z.object({
  materialId: z.string(),
  deltaGrams: z.coerce.number().int().refine((n) => n !== 0, "Informe a quantidade"),
  reason: z.enum(STOCK_REASONS),
  unitCost: z.string().optional(),
  note: z.string().optional(),
});

export async function addStockMovementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("stock.manage");
  const parsed = movementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  // entradas positivas, saídas negativas — o sinal segue o motivo
  const delta = ["purchase", "return"].includes(d.reason) ? Math.abs(d.deltaGrams) : -Math.abs(d.deltaGrams);
  const finalDelta = d.reason === "adjustment" ? d.deltaGrams : delta;
  const unitCostCents = d.unitCost ? parseBRLToCents(d.unitCost) : null;

  await db.insert(stockMovements).values({ materialId: d.materialId, deltaGrams: finalDelta, reason: d.reason, unitCostCents, note: d.note || null, refType: "manual" });
  await db.update(materials).set({ stockGrams: sql`${materials.stockGrams} + ${finalDelta}` }).where(eq(materials.id, d.materialId));
  // compra atualiza o custo/kg de referência e lança despesa
  if (d.reason === "purchase" && unitCostCents) {
    await db.update(materials).set({ costPerKgCents: unitCostCents }).where(eq(materials.id, d.materialId));
    const m = await db.query.materials.findFirst({ where: eq(materials.id, d.materialId) });
    await db.insert(expenses).values({
      description: `Compra de ${Math.abs(finalDelta)}g — ${m?.name ?? "material"}`,
      category: "material",
      amountCents: Math.round((Math.abs(finalDelta) / 1000) * unitCostCents),
    });
  }
  await audit({ action: "stock.movement", entityType: "material", entityId: d.materialId, summary: `Estoque ${finalDelta > 0 ? "+" : ""}${finalDelta} g (${d.reason})${d.note ? ` · ${d.note}` : ""}`, meta: { deltaGrams: finalDelta, reason: d.reason, unitCostCents } });
  revalidatePath("/admin/estoque");
  revalidatePath("/admin/financeiro");
  return { ok: true, message: "Movimentação registrada" };
}

// ---------- máquinas ----------
const printerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nome obrigatório"),
  model: z.string().optional(),
  status: z.enum(PRINTER_STATUS),
  hourlyCost: z.string().optional(),
  bedSize: z.string().optional(),
  notes: z.string().optional(),
});

export async function savePrinterAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("machines.manage");
  const parsed = printerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const values = { name: d.name, model: d.model || null, status: d.status, hourlyCostCents: parseBRLToCents(d.hourlyCost), bedSize: d.bedSize || null, notes: d.notes || null };
  if (d.id) await db.update(printers).set(values).where(eq(printers.id, d.id));
  else await db.insert(printers).values(values);
  await audit({ action: d.id ? "machine.updated" : "machine.created", entityType: "printer", entityId: d.id ?? d.name, summary: `Máquina "${d.name}" (${d.status})` });
  revalidatePath("/admin/maquinas");
  return { ok: true, message: "Máquina salva" };
}

export async function deletePrinterAction(formData: FormData) {
  await requirePermission("machines.manage");
  const id = String(formData.get("id"));
  const printer = await db.query.printers.findFirst({ where: eq(printers.id, id) });
  if (!printer) return;
  // jobs, fornadas e ativos apontam para a máquina com "set null" — histórico fica, só perde a referência
  await db.update(printJobs).set({ printerId: null }).where(eq(printJobs.printerId, id));
  await db.delete(printers).where(eq(printers.id, id));
  await audit({ action: "printer.deleted", entityType: "printer", entityId: id, summary: `Máquina "${printer.name}" excluída`, level: "warn" });
  revalidatePath("/admin/maquinas");
  revalidatePath("/admin/producao");
  revalidatePath("/admin");
}

// ---------- fila de produção ----------
const jobSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, "Título obrigatório"),
  printerId: z.string().optional(),
  materialId: z.string().optional(),
  quoteId: z.string().optional(),
  quantity: z.coerce.number().int().min(1).default(1),
  estimatedMinutes: z.coerce.number().int().min(0).default(0),
  laborMinutes: z.coerce.number().int().min(0).default(0),
  estimatedGrams: z.coerce.number().int().min(0).default(0),
  priority: z.coerce.number().int().default(0),
  dueAt: z.string().optional(),
  notes: z.string().optional(),
});

export async function savePrintJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("production.manage");
  const parsed = jobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const values = {
    title: d.title,
    printerId: d.printerId || null,
    materialId: d.materialId || null,
    quoteId: d.quoteId || null,
    quantity: d.quantity,
    estimatedMinutes: d.estimatedMinutes,
    laborMinutes: d.laborMinutes,
    estimatedGrams: d.estimatedGrams,
    priority: d.priority,
    dueAt: d.dueAt ? new Date(d.dueAt + "T12:00:00") : null,
    notes: d.notes || null,
  };
  if (d.id) await db.update(printJobs).set(values).where(eq(printJobs.id, d.id));
  else await db.insert(printJobs).values(values);
  clearBacklogCache();
  await audit({ action: d.id ? "print_job.updated" : "print_job.created", entityType: "print_job", entityId: d.id ?? d.title, summary: `Job "${d.title}" · ${d.quantity} un.` });
  revalidatePath("/admin/producao");
  return { ok: true, message: "Job salvo" };
}

/**
 * Resultado de uma fornada / transição de status do job.
 * Ao concluir ou falhar:
 *  - baixa filamento por material (BOM do produto × peças boas → "print"; × peças perdidas → "waste")
 *  - lança desperdício extra (purga, suporte, fornada perdida) como "waste"
 *  - soma horas e libera a máquina
 *  - se for fornada de estoque, repõe stockQty do produto/variação com as peças boas
 */
export async function setPrintJobStatusAction(formData: FormData) {
  await requirePermission("production.manage");
  const id = String(formData.get("id"));
  const status = z.enum(PRINT_JOB_STATUS).parse(formData.get("status"));
  const num = (k: string) => {
    const v = formData.get(k);
    return v == null || v === "" ? null : Math.max(0, Math.round(Number(v)));
  };

  const job = await db.query.printJobs.findFirst({ where: eq(printJobs.id, id), with: { product: { with: { bom: true, suppliesBom: true } } } });
  if (!job) return;
  const now = new Date();
  const patch: Partial<typeof printJobs.$inferInsert> = { status };

  if (status === "printing") {
    patch.startedAt = job.startedAt ?? now;
    if (job.printerId) await db.update(printers).set({ status: "printing" }).where(eq(printers.id, job.printerId));
  }

  if ((status === "done" || status === "failed") && !job.finishedAt) {
    const producedQty = num("producedQty") ?? (status === "done" ? job.quantity : 0);
    const failedQty = num("failedQty") ?? (status === "failed" ? job.quantity : Math.max(0, job.quantity - producedQty));
    const wasteGrams = num("wasteGrams") ?? 0;
    const minutes = num("actualMinutes") ?? job.estimatedMinutes;
    const bom = job.product?.bom ?? [];
    const perUnitGrams = job.quantity > 0 ? job.estimatedGrams / job.quantity : 0;

    // consumo por material
    type Line = { materialId: string; grams: number };
    const good: Line[] = bom.length
      ? bom.map((l) => ({ materialId: l.materialId, grams: l.gramsPerUnit * producedQty }))
      : job.materialId
        ? [{ materialId: job.materialId, grams: num("actualGrams") ?? Math.round(perUnitGrams * producedQty) }]
        : [];
    const lost: Line[] = bom.length
      ? bom.map((l) => ({ materialId: l.materialId, grams: l.gramsPerUnit * failedQty }))
      : job.materialId
        ? [{ materialId: job.materialId, grams: Math.round(perUnitGrams * failedQty) }]
        : [];
    const wasteTarget = job.materialId ?? bom[0]?.materialId ?? null;

    const apply = async (lines: Line[], reason: "print" | "waste", note: string) => {
      for (const l of lines) {
        if (l.grams <= 0) continue;
        await db.insert(stockMovements).values({ materialId: l.materialId, deltaGrams: -l.grams, reason, refType: "print_job", refId: job.id, note });
        await db.update(materials).set({ stockGrams: sql`${materials.stockGrams} - ${l.grams}` }).where(eq(materials.id, l.materialId));
      }
    };
    await apply(good, "print", `${job.title} · ${producedQty} peça(s) boa(s)`);
    await apply(lost, "waste", `${job.title} · ${failedQty} peça(s) perdida(s)`);
    if (wasteGrams > 0 && wasteTarget) await apply([{ materialId: wasteTarget, grams: wasteGrams }], "waste", `${job.title} · purga/suporte/fornada perdida`);

    // insumos do almoxarifado (embalagem, LED, ímã…) consumidos pelas peças boas + perdidas
    const unitsMade = producedQty + failedQty;
    for (const ps of job.product?.suppliesBom ?? []) {
      const used = ps.qtyPerUnit * unitsMade;
      if (used <= 0) continue;
      await db.insert(supplyMovements).values({ supplyId: ps.supplyId, delta: -used, reason: "use", refType: "print_job", refId: job.id, note: `${job.title} · ${unitsMade} un.` });
      await db.update(supplies).set({ qty: sql`${supplies.qty} - ${used}` }).where(eq(supplies.id, ps.supplyId));
    }
    void productSupplies;

    // repõe estoque de produto/variação quando a fornada é para estoque
    if (job.addsToStock && producedQty > 0) {
      if (job.productId) await db.update(products).set({ stockQty: sql`${products.stockQty} + ${producedQty}` }).where(eq(products.id, job.productId));
      if (job.variantId) await db.update(productVariants).set({ stockQty: sql`${productVariants.stockQty} + ${producedQty}` }).where(eq(productVariants.id, job.variantId));
    }

    if (job.printerId) {
      await db.update(printers).set({ status: "idle", totalPrintMinutes: sql`${printers.totalPrintMinutes} + ${minutes}` }).where(eq(printers.id, job.printerId));
    }

    Object.assign(patch, {
      finishedAt: now,
      producedQty,
      failedQty,
      wasteGrams,
      actualMinutes: minutes,
      actualGrams: good.reduce((s, l) => s + l.grams, 0),
      // fornada parcialmente perdida continua "done" se saiu alguma peça boa
      status: status === "failed" && producedQty > 0 ? "done" : status,
    });
  }

  if (status === "cancelled" && job.printerId && job.status === "printing") {
    await db.update(printers).set({ status: "idle" }).where(eq(printers.id, job.printerId));
  }
  await db.update(printJobs).set(patch).where(eq(printJobs.id, id));
  await audit({ action: `print_job.${patch.status ?? status}`, entityType: "print_job", entityId: id, summary: `"${job.title}" → ${patch.status ?? status}${patch.producedQty != null ? ` · ${patch.producedQty} boas / ${patch.failedQty ?? 0} perdidas / ${patch.wasteGrams ?? 0} g desperdício` : ""}`, meta: { ...patch, orderId: job.orderId, productId: job.productId } });

  // Se todos os jobs do pedido concluíram, marca pedido como "pronto"
  if (patch.status === "done" && job.orderId) {
    const siblings = await db.query.printJobs.findMany({ where: eq(printJobs.orderId, job.orderId) });
    if (siblings.every((j) => j.status === "done" || j.status === "cancelled" || j.id === id)) {
      const order = await db.query.orders.findFirst({ where: eq(orders.id, job.orderId) });
      if (order && (order.status === "in_production" || order.status === "paid")) {
        await db.update(orders).set({ status: "ready" }).where(eq(orders.id, job.orderId));
        await db.insert(orderEvents).values({ orderId: job.orderId, type: "status", message: "Produção concluída — pedido pronto" });
      }
    }
    revalidatePath(`/admin/pedidos/${job.orderId}`);
    revalidatePath(`/pedido/${job.orderId}`);
  }
  clearBacklogCache();
  if (job.productId) revalidatePath(`/admin/produtos/${job.productId}`);
  revalidatePath("/admin/producao");
  revalidatePath("/admin/estoque");
  revalidatePath("/admin/maquinas");
  revalidatePath("/admin");
}

/** Cria uma fornada para repor estoque de um produto (ou variação) a partir da ficha técnica. */
const batchSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  quantity: z.coerce.number().int().min(1),
  printerId: z.string().optional(),
  priority: z.coerce.number().int().default(0),
  notes: z.string().optional(),
});

export async function createStockBatchAction(formData: FormData) {
  await requirePermission("production.manage");
  const parsed = batchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const d = parsed.data;
  const product = await db.query.products.findFirst({ where: eq(products.id, d.productId), with: { bom: true, variants: true } });
  if (!product) return;
  const variant = d.variantId ? product.variants.find((v) => v.id === d.variantId) : null;
  const gramsPerUnit = product.bom.length ? product.bom.reduce((s, l) => s + l.gramsPerUnit, 0) : product.materialGrams;

  await db.insert(printJobs).values({
    title: `Fornada · ${d.quantity}× ${product.name}${variant ? ` (${variant.value})` : ""}`,
    productId: product.id,
    variantId: variant?.id ?? null,
    printerId: d.printerId || null,
    materialId: variant?.materialId ?? product.materialId ?? product.bom[0]?.materialId ?? null,
    quantity: d.quantity,
    estimatedMinutes: product.printMinutes * d.quantity,
    estimatedGrams: gramsPerUnit * d.quantity,
    priority: d.priority,
    laborMinutes: product.laborMinutes * d.quantity,
    addsToStock: true,
    notes: d.notes || null,
  });
  clearBacklogCache();
  await audit({ action: "print_job.batch_created", entityType: "product", entityId: product.id, summary: `Fornada de ${d.quantity}× ${product.name}${variant ? ` (${variant.value})` : ""}` });
  revalidatePath(`/admin/produtos/${product.id}`);
  revalidatePath("/admin/producao");
  revalidatePath("/admin");
}

/** Sobe/desce a prioridade manual de um job na fila. */
export async function bumpPrintJobAction(formData: FormData) {
  await requirePermission("production.manage");
  const id = String(formData.get("id"));
  const delta = Number(formData.get("delta")) || 0;
  const job = await db.query.printJobs.findFirst({ where: eq(printJobs.id, id) });
  if (!job) return;
  await db.update(printJobs).set({ priority: job.priority + delta }).where(eq(printJobs.id, id));
  revalidatePath("/admin/producao");
}

/** Define/limpa o prazo alvo de um job. */
export async function setPrintJobDueAction(formData: FormData) {
  await requirePermission("production.manage");
  const id = String(formData.get("id"));
  const raw = String(formData.get("dueAt") ?? "");
  await db.update(printJobs).set({ dueAt: raw ? new Date(raw + "T12:00:00") : null }).where(eq(printJobs.id, id));
  revalidatePath("/admin/producao");
}

export async function deletePrintJobAction(formData: FormData) {
  await requirePermission("production.manage");
  clearBacklogCache();
  await db.delete(printJobs).where(eq(printJobs.id, String(formData.get("id"))));
  await audit({ action: "print_job.deleted", entityType: "print_job", entityId: String(formData.get("id")), summary: "Job excluído", level: "warn" });
  revalidatePath("/admin/producao");
}


