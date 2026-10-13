import { asc } from "drizzle-orm";
import { db } from "@/db";
import { categories, materials, printers } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { ProductForm } from "@/components/admin/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";

export default async function NewProductPage() {
  await requirePagePermission("products.manage");
  const [cats, mats, prs, s] = await Promise.all([
    db.query.categories.findMany({ orderBy: asc(categories.sortOrder) }),
    db.query.materials.findMany({ orderBy: asc(materials.name) }),
    db.query.printers.findMany({ orderBy: asc(printers.name) }),
    getSettings(),
  ]);
  const printerHourlyCents = prs.length ? Math.round(prs.reduce((a, p) => a + p.hourlyCostCents, 0) / prs.length) : 150;
  return (
    <div>
      <PageHeader title="Novo produto" />
      <ProductForm
        categories={cats}
        materials={mats}
        pricing={{ laborHourlyCents: Number(s.pricing_labor_hourly_cents), failureRate: Number(s.pricing_failure_rate), marginPct: Number(s.pricing_margin_pct), printerHourlyCents }}
        lead={{ hoursPerDay: Number(s.production_hours_per_day) || 8, machines: Number(s.production_parallel_machines) || 1, laborHoursPerDay: Number(s.production_labor_hours_per_day) || 4, handlingDays: Number(s.shipping_handling_days) || 0 }}
      />
    </div>
  );
}
