import type { UserRole } from "@/db/schema";

/**
 * RBAC: permissões finas mapeadas por papel. Um papel só enxerga/executa o que está listado aqui.
 * - customer: nenhuma permissão de backoffice
 * - support: atendimento — pedidos, clientes, orçamentos, chamados (sem financeiro/config)
 * - production: studio — fila, estoque, máquinas, leitura de pedidos/orçamentos
 * - admin: tudo
 */
export const PERMISSIONS = [
  "dashboard.view",
  "orders.view",
  "orders.manage",
  "products.view",
  "products.manage",
  "customers.view",
  "customers.manage",
  "quotes.view",
  "quotes.manage",
  "tickets.view",
  "tickets.manage",
  "production.view",
  "production.manage",
  "stock.view",
  "stock.manage",
  "machines.manage",
  "finance.view",
  "finance.manage",
  "settings.manage",
  "users.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  customer: [],
  support: [
    "dashboard.view",
    "orders.view",
    "orders.manage",
    "products.view",
    "customers.view",
    "customers.manage",
    "quotes.view",
    "quotes.manage",
    "tickets.view",
    "tickets.manage",
    "production.view",
    "stock.view",
  ],
  production: ["dashboard.view", "orders.view", "products.view", "quotes.view", "production.view", "production.manage", "stock.view", "stock.manage", "machines.manage"],
  admin: [...PERMISSIONS],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: "Cliente",
  support: "Atendimento",
  production: "Produção (studio)",
  admin: "Administrador",
};

export function can(role: UserRole | null | undefined, permission: Permission) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Qualquer papel com acesso ao backoffice. */
export function isStaff(role: UserRole | null | undefined) {
  return !!role && role !== "customer";
}

export function permissionsOf(role: UserRole | null | undefined): readonly Permission[] {
  return role ? ROLE_PERMISSIONS[role] ?? [] : [];
}
