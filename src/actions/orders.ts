"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orderEvents, orders, ORDER_STATUS, PAYMENT_STATUS } from "@/db/schema";
import { orderStatusLabels, paymentStatusLabels } from "@/lib/labels";
import { audit } from "@/lib/audit";
import { parseBRLToCents } from "@/lib/money";
import { requirePermission } from "@/lib/auth";
import { enqueueOrderJobs } from "@/lib/production-queue";

function revalidateOrder(id: string) {
  revalidatePath(`/admin/pedidos/${id}`);
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin");
  revalidatePath(`/pedido/${id}`);
  revalidatePath("/conta");
}

export async function updateOrderStatusAction(formData: FormData) {
  await requirePermission("orders.manage");
  const id = String(formData.get("id"));
  const status = z.enum(ORDER_STATUS).parse(formData.get("status"));
  await db.update(orders).set({ status }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, type: "status", message: `Status alterado para "${orderStatusLabels[status].label}"` });
  await audit({ action: "order.status_changed", entityType: "order", entityId: id, summary: `Pedido → ${orderStatusLabels[status].label}`, meta: { status } });
  revalidateOrder(id);
}

export async function updatePaymentStatusAction(formData: FormData) {
  await requirePermission("orders.manage");
  const id = String(formData.get("id"));
  const paymentStatus = z.enum(PAYMENT_STATUS).parse(formData.get("paymentStatus"));
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) return;
  const approvedNow = paymentStatus === "approved" && order.paymentStatus !== "approved";
  await db
    .update(orders)
    .set({
      paymentStatus,
      paidAt: approvedNow ? new Date() : order.paidAt,
      // pagamento confirmado move o pedido pra "pago" se ainda estava aguardando
      status: approvedNow && order.status === "pending_payment" ? "paid" : order.status,
    })
    .where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, type: "payment", message: `Pagamento marcado como "${paymentStatusLabels[paymentStatus].label}" (manual)` });
  if (approvedNow) await enqueueOrderJobs(id);
  await audit({ action: "order.payment_changed", entityType: "order", entityId: id, summary: `Pagamento (manual) → ${paymentStatusLabels[paymentStatus].label} · ${order.number}`, meta: { paymentStatus, totalCents: order.totalCents }, level: paymentStatus === "approved" ? "warn" : "info" });
  revalidateOrder(id);
}

export async function updateOrderNotesAction(formData: FormData) {
  await requirePermission("orders.manage");
  const id = String(formData.get("id"));
  const adminNotes = String(formData.get("adminNotes") ?? "") || null;
  const trackingCode = String(formData.get("trackingCode") ?? "") || null;
  const before = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  const rawCost = formData.get("shippingCost");
  const shippingCostCents = rawCost != null && String(rawCost).trim() !== "" ? parseBRLToCents(String(rawCost)) : (before?.shippingCostCents ?? 0);
  const rawDays = formData.get("productionDays");
  const productionDays = rawDays != null && String(rawDays).trim() !== "" ? Math.max(0, Math.min(90, Math.round(Number(rawDays)) || 0)) : (before?.productionDays ?? 0);
  await db.update(orders).set({ adminNotes, trackingCode, shippingCostCents, productionDays }).where(eq(orders.id, id));
  if (before && productionDays !== before.productionDays) {
    await db.insert(orderEvents).values({ orderId: id, type: "production", message: `Prazo de produção ajustado para ${productionDays} dia(s) útil(eis)` });
  }
  await audit({ action: "order.notes_updated", entityType: "order", entityId: id, summary: trackingCode ? `Rastreio ${trackingCode}` : "Notas internas atualizadas" });
  if (trackingCode && trackingCode !== before?.trackingCode) {
    await db.insert(orderEvents).values({ orderId: id, type: "shipping", message: `Código de rastreio: ${trackingCode}` });
  }
  revalidateOrder(id);
}

/** Cria um job na fila de produção para cada item físico do pedido (se ainda não existir). */
export async function createPrintJobsFromOrderAction(formData: FormData) {
  await requirePermission("orders.manage");
  const id = String(formData.get("id"));
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id), columns: { number: true } });
  if (!order) return;
  // botão manual: manda todo item que ainda não tem job (inclusive os que tinham estoque)
  const created = await enqueueOrderJobs(id, { includeInStock: true });
  if (created > 0) await audit({ action: "order.sent_to_production", entityType: "order", entityId: id, summary: `${created} job(s) criados para ${order.number}` });
  revalidateOrder(id);
  revalidatePath("/admin/producao");
}
