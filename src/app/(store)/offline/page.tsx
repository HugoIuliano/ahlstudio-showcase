import Image from "next/image";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Você está offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <Image src="/brand/logo-icon.png" alt="" width={120} height={120} className="mx-auto size-24 opacity-70" />
      <h1 className="mt-6 flex items-center justify-center gap-2 text-2xl font-semibold"><WifiOff className="size-6" /> Você está offline</h1>
      <p className="mt-2 text-muted-foreground">Sem conexão agora. Quando a internet voltar, é só recarregar — seu carrinho e sua sessão continuam salvos.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-foreground px-5 font-semibold text-blush">Tentar de novo</Link>
    </div>
  );
}
