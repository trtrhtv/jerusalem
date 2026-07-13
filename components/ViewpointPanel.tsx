"use client";

import type { SourceRecord, Viewpoint } from "@/lib/types";

const positionConfidenceHe: Record<string, string> = {
  documented: "מיקום מצלמה מדויק",
  approximate: "מיקום מצלמה מוערך מתוכן התמונה",
};

/**
 * The "slide between the simulation and the source" anchor. We do not re-host
 * the image here — the panel presents the verified catalog record and links to
 * the item page at the holding institution.
 */
export function ViewpointPanel({
  viewpoint,
  source,
  onClose,
}: {
  viewpoint: Viewpoint;
  source: SourceRecord | undefined;
  onClose: () => void;
}) {
  const v = viewpoint;
  return (
    <div className="pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col overflow-y-auto border-l border-black/10 bg-white/95 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-neutral-900/95">
      <div className="flex items-start justify-between gap-2 border-b border-black/10 p-4 dark:border-white/10">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
            📷 עוגן מקור חזותי · Visual source anchor
          </div>
          <h2 className="text-lg font-bold leading-tight">{v.titleHe ?? v.title}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{v.title}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="סגור"
          className="rounded-md px-2 py-1 text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4 p-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-sky-600 px-2 py-0.5 text-xs font-medium text-white">
            {v.yearDisplay}
          </span>
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100">
            {positionConfidenceHe[v.positionConfidence]}
          </span>
        </div>

        {v.notesHe && <p className="leading-relaxed">{v.notesHe}</p>}
        {v.notes && <p className="text-xs leading-relaxed text-neutral-500">{v.notes}</p>}

        <a
          href={v.itemUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-sky-600/40 bg-sky-50 p-3 text-center transition hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-950/70"
        >
          <span className="block text-sm font-semibold text-sky-800 dark:text-sky-200">
            צפייה בתצלום המקורי בקטלוג המוסד ↗
          </span>
          <span className="mt-0.5 block text-[11px] text-sky-700/80 dark:text-sky-300/80">
            View the original at the holding institution
          </span>
        </a>

        {source && (
          <div className="rounded-lg border border-black/10 p-2 text-xs dark:border-white/10">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{source.titleHe ?? source.title}</span>
              <span className="shrink-0 text-[10px] text-neutral-400">{source.year}</span>
            </div>
            {source.holdingInstitution && (
              <div className="mt-0.5 text-neutral-500">{source.holdingInstitution}</div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                נחלת הכלל
              </span>
              {v.reproductionNumber && (
                <span className="font-mono text-[10px] text-neutral-400">
                  {v.reproductionNumber}
                </span>
              )}
            </div>
          </div>
        )}

        <p className="border-t border-black/10 pt-3 text-[10px] leading-snug text-neutral-400 dark:border-white/10">
          התמונה אינה מאוחסנת אצלנו — הקישור מוביל לרשומת הפריט המאומתת בארכיון.
          מיקום המצלמה על המפה {v.positionConfidence === "approximate" ? "מוערך ואינו מדויק" : "ידוע במדויק"}.
        </p>
      </div>
    </div>
  );
}
