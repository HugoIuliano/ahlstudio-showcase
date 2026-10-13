import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { WebhookSignatureValidator } from "mercadopago";
import { db } from "@/db";
import { orderEvents, orders, type PaymentStatus } from "@/db/schema";
import { getPayment, isMercadoPagoEnabled } from "@/lib/mercadopago";
import { systemLog } from "@/lib/audit";
import { enqueueOrderJobs } from "@/lib/production-queue";

// Mercado Pago -> POST /api/webhooks/mercadopago?data.id=123&type=payment
// Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
export async function POST(req: NextRequest) {
  if (!isMercadoPagoEnabled()) return NextResponse.json({ ok: false, reason: "disabled" }, { status: 503 });

  const url = req.nextUrl;
  const body = (await req.json().catch(() => ({}))) as { type?: string; action?: string; data?: { id?: string } };
  const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const dataId = body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id");

  // Valida assinatura quando o segredo estiver configurado
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (secret && dataId) {
    try {
      WebhookSignatureValidator.validate({
        xSignature: req.headers.get("x-signature"),
        xRequestId: req.headers.get("x-request-id"),
        dataId: String(dataId),
        secret,
        toleranceSeconds: 300,
      });
    } catch (err) {
      console.warn("MP webhook: assinatura inválida", err);
      await systemLog("warn", "webhook.mp_invalid_signature", "Webhook do Mercado Pago com assinatura inválida", { dataId, error: String((err as Error)?.message ?? err) });
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  if (type !== "payment" || !dataId) return NextResponse.json({ ok: true, ignored: true });

  // Pagamento inexistente (ex.: simulação do painel do MP com id fictício) → 200 para o MP não reenviar.
  // Outros erros (MP fora, token inválido) → 500 para o MP tentar de novo.
  let payment: Awaited<ReturnType<typeof getPayment>>;
  try {
    payment = await getPayment(String(dataId));
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      await systemLog("warn", "webhook.mp_payment_not_found", `MP pagamento ${dataId} não encontrado`, { dataId });
      return NextResponse.json({ ok: true, ignored: true, reason: "payment_not_found" });
    }
    await systemLog("error", "webhook.mp_payment_fetch_failed", `Falha ao consultar pagamento ${dataId} no MP`, { dataId, status, error: String((err as Error)?.message ?? err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const orderId = payment.external_reference;
  if (!orderId) return NextResponse.json({ ok: true, ignored: true });

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return NextResponse.json({ ok: true, ignored: true });

  const map: Record<string, PaymentStatus> = {
    approved: "approved",
    authorized: "approved",
    pending: "pending",
    in_process: "pending",
    in_mediation: "pending",
    rejected: "rejected",
    cancelled: "cancelled",
    refunded: "refunded",
    charged_back: "refunded",
  };
  const paymentStatus = map[payment.status ?? ""] ?? "pending";
  const approvedNow = paymentStatus === "approved" && order.paymentStatus !== "approved";

  await db
    .update(orders)
    .set({
      paymentStatus,
      mpPaymentId: String(payment.id),
      paidAt: approvedNow ? new Date() : order.paidAt,
      status:
        approvedNow && order.status === "pending_payment"
          ? "paid"
          : paymentStatus === "refunded"
            ? "refunded"
            : order.status,
    })
    .where(eq(orders.id, orderId));

  if (approvedNow) await enqueueOrderJobs(orderId).catch((err) => console.error("fila de produção", err));

  await systemLog(paymentStatus === "rejected" ? "warn" : "info", "webhook.mp_payment", `MP pagamento ${payment.id} → ${payment.status} · pedido ${order.number}`, { orderId, paymentStatus, mpStatus: payment.status, detail: payment.status_detail, amount: payment.transaction_amount });
  if (paymentStatus !== order.paymentStatus) {
    await db.insert(orderEvents).values({
      orderId,
      type: "payment",
      message: `Mercado Pago: pagamento ${payment.id} → ${payment.status} (${payment.payment_method_id ?? "?"})`,
      meta: { paymentId: payment.id, status: payment.status, detail: payment.status_detail },
    });
  }

  return NextResponse.json({ ok: true });
}

// MP também pode chamar GET para validar a URL
export function GET() {
  return NextResponse.json({ ok: true });
}
