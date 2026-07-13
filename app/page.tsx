import { MapClient } from "@/components/MapClient";

export default function Home() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="z-30 shrink-0 border-b border-black/10 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-neutral-950">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold">ירושלים בשכבות זמן</h1>
            <span className="text-xs text-neutral-500">
              מבט-על · ציר שער יפו–רחוב יפו (פיילוט)
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            הדמיה מעוגנת-מקורות — אין נתונים מומצאים. כל אלמנט נושא מדרג ראיות ומקורות.
          </p>
        </div>
      </header>
      <main className="relative min-h-0 flex-1">
        <MapClient />
      </main>
    </div>
  );
}
