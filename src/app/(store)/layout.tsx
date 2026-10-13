import { cookies } from "next/headers";
import { StoreFooter, StoreHeader } from "@/components/store/header";
import { CookieBanner } from "@/components/store/cookie-banner";
import { PwaInstall } from "@/components/store/pwa";
import { COOKIE_CONSENT_NAME } from "@/lib/security";
import { getSettings } from "@/lib/settings";
import { jsonLd, organizationLd, websiteLd } from "@/lib/seo";

// Layout da loja pública: header com carrinho + footer. Tudo dinâmico (cookie do carrinho / sessão).
export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [consent, s] = await Promise.all([(await cookies()).get(COOKIE_CONSENT_NAME)?.value, getSettings()]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd([organizationLd(s), websiteLd()]) }} />
      <StoreHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <StoreFooter />
      {!consent && <CookieBanner />}
      <PwaInstall />
    </>
  );
}
