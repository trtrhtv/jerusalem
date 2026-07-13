"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** כפתור "התקן על הטלפון" — מופיע רק כשהדפדפן מציע התקנת PWA */
export function InstallButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installEvent) return null;

  return (
    <button
      onClick={() => {
        void installEvent.prompt();
        void installEvent.userChoice.then(() => setInstallEvent(null));
      }}
      className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-semibold hover:bg-neutral-50 dark:border-white/20 dark:hover:bg-neutral-800"
    >
      📲 התקן על הטלפון
    </button>
  );
}
