"use client";

import { evidenceTierMeta } from "@/lib/data";
import type { PeriodDef, SourceRecord, TimeFeature } from "@/lib/types";

const buildingTypeHe: Record<string, string> = {
  gate: "שער",
  fortification: "ביצור",
  road: "דרך",
  monument: "מונומנט",
  "residential-quarter": "שכונת מגורים",
  "religious-compound": "מתחם דתי",
  institution: "מוסד",
  commercial: "מסחר",
  mixed: "מעורב",
};

const geometryConfidenceHe: Record<string, string> = {
  surveyed: "מדוד (מיושר גיאוגרפית)",
  approximate: "מיקום מקורב",
  schematic: "סכמטי — טרם דיגיטציה",
};

const rightsHe: Record<string, string> = {
  "public-domain": "נחלת הכלל",
  "open-license": "רישיון פתוח",
  "reference-only": "רפרנס בלבד (קניין יוצריו)",
  "our-own": "יצירה שלנו",
};

export function EvidencePanel({
  feature,
  period,
  getSource,
  onClose,
}: {
  feature: TimeFeature;
  period: PeriodDef;
  getSource: (id: string) => SourceRecord | undefined;
  onClose: () => void;
}) {
  const p = feature.properties;
  const tier = evidenceTierMeta[p.evidenceTier];

  return (
    <div className="pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col overflow-y-auto border-l border-black/10 bg-white/95 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-neutral-900/95">
      <div className="flex items-start justify-between gap-2 border-b border-black/10 p-4 dark:border-white/10">
        <div>
          <h2 className="text-lg font-bold leading-tight">{p.nameHe ?? p.name}</h2>
          <p className="text-sm text-neutral-500">{p.name}</p>
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
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: period.color }}
          >
            {period.labelHe}
            {p.builtYear ? ` · ${p.builtYearApprox ? "~" : ""}${p.builtYear}` : ""}
            {p.demolishedYear ? ` – ${p.demolishedYear}` : ""}
          </span>
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100">
            {buildingTypeHe[p.buildingType] ?? p.buildingType}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: tier.color }}
            title={tier.descriptionHe}
          >
            {tier.labelHe}
          </span>
        </div>

        {p.notesHe && <p className="leading-relaxed">{p.notesHe}</p>}
        {p.notes && <p className="text-xs leading-relaxed text-neutral-500">{p.notes}</p>}

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-black/10 pt-3 text-xs dark:border-white/10">
          <dt className="text-neutral-500">מדרג ראיות</dt>
          <dd>{tier.descriptionHe}</dd>
          <dt className="text-neutral-500">ודאות גאומטריה</dt>
          <dd>{geometryConfidenceHe[p.geometryConfidence] ?? p.geometryConfidence}</dd>
        </dl>

        <div className="border-t border-black/10 pt-3 dark:border-white/10">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            עוגני מקור · Sources
          </h3>
          {p.sources.length === 0 ? (
            <p className="text-xs italic text-neutral-500">
              אין מקור ישיר — אלמנט זה מסומן כהשערה.
            </p>
          ) : (
            <ul className="space-y-2">
              {p.sources.map((sid) => {
                const s = getSource(sid);
                if (!s) return null;
                return (
                  <li
                    key={sid}
                    className="rounded-lg border border-black/10 p-2 dark:border-white/10"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{s.titleHe ?? s.title}</span>
                      <span className="shrink-0 text-[10px] text-neutral-400">{s.year}</span>
                    </div>
                    {s.creator && <div className="text-xs text-neutral-500">{s.creator}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          s.rights === "reference-only"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                        }`}
                      >
                        {rightsHe[s.rights] ?? s.rights}
                      </span>
                      {s.url && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
                        >
                          למקור ↗
                        </a>
                      )}
                    </div>
                    {s.rightsNote && (
                      <p className="mt-1 text-[10px] leading-snug text-neutral-400">
                        {s.rightsNote}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
