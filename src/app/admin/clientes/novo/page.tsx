import { CustomerForm } from "@/components/admin/simple-forms";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";

export default async function NewCustomerPage() {
  await requirePagePermission("customers.manage");
  return (
    <div className="max-w-2xl">
      <PageHeader title="Novo cliente" description="Cadastro manual (WhatsApp, feira, indicação…)." />
      <Card><CardContent className="pt-5"><CustomerForm /></CardContent></Card>
    </div>
  );
}
