"use client";

import { useEffect, useState } from "react";
import type { EscapeVerdict } from "@/lib/focus/types";
import { cooldownSeconds, formatMinutes, minExplanationChars } from "@/lib/focus/friction";

/**
 * מסך הווידוי: חוסם את כל המסך אחרי בריחה. אין דרך לסגור אותו בלי
 * להסביר בכתב מה עשית — והחיכוך מסלים ככל שאתה בורח יותר.
 */
export function ConfessionModal({
  awayMs,
  offenseNumber,
  onResolve,
}: {
  awayMs: number;
  /** מספר העבירה אם תודה שזה היה בזבוז (קובע את רמת החיכוך) */
  offenseNumber: number;
  onResolve: (explanation: string, verdict: EscapeVerdict) => void;
}) {
  const [explanation, setExplanation] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(() => cooldownSeconds(offenseNumber));

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = setInterval(() => setCooldownLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownLeft]);

  const minChars = minExplanationChars(offenseNumber);
  const trimmedLen = explanation.trim().length;
  const canSubmit = trimmedLen >= minChars && cooldownLeft === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/90 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-neutral-900">
        <h2 className="text-xl font-bold text-red-700 dark:text-red-400">
          עצור. היית בחוץ {formatMinutes(awayMs)}.
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          עזבת באמצע העבודה. לפני שממשיכים — תסביר לעצמך בכתב: איפה היית, למה,
          והאם זה באמת היה נחוץ עכשיו. ההסבר נשמר ביומן הבזבוזים.
        </p>
        {offenseNumber > 1 && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
            זו כבר בריחה מספר {offenseNumber} בסשן הזה — ההסבר הנדרש התארך.
          </p>
        )}
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          autoFocus
          rows={3}
          placeholder="מה עשיתי בחוץ, ולמה עכשיו?"
          className="mt-4 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-red-500 dark:border-white/15"
        />
        <div className="mt-1 text-xs text-neutral-500">
          {trimmedLen < minChars
            ? `נדרשים לפחות ${minChars} תווים (נכתבו ${trimmedLen})`
            : "ההסבר מספיק ארוך"}
          {cooldownLeft > 0 && (
            <span className="ms-2 font-semibold text-red-600 dark:text-red-400">
              · המתנה כפויה: {cooldownLeft} שנ׳
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            disabled={!canSubmit}
            onClick={() => onResolve(explanation.trim(), "wasted")}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            בזבזתי, מודה — חוזר לעבודה
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => onResolve(explanation.trim(), "needed")}
            className="flex-1 rounded-lg border border-black/15 px-4 py-2.5 text-sm font-semibold hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:hover:bg-neutral-800"
          >
            זה היה נחוץ באמת
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-neutral-400">
          תהיה כן עם עצמך — הכפתור הימני לא מעניש, אבל השקר נשאר ביומן שלך.
        </p>
      </div>
    </div>
  );
}
