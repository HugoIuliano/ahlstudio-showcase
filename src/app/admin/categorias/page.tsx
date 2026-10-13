import { Trash2 } from "lucide-react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { deleteCategoryAction } from "@/actions/catalog";
import { CategoryForm } from "@/components/admin/simple-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";

export default async function CategoriesPage() {
  await requirePagePermission("products.manage");
  const list = await db.query.categories.findMany({ orderBy: asc(categories.sortOrder), with: { products: { columns: { id: true } } } });
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Categorias" description="Organizam o catálogo e o menu da loja." />
      <Card>
        <CardHeader><CardTitle>Nova categoria</CardTitle></CardHeader>
        <CardContent><CategoryForm /></CardContent>
      </Card>
      <div className="space-y-3">
        {list.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-64"><CategoryForm category={c} /></div>
              <span className="text-xs text-muted-foreground">{c.products.length} produto(s) · /{c.slug}</span>
              <form action={deleteCategoryAction}>
                <input type="hidden" name="id" value={c.id} />
                <Button type="submit" variant="ghost" size="icon" aria-label="Excluir"><Trash2 className="text-muted-foreground" /></Button>
              </form>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma categoria ainda.</p>}
      </div>
    </div>
  );
}
