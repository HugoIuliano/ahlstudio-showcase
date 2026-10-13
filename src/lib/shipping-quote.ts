import { asc } from "drizzle-orm";
import { db } from "@/db";
import { shippingZones } from "@/db/schema";
import { getCart, type CartItem } from "./cart";
import { getSettings } from "./settings";
import { quoteShipping, type ShippableItem } from "./shipping";
import { readShippingPref } from "./shipping-pref";
import { getBacklog } from "./production-queue";

/** Helpers server-side que juntam banco + carrinho + cookie para cotar. (Sem "use server": não são actions.) */

export async function getZones() {
  return db.query.shippingZones.findMany({ orderBy: [asc(shippingZones.sortOrder), asc(shippingZones.cepStart)] });
}

export function cartToShippable(items: CartItem[]): ShippableItem[] {
  return items.map((i) => ({ id: i.productId ?? i.quoteId ?? "item", quantity: i.quantity, unitPriceCents: i.unitPriceCents, printMinutes: i.printMinutes, laborMinutes: i.laborMinutes, inStock: i.inStock, ...i.shipping }));
}

/** Cotação do carrinho atual para um CEP (ou o CEP salvo no cookie). */
export async function quoteCart(cepOverride?: string | null) {
  const [pref, settings, zones, cart, backlog] = await Promise.all([readShippingPref(), getSettings(), getZones(), getCart(), getBacklog()]);
  const cep = cepOverride ?? pref.cep;
  const quote = await quoteShipping({ cep, items: cartToShippable(cart.items), subtotalCents: cart.subtotalCents, settings, zones, backlog });
  return { quote, pref, cart, settings };
}
