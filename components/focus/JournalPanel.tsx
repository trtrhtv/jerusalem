"use client";

import type { EscapeRecord, SessionRecord } from "@/lib/focus/types";
import { formatMinutes } from "@/lib/focus/friction";

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
      <div
        className={`text-2xl font-bold tabular-nums ${
          tone === "bad"
            ? "text-red-600 dark:text-red-400"
            : tone === "good"
              ? "text-emerald-600 dark:text-emerald-400"
              : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-neutral-500">{label}</div>
    </div>
  );
}

export function JournalPanel({
  escapes,
  sessions,
}: {
  escapes: EscapeRecord[];
  sessions: SessionRecord[];
}) {
  const todaySessions = sessions.filter((s) => isToday(s.endedAt));
  const todayEscapes = escapes.filter((e) => isToday(e.returnedAt));
  const focusedToday = todaySessions.reduce((sum, s) => sum + s.focusedMs, 0);
  const wastedToday = todayEscapes
    .filter((e) => e.verdict === "wasted")
    .reduce((sum, e) => sum + e.awayMs, 0);
  const wastedCount = todayEscapes.filter((e) => e.verdict === "wasted").length;

  const recentEscapes = [...escapes].sort((a, b) => b.returnedAt - a.returnedAt).slice(0, 30);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="פוקוס היום" value={formatMinutes(focusedToday)} tone="good" />
        <Stat label="בוזבז היום" value={formatMinutes(wastedToday)} tone="bad" />
        <Stat label="בריחות שהודית בהן היום" value={String(wastedCount)} tone="bad" />
        <Stat label="סשנים היום" value={String(todaySessions.length)} />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-bold text-neutral-500">יומן וידויים</h3>
        {recentEscapes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-neutral-500 dark:border-white/15">
            אין בריחות מתועדות. או שאתה ממושמע — או שעוד לא התחלת סשן.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentEscapes.map((e) => (
              <li
                key={e.id}
                className={`rounded-xl border p-3 text-sm ${
                  e.verdict === "wasted"
                    ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30"
                    : "border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      e.verdict === "wasted"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    }`}
                  >
                    {e.verdict === "wasted" ? "בזבוז" : "היה נחוץ"}
                  </span>
                  <span className="font-semibold">{formatMinutes(e.awayMs)}</span>
                  <span className="text-neutral-500">
                    בזמן ״{e.taskTitle}״ · {timeOf(e.leftAt)}
                  </span>
                </div>
                <p className="mt-1 text-neutral-700 dark:text-neutral-300">{e.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {todaySessions.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-neutral-500">סשנים היום</h3>
          <ul className="space-y-2">
            {[...todaySessions]
              .sort((a, b) => b.endedAt - a.endedAt)
              .map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-black/10 bg-white p-3 text-sm dark:border-white/10 dark:bg-neutral-900"
                >
                  <span className="flex-1 font-medium">{s.taskTitle}</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ● {formatMinutes(s.focusedMs)} פוקוס
                  </span>
                  {s.wastedMs > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      ● {formatMinutes(s.wastedMs)} בזבוז
                    </span>
                  )}
                  {s.breakMs > 0 && (
                    <span className="text-neutral-500">● {formatMinutes(s.breakMs)} הפסקה</span>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
