"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lineKey, readCartLines, writeCartLines, type CartLine } from "@/lib/cart";

export async function addToCartAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const variantId = (formData.get("variantId") as string) || null;
  const customization = ((formData.get("customization") as string) || "").trim().slice(0, 500) || null;
  const quantity = Math.max(1, Math.min(99, Number(formData.get("quantity") ?? 1) || 1));
  if (!productId) return;

  const lines = await readCartLines();
  const incoming: CartLine = { productId, variantId, quantity, customization };
  const key = lineKey(incoming);
  const existing = lines.find((l) => lineKey(l) === key);
  if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
  else lines.push(incoming);
  await writeCartLines(lines);
  revalidatePath("/", "layout");
  redirect("/carrinho");
}

export async function updateCartQtyAction(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const quantity = Math.max(0, Math.min(99, Number(formData.get("quantity") ?? 0) || 0));
  const lines = await readCartLines();
  const next = lines
    .map((l) => (lineKey(l) === key ? { ...l, quantity: l.quoteId ? Math.min(1, quantity) : quantity } : l))
    .filter((l) => l.quantity > 0);
  await writeCartLines(next);
  revalidatePath("/carrinho");
  revalidatePath("/", "layout");
}

export async function removeFromCartAction(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const lines = await readCartLines();
  await writeCartLines(lines.filter((l) => lineKey(l) !== key));
  revalidatePath("/carrinho");
  revalidatePath("/", "layout");
}

export async function clearCartAction() {
  await writeCartLines([]);
  revalidatePath("/", "layout");
}
