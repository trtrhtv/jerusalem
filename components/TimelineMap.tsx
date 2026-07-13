"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type ExpressionSpecification,
  type FilterSpecification,
  type MapGeoJSONFeature,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { baseStyle, PILOT_CENTER, PILOT_ZOOM } from "@/lib/mapStyle";
import {
  TIMELINE,
  corridor,
  corridorWithTimeBounds,
  evidenceTierMeta,
  getSource,
  periodByKey,
  periods,
} from "@/lib/data";
import type { TimeFeature } from "@/lib/types";
import { EvidencePanel } from "./EvidencePanel";

const SRC = "corridor";

// period key -> color, flattened for a MapLibre "match" expression
const periodColorMatch: ExpressionSpecification = [
  "match",
  ["get", "builtPeriod"],
  ...periods.flatMap((p) => [p.key, p.color]),
  "#888888",
] as unknown as ExpressionSpecification;

const tierFillOpacity: ExpressionSpecification = [
  "match",
  ["get", "evidenceTier"],
  "documented",
  0.55,
  "typological",
  0.4,
  "conjecture",
  0.26,
  0.4,
] as unknown as ExpressionSpecification;

// Static per-layer guards (geometry type + tier). Time is composed on top of
// these every time the slider moves, so filters never accumulate.
const BASE_FILTERS: Record<string, FilterSpecification> = {
  "poly-fill": ["==", ["geometry-type"], "Polygon"],
  "poly-line-doc": [
    "all",
    ["==", ["geometry-type"], "Polygon"],
    ["==", ["get", "evidenceTier"], "documented"],
  ],
  "poly-line-uncertain": [
    "all",
    ["==", ["geometry-type"], "Polygon"],
    ["!=", ["get", "evidenceTier"], "documented"],
  ],
  "line-doc": [
    "all",
    ["==", ["geometry-type"], "LineString"],
    ["==", ["get", "evidenceTier"], "documented"],
  ],
  "line-uncertain": [
    "all",
    ["==", ["geometry-type"], "LineString"],
    ["!=", ["get", "evidenceTier"], "documented"],
  ],
  "point-feature": ["==", ["geometry-type"], "Point"],
};

const INTERACTIVE = ["poly-fill", "line-doc", "line-uncertain", "point-feature"];

function composeTimeFilter(base: FilterSpecification, year: number): FilterSpecification {
  return [
    "all",
    base,
    ["<=", ["get", "appearYear"], year],
    [">", ["get", "disappearYear"], year],
  ] as unknown as FilterSpecification;
}

function periodForYear(year: number) {
  let current = periods[0];
  for (const p of periods) if (p.start <= year) current = p;
  return current;
}

function isVisibleAt(f: TimeFeature, year: number) {
  const appear = f.properties.builtYear ?? periodByKey[f.properties.builtPeriod].start;
  const disappear = f.properties.demolishedYear ?? 99999;
  return appear <= year && disappear > year;
}

