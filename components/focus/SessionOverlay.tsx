"use client";

import type { LiveSession } from "@/lib/focus/types";
import { formatDuration, formatMinutes } from "@/lib/focus/friction";
import { ConfessionModal } from "./ConfessionModal";

/** מסך הפוקוס: מוצג במקום כל האפליקציה כשסשן פעיל */
export function SessionOverlay({
  session,
  estimateMinutes,
  onEnd,
  onStartBreak,
  onEndBreak,
  onResolveEscape,
}: {
  session: LiveSession;
  estimateMinutes: number | null;
  onEnd: (markTaskDone: boolean) => void;
  onStartBreak: () => void;
  onEndBreak: () => void;
  onResolveEscape: (explanation: string, verdict: "needed" | "wasted") => void;
}) {
  const estimateMs = estimateMinutes ? estimateMinutes * 60_000 : null;
  const progress = estimateMs ? Math.min(1, session.focusedMs / estimateMs) : null;

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-xl flex-col items-center justify-center gap-6 text-center">
      <div>
        <div className="text-sm font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          {session.onBreak ? "בהפסקה מוצהרת" : "בפוקוס עכשיו"}
        </div>
        <h2 className="mt-1 text-2xl font-bold">{session.taskTitle}</h2>
      </div>

      <div
        className={`font-mono text-6xl font-bold tabular-nums ${
          session.onBreak ? "text-neutral-400" : ""
        }`}
      >
        {formatDuration(session.focusedMs)}
      </div>

      {progress !== null && (
        <div className="w-full max-w-sm">
          <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {Math.round(progress * 100)}% מתוך הערכה של {estimateMinutes} דק׳
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-neutral-500">
        <span>
          בריחות: <b className="text-red-600 dark:text-red-400">{session.escapeCount}</b>
        </span>
        <span>
          זמן שבוזבז:{" "}
          <b className="text-red-600 dark:text-red-400">{formatMinutes(session.wastedMs)}</b>
        </span>
        {session.breakMs > 0 && <span>הפסקות: {formatMinutes(session.breakMs)}</span>}
      </div>

      {!session.onBreak && (
        <p className="max-w-sm text-xs text-neutral-400">
          אם תעבור לטאב או לחלון אחר ליותר מ־10 שניות — תידרש להסביר את זה בכתב
          כשתחזור. יוצא בכוונה? הצהר על הפסקה קודם.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {session.onBreak ? (
          <button
            onClick={onEndBreak}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            חזרתי — המשך פוקוס
          </button>
        ) : (
          <button
            onClick={onStartBreak}
            className="rounded-lg border border-black/15 px-5 py-2.5 text-sm font-semibold hover:bg-neutral-50 dark:border-white/20 dark:hover:bg-neutral-800"
          >
            ☕ הפסקה מוצהרת
          </button>
        )}
        <button
          onClick={() => onEnd(true)}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          ✓ סיימתי את המשימה
        </button>
        <button
          onClick={() => onEnd(false)}
          className="rounded-lg px-5 py-2.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          עצור סשן בלי לסיים
        </button>
      </div>

      {session.pendingEscape && (
        <ConfessionModal
          awayMs={session.pendingEscape.returnedAt - session.pendingEscape.leftAt}
          offenseNumber={session.wastedOffenses + 1}
          onResolve={onResolveEscape}
        />
      )}
    </div>
  );
}
