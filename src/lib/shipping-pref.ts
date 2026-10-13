import { cookies } from "next/headers";
import { normalizeCep } from "./shipping";

/** Preferência de frete do visitante (CEP digitado + opção escolhida), num cookie httpOnly como o carrinho. */
const COOKIE = "ahl_ship";
const MAX_AGE = 60 * 60 * 24 * 30;

export type ShippingPref = { cep: string | null; optionId: string | null };

export async function readShippingPref(): Promise<ShippingPref> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return { cep: null, optionId: null };
  try {
    const p = JSON.parse(raw) as Partial<ShippingPref>;
    return { cep: normalizeCep(p.cep), optionId: typeof p.optionId === "string" ? p.optionId.slice(0, 80) : null };
  } catch {
    return { cep: null, optionId: null };
  }
}

export async function writeShippingPref(pref: ShippingPref) {
  const store = await cookies();
  if (!pref.cep && !pref.optionId) {
    store.delete(COOKIE);
    return;
  }
  store.set(COOKIE, JSON.stringify(pref), { maxAge: MAX_AGE, path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
}
