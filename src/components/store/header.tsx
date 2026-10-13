import Image from "next/image";
import Link from "next/link";
import { LifeBuoy, ShoppingCart, Sparkles, UserRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { getSettings, whatsappLink } from "@/lib/settings";
import { isStaff, ROLE_LABELS } from "@/lib/rbac";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";

export async function StoreHeader() {
  const [session, cart, s] = await Promise.all([auth(), getCart(), getSettings()]);
  const staff = isStaff(session?.user?.role);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:gap-6">
        <MobileNav loggedIn={!!session?.user} isAdmin={staff} userName={session?.user?.name?.split(" ")[0]} />
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Image src="/brand/logo-icon.png" alt="" width={40} height={40} priority className="size-10 object-contain" />
          <span className="font-display text-lg">{s.shop_name}</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          <Link href="/produtos" className="font-medium hover:text-foreground">Catálogo</Link>
          <Link href="/projetos" className="inline-flex items-center gap-1.5 rounded-full bg-canary px-3 py-1.5 font-semibold text-accent-foreground transition-transform hover:scale-105"><Sparkles className="size-4" /> Personalizados</Link>
          <Link href="/ajuda" className="inline-flex items-center gap-1 hover:text-foreground"><LifeBuoy className="size-4" /> Ajuda</Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/carrinho" className="relative inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted" aria-label="Carrinho">
            <ShoppingCart className="size-5" />
            {cart.count > 0 && (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                {cart.count}
              </span>
            )}
          </Link>
          {session?.user ? (
            <UserMenu name={session.user.name} email={session.user.email} roleLabel={ROLE_LABELS[session.user.role]} isStaff={staff} />
          ) : (
            <Link href="/login" className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm hover:bg-muted md:inline-flex">
              <UserRound className="size-4" /> Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export async function StoreFooter() {
  const s = await getSettings();
  const wa = whatsappLink(s.shop_whatsapp, `Olá! Vim pelo site da ${s.shop_name}.`);
  return (
    <footer className="mt-16 border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm md:grid-cols-3">
        <div>
          <Image src="/brand/logo-full.png" alt={s.shop_name} width={160} height={163} className="mb-3 h-auto w-32" />
          <p className="text-muted-foreground">{s.shop_tagline}</p>
          {s.shop_city && <p className="mt-1 text-muted-foreground">{s.shop_city}</p>}
        </div>
        <div className="space-y-1 text-muted-foreground">
          <p className="font-medium text-foreground">Navegação</p>
          <Link className="block hover:text-foreground" href="/produtos">Catálogo</Link>
          <Link className="block hover:text-foreground" href="/projetos">Projeto personalizado</Link>
          <Link className="block hover:text-foreground" href="/sobre">Sobre o studio</Link>
          <Link className="block hover:text-foreground" href="/conta">Minha conta</Link>
          <Link className="block hover:text-foreground" href="/termos">Termos de Uso</Link>
          <Link className="block hover:text-foreground" href="/privacidade">Política de Privacidade</Link>
        </div>
        <div className="space-y-1 text-muted-foreground">
          <p className="font-medium text-foreground">Contato</p>
          {wa && <a className="block hover:text-foreground" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
          {s.shop_instagram && (
            <a className="block hover:text-foreground" href={`https://instagram.com/${s.shop_instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
              @{s.shop_instagram.replace(/^@/, "")}
            </a>
          )}
          {s.shop_email && <a className="block hover:text-foreground" href={`mailto:${s.shop_email}`}>{s.shop_email}</a>}
        </div>
      </div>
      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {s.shop_name}. Feito camada por camada.
      </div>
    </footer>
  );
}
