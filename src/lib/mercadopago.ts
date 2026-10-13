import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import type { Order, OrderItem } from "@/db/schema";

export function isMercadoPagoEnabled() {
  return !!process.env.MP_ACCESS_TOKEN;
}

function client() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error("MP_ACCESS_TOKEN não configurado");
  return new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } });
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Cria uma preferência do Checkout Pro e devolve a URL de pagamento.
 * baseUrl: origem da requisição atual (porta do dev muda); cai em NEXT_PUBLIC_APP_URL.
 */
export async function createPreference(order: Order, items: OrderItem[], baseUrl?: string) {
  const pref = new Preference(client());
  const base = (baseUrl ?? appUrl()).replace(/\/$/, "");
  const isPublic = base.startsWith("https://");
  const res = await pref.create({
    body: {
      external_reference: order.id,
      items: items.map((i) => ({
        id: i.productId ?? i.quoteId ?? i.id,
        title: i.variantLabel ? `${i.name} (${i.variantLabel})` : i.name,
        quantity: i.quantity,
        unit_price: i.unitPriceCents / 100,
        currency_id: "BRL",
      })),
      ...(order.shippingCents > 0 ? { shipments: { cost: order.shippingCents / 100, mode: "not_specified" } } : {}),
      payer: { name: order.customerName, email: order.customerEmail },
      back_urls: {
        success: `${base}/pedido/${order.id}?status=success&t=${order.accessToken ?? ""}`,
        pending: `${base}/pedido/${order.id}?status=pending&t=${order.accessToken ?? ""}`,
        failure: `${base}/pedido/${order.id}?status=failure&t=${order.accessToken ?? ""}`,
      },
      // auto_return e webhook só funcionam com URL pública (https)
      ...(isPublic ? { auto_return: "approved", notification_url: `${base}/api/webhooks/mercadopago` } : {}),
      statement_descriptor: "AHLSTUDIO",
      metadata: { order_number: order.number },
    },
  });
  return { preferenceId: res.id!, initPoint: res.init_point!, sandboxInitPoint: res.sandbox_init_point };
}

export async function getPayment(paymentId: string) {
  return new Payment(client()).get({ id: paymentId });
}