export function TimelineMap() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [year, setYear] = useState<number>(TIMELINE.default);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A selection is only "effective" while its feature is visible at the current
  // year; scrolling the timeline past its window deselects it (derived, so no
  // setState-in-effect needed).
  const selected: TimeFeature | null = useMemo(() => {
    const f = corridor.features.find((ft) => ft.properties.id === selectedId) ?? null;
    return f && isVisibleAt(f, year) ? f : null;
  }, [selectedId, year]);

  const visibleFeatures = useMemo(
    () => corridor.features.filter((f) => isVisibleAt(f, year)),
    [year],
  );

  // --- init map once ---
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyle,
      center: PILOT_CENTER,
      zoom: PILOT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    // Add our sources/layers once the STYLE is ready. We intentionally do not
    // wait for the `load` event: that also waits for the first tile render, and
    // if the base tiles are slow or blocked the historical layer would never
    // appear. `styledata` + isStyleLoaded() is independent of tile fetches.
    let done = false;
    const setup = () => {
      if (done || !map.isStyleLoaded() || map.getSource(SRC)) return;
      done = true;

      map.addSource(SRC, { type: "geojson", data: corridorWithTimeBounds() as never });

      map.addLayer({
        id: "poly-fill",
        type: "fill",
        source: SRC,
        filter: BASE_FILTERS["poly-fill"],
        paint: { "fill-color": periodColorMatch, "fill-opacity": tierFillOpacity },
      });
      map.addLayer({
        id: "poly-line-doc",
        type: "line",
        source: SRC,
        filter: BASE_FILTERS["poly-line-doc"],
        paint: { "line-color": periodColorMatch, "line-width": 2 },
      });
      map.addLayer({
        id: "poly-line-uncertain",
        type: "line",
        source: SRC,
        filter: BASE_FILTERS["poly-line-uncertain"],
        paint: { "line-color": periodColorMatch, "line-width": 2, "line-dasharray": [2, 2] },
      });
      map.addLayer({
        id: "line-doc",
        type: "line",
        source: SRC,
        filter: BASE_FILTERS["line-doc"],
        paint: { "line-color": periodColorMatch, "line-width": 4 },
      });
      map.addLayer({
        id: "line-uncertain",
        type: "line",
        source: SRC,
        filter: BASE_FILTERS["line-uncertain"],
        paint: { "line-color": periodColorMatch, "line-width": 4, "line-dasharray": [2, 1.5] },
      });
      map.addLayer({
        id: "point-feature",
        type: "circle",
        source: SRC,
        filter: BASE_FILTERS["point-feature"],
        paint: {
          "circle-radius": 7,
          "circle-color": periodColorMatch,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": tierFillOpacity,
        },
      });
      map.addLayer({
        id: "selection",
        type: "line",
        source: SRC,
        filter: ["==", ["get", "id"], "__none__"],
        paint: { "line-color": "#111827", "line-width": 3.5 },
      });

      for (const id of INTERACTIVE) {
        map.on("click", id, (e) => {
          const f = e.features?.[0] as MapGeoJSONFeature | undefined;
          const fid = f?.properties?.id as string | undefined;
          if (fid) setSelectedId(fid);
        });
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      }
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: INTERACTIVE });
        if (hits.length === 0) setSelectedId(null);
      });

      map.off("styledata", setup);
      setReady(true);
    };

    map.on("styledata", setup);
    map.on("load", setup);
    setup();

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- apply time filter when year changes ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const [id, base] of Object.entries(BASE_FILTERS)) {
      map.setFilter(id, composeTimeFilter(base, year));
    }
  }, [year, ready]);

  // --- selection highlight (follows the derived, visibility-aware selection) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter("selection", [
      "==",
      ["get", "id"],
      selected?.properties.id ?? "__none__",
    ]);
  }, [selected, ready]);

  const activePeriod = periodForYear(year);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />

      {/* Timeline slider (top) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
        <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-black/10 bg-white/90 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="text-2xl font-bold tabular-nums">{year}</span>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: activePeriod.color }}
            >
              {activePeriod.labelHe} · {activePeriod.label}
            </span>
            <span className="text-xs text-neutral-500">
              {visibleFeatures.length} אלמנטים גלויים
            </span>
          </div>
          {/* LTR so the timeline reads chronologically: drag right = later. */}
          <div dir="ltr">
            <input
              type="range"
              min={TIMELINE.min}
              max={TIMELINE.max}
              step={1}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full accent-neutral-800 dark:accent-neutral-200"
              aria-label="שנה על ציר הזמן"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>{TIMELINE.min}</span>
              <span dir="rtl">גרור את ציר הזמן — העיר נבנית</span>
              <span>{TIMELINE.max}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Evidence + period legend (bottom-left) */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-10 p-3">
        <div className="pointer-events-auto max-w-xs space-y-2 rounded-xl border border-black/10 bg-white/90 p-3 text-xs shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
          <div>
            <div className="mb-1 font-semibold">מדרג ראיות</div>
            <ul className="space-y-1">
              {(["documented", "typological", "conjecture"] as const).map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span
                    className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm"
                    style={{
                      backgroundColor: evidenceTierMeta[t].color,
                      opacity: t === "documented" ? 1 : t === "typological" ? 0.7 : 0.5,
                    }}
                  />
                  <span>
                    <b>{evidenceTierMeta[t].labelHe}</b>
                    <span className="text-neutral-500"> — {evidenceTierMeta[t].descriptionHe}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="border-t border-black/10 pt-2 text-[10px] leading-snug text-neutral-500 dark:border-white/10">
            צבע = תקופת בנייה. קו מקווקו = ודאות נמוכה יותר. לחצו על אלמנט לפירוט המקור.
          </p>
        </div>
      </div>

      {/* Detail / evidence panel (right) */}
      {selected && (
        <EvidencePanel
          feature={selected}
          getSource={getSource}
          period={periodByKey[selected.properties.builtPeriod]}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
