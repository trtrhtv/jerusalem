import Link from "next/link";
import { WalkClient } from "@/components/WalkClient";

export const metadata = {
  title: "מצב הליכה · ירושלים בשכבות זמן",
  description:
    "פיילוט הליכה תלת-ממדית באזור שער יפו, שלהי התקופה העות'מאנית — מחקר מסות low-poly מעוגן-מקורות.",
};

export default function WalkPage() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="z-30 shrink-0 border-b border-black/10 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-neutral-950">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold">מצב הליכה — שער יפו</h1>
            <span className="text-xs text-neutral-500">
              פיילוט · עות&apos;מאנית מאוחרת · מחקר מסות מעוגן-מקורות
            </span>
          </div>
          <Link
            href="/"
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            ← חזרה למפת ציר-הזמן
          </Link>
        </div>
      </header>
      <main className="relative min-h-0 flex-1">
        <WalkClient />
      </main>
    </div>
  );
}
