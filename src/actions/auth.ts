"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { customers, users } from "@/db/schema";
import { requireUser, signIn, signOut } from "@/lib/auth";
import { passwordSchema } from "@/lib/password";
import { PRIVACY_VERSION, recordConsent, safeInternalPath, TERMS_VERSION } from "@/lib/security";
import { audit } from "@/lib/audit";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import type { ActionState } from "@/components/ui/form-message";

const loginSchema = z.object({
  email: z.email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha").max(128),
  callbackUrl: z.string().optional(),
});

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const { email, password, callbackUrl } = parsed.data;
  try {
    // 10 tentativas por e-mail e 30 por IP a cada 15 min
    await assertRateLimit(`login:email:${email.toLowerCase()}`, 10, 15 * 60_000);
    await assertRateLimit("login:ip", 30, 15 * 60_000, { byIp: true });
  } catch (err) {
    if (err instanceof RateLimitError) return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
    throw err;
  }
  try {
    await signIn("credentials", { email: email.toLowerCase(), password, redirectTo: safeInternalPath(callbackUrl, "/conta") });
  } catch (err) {
    if (err instanceof AuthError) return { error: "E-mail ou senha incorretos" };
    throw err; // NEXT_REDIRECT
  }
  return { ok: true };
}

const signupSchema = z.object({
  name: z.string().min(2, "Informe seu nome").max(120),
  email: z.email("E-mail inválido"),
  phone: z.string().max(30).optional(),
  password: passwordSchema,
  acceptTerms: z.literal("on", { error: "É preciso aceitar os Termos de Uso e a Política de Privacidade" }),
});

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const data = { ...parsed.data, email: parsed.data.email.toLowerCase() };
  try {
    await assertRateLimit("signup:ip", 5, 60 * 60_000, { byIp: true });
  } catch (err) {
    if (err instanceof RateLimitError) return { error: "Muitos cadastros deste endereço. Tente novamente mais tarde." };
    throw err;
  }

  const exists = await db.query.users.findFirst({ where: eq(users.email, data.email) });
  if (exists) return { error: "Já existe uma conta com este e-mail" };

  const passwordHash = await hash(data.password, 12);
  // role é SEMPRE customer no cadastro público; promoção só pelo script make-admin.
  const [user] = await db
    .insert(users)
    .values({ name: data.name, email: data.email, phone: data.phone || null, passwordHash, role: "customer" })
    .returning();

  // LGPD: aceite dos termos e da política com IP, e-mail e timestamp
  await recordConsent({ type: "terms", version: TERMS_VERSION, email: data.email, userId: user.id, meta: { source: "signup" } });
  await recordConsent({ type: "privacy", version: PRIVACY_VERSION, email: data.email, userId: user.id, meta: { source: "signup" } });

  await audit({ action: "auth.signup", channel: "customer", entityType: "user", entityId: user.id, summary: `Conta criada: ${data.email}`, actor: { id: user.id, email: data.email, role: "customer" } });

  // Vincula (ou cria) o registro de cliente no CRM
  const existingCustomer = await db.query.customers.findFirst({ where: eq(customers.email, data.email) });
  if (existingCustomer) {
    await db.update(customers).set({ userId: user.id, stage: existingCustomer.stage === "lead" ? "active" : existingCustomer.stage }).where(eq(customers.id, existingCustomer.id));
  } else {
    await db.insert(customers).values({ userId: user.id, name: data.name, email: data.email, phone: data.phone || null, stage: "active", source: "site" });
  }

  try {
    await signIn("credentials", { email: data.email, password: data.password, redirectTo: "/conta" });
  } catch (err) {
    if (err instanceof AuthError) redirect("/login");
    throw err;
  }
  return { ok: true };
}

export async function googleSignInAction(formData: FormData) {
  const callbackUrl = safeInternalPath((formData.get("callbackUrl") as string) || undefined, "/conta");
  // primeiro acesso: confirma nome/WhatsApp em /conta/completar (quem já tem cadastro completo é redirecionado direto)
  await signIn("google", { redirectTo: `/conta/completar?next=${encodeURIComponent(callbackUrl)}` });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}

const changePasswordSchema = z
  .object({ current: z.string().min(1, "Informe a senha atual"), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "A confirmação não confere", path: ["confirm"] });

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user?.passwordHash) return { error: "Sua conta usa login social; não há senha para alterar." };
  if (!(await compare(parsed.data.current, user.passwordHash))) {
    await audit({ action: "auth.password_change_failed", level: "warn", entityType: "user", entityId: user.id, summary: "Tentativa de troca de senha com senha atual incorreta" });
    return { error: "Senha atual incorreta" };
  }
  await db.update(users).set({ passwordHash: await hash(parsed.data.password, 12) }).where(eq(users.id, user.id));
  await audit({ action: "auth.password_changed", entityType: "user", entityId: user.id, summary: "Senha alterada pelo titular" });
  revalidatePath("/conta");
  return { ok: true, message: "Senha alterada com sucesso" };
}
