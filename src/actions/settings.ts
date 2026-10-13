"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { SETTING_DEFAULTS, setSettings, type Settings } from "@/lib/settings";
import { parseBRLToCents } from "@/lib/money";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";

// chaves de frete são salvas em /admin/frete (actions/shipping.ts) e ignoradas aqui
const SKIP_PREFIX = "shipping_";
const MONEY_KEYS = new Set(["free_shipping_from_cents", "pricing_labor_hourly_cents"]);
const BOOL_KEYS = new Set<string>([]);

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("settings.manage");
  const values: Partial<Settings> = {};
  for (const key of Object.keys(SETTING_DEFAULTS) as (keyof Settings)[]) {
    if (key.startsWith(SKIP_PREFIX) || key === "free_shipping_from_cents") continue;
    if (BOOL_KEYS.has(key)) {
      values[key] = formData.get(key) === "on" ? "true" : "false";
      continue;
    }
    const raw = formData.get(key);
    if (raw == null) continue;
    values[key] = MONEY_KEYS.has(key) ? String(parseBRLToCents(String(raw))) : String(raw).trim();
  }
  await setSettings(values);
  await audit({ action: "settings.updated", entityType: "settings", summary: "Configurações da loja atualizadas", meta: Object.fromEntries(Object.entries(values).filter(([k]) => !k.startsWith("pix_"))) });
  revalidatePath("/", "layout");
  return { ok: true, message: "Configurações salvas" };
}
