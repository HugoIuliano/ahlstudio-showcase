"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "ahl_install_dismissed";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isIos() {
  // iPhone/iPad (qualquer navegador iOS usa o WebKit; a instalação é sempre pelo menu Compartilhar do Safari)
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Registra o service worker e oferece a instalação do app:
 *  - Android/Chrome/Edge/Samsung: usa o prompt nativo (beforeinstallprompt)
 *  - iPhone/iPad (Safari): mostra o passo a passo "Compartilhar → Adicionar à Tela de Início"
 * Some quando já está instalado ou quando o cliente dispensou (lembra por 14 dias).
 */
export function PwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    if (isStandalone()) return;
    let dismissedAt = 0;
    try {
      dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    } catch {}
    if (Date.now() - dismissedAt < 14 * 86400_000) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setMode("hidden");
    window.addEventListener("appinstalled", onInstalled);
    // iOS não dispara beforeinstallprompt: mostramos o guia depois de um tempo de navegação
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) t = setTimeout(() => setMode("ios"), 8000);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setMode("hidden");
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setMode("hidden");
    else dismiss();
  };

  if (mode === "hidden") return null;

  return (
    <div role="dialog" aria-label="Instalar o app" className="fixed bottom-3 left-3 right-3 z-40 mx-auto w-auto max-w-md animate-fade-up rounded-2xl border bg-card p-3 shadow-xl md:bottom-6 md:left-auto md:right-6">
      <div className="flex items-center gap-3">
        <Image src="/brand/icon-192.png" alt="" width={44} height={44} className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Instale o app do AHL Studio</p>
          <p className="text-xs text-muted-foreground">Acesso rápido na tela inicial, sem ocupar espaço.</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Fechar" className="grid size-8 place-items-center rounded-lg hover:bg-muted"><X className="size-4" /></button>
      </div>
      {mode === "android" ? (
        <button type="button" onClick={install} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-blush">
          <Download className="size-4" /> Instalar
        </button>
      ) : showIosSteps ? (
        <ol className="mt-3 space-y-1.5 rounded-xl bg-muted/60 p-3 text-xs">
          <li className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-foreground text-[11px] font-bold text-blush">1</span> Toque em <Share className="inline size-3.5" /> <strong>Compartilhar</strong> na barra do Safari</li>
          <li className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-foreground text-[11px] font-bold text-blush">2</span> Escolha <strong>Adicionar à Tela de Início</strong></li>
          <li className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-foreground text-[11px] font-bold text-blush">3</span> Confirme em <strong>Adicionar</strong></li>
        </ol>
      ) : (
        <button type="button" onClick={() => setShowIosSteps(true)} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-blush">
          <Share className="size-4" /> Como instalar no iPhone
        </button>
      )}
    </div>
  );
}
