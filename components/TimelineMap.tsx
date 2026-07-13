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
  viewpoints,
  viewpointsGeoJSON,
} from "@/lib/data";
import type { TimeFeature, Viewpoint } from "@/lib/types";
import { historicMaps, type HistoricMapDef } from "@/lib/historicMaps";
import { EvidencePanel } from "./EvidencePanel";
import { ViewpointPanel } from "./ViewpointPanel";

/** Minimal surface of @allmaps/maplibre's WarpedMapLayer we rely on. */
interface WarpedLayerLike {
  addGeoreferenceAnnotationByUrl: (url: string) => Promise<unknown>;
  setOpacity: (o: number) => void;
}

const SRC = "corridor";
const VP_SRC = "viewpoints";
const VP_LAYER = "viewpoint-camera";

/**
 * Draws the camera icon at runtime on a canvas — keeps the style fully
 * self-contained (no sprite/glyph server dependency).
 */
function makeCameraIcon(): ImageData | null {
  const s = 48;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // white disc with dark ring so it reads on any background
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0369a1";
  ctx.stroke();

  // camera body
  ctx.fillStyle = "#0369a1";
  const bx = 12, by = 18, bw = 24, bh = 15, r = 3;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
  ctx.arcTo(bx, by + bh, bx, by, r);
  ctx.arcTo(bx, by, bx + bw, by, r);
  ctx.closePath();
  ctx.fill();
  // viewfinder bump
  ctx.fillRect(19, 14, 10, 5);
  // lens
  ctx.beginPath();
  ctx.arc(s / 2, by + bh / 2, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  return ctx.getImageData(0, 0, s, s);
}

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

/**
 * Initial year from the shareable ?year= URL param. Safe to read window here:
 * this component is loaded with ssr:false, so the first render is client-side.
 */
function initialYear(): number {
  if (typeof window === "undefined") return TIMELINE.default;
  const y = Number(new URLSearchParams(window.location.search).get("year"));
  return Number.isFinite(y) && y >= TIMELINE.min && y <= TIMELINE.max
    ? Math.round(y)
    : TIMELINE.default;
}

export function TimelineMap() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [year, setYear] = useState<number>(initialYear);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVpId, setSelectedVpId] = useState<string | null>(null);
  const [enabledHistoric, setEnabledHistoric] = useState<Set<string>>(new Set());
  const [historicBusy, setHistoricBusy] = useState<string | null>(null);
  const warpedLayersRef = useRef<Map<string, WarpedLayerLike>>(new Map());

  const toggleHistoricMap = async (m: HistoricMapDef) => {
    const map = mapRef.current;
    if (!map || m.status !== "ready" || !m.annotationUrl || historicBusy) return;
    const layerId = `historic-${m.id}`;
    if (enabledHistoric.has(m.id)) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      warpedLayersRef.current.delete(m.id);
      setEnabledHistoric((s) => {
        const n = new Set(s);
        n.delete(m.id);
        return n;
      });
      return;
    }
    setHistoricBusy(m.id);
    try {
      // heavy dependency — load only when a historical layer is switched on
      const { WarpedMapLayer } = await import("@allmaps/maplibre");
      const layer = new WarpedMapLayer({ layerId }) as unknown as WarpedLayerLike;
      // insert under our vector layers so the history stays readable on top
      map.addLayer(layer as never, "poly-fill");
      await layer.addGeoreferenceAnnotationByUrl(m.annotationUrl);
      layer.setOpacity(m.defaultOpacity);
      warpedLayersRef.current.set(m.id, layer);
      setEnabledHistoric((s) => new Set(s).add(m.id));
    } catch (err) {
      console.warn("historic map failed to load:", m.id, err);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    } finally {
      setHistoricBusy(null);
    }
  };

  // A selection is only "effective" while its feature is visible at the current
  // year; scrolling the timeline past its window deselects it (derived, so no
  // setState-in-effect needed).
  const selected: TimeFeature | null = useMemo(() => {
    const f = corridor.features.find((ft) => ft.properties.id === selectedId) ?? null;
    return f && isVisibleAt(f, year) ? f : null;
  }, [selectedId, year]);

  // Same rule for viewpoints: a photograph exists on the timeline only from
  // the year it was made.
  const selectedVp: Viewpoint | null = useMemo(() => {
    const v = viewpoints.find((vp) => vp.id === selectedVpId) ?? null;
    return v && v.year <= year ? v : null;
  }, [selectedVpId, year]);

  const visibleFeatures = useMemo(
    () => corridor.features.filter((f) => isVisibleAt(f, year)),
    [year],
  );

  const visibleVpCount = useMemo(
    () => viewpoints.filter((v) => v.year <= year).length,
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

      // camera viewpoints (visual source anchors)
      const icon = makeCameraIcon();
      if (icon) map.addImage("camera-icon", icon, { pixelRatio: 2 });
      map.addSource(VP_SRC, { type: "geojson", data: viewpointsGeoJSON() as never });
      map.addLayer({
        id: VP_LAYER,
        type: "symbol",
        source: VP_SRC,
        layout: {
          "icon-image": "camera-icon",
          "icon-size": 1,
          "icon-allow-overlap": true,
        },
      });

      for (const id of INTERACTIVE) {
        map.on("click", id, (e) => {
          // cameras sit above features — if one was clicked, let it win
          if (map.queryRenderedFeatures(e.point, { layers: [VP_LAYER] }).length) return;
          const f = e.features?.[0] as MapGeoJSONFeature | undefined;
          const fid = f?.properties?.id as string | undefined;
          if (fid) {
            setSelectedId(fid);
            setSelectedVpId(null);
          }
        });
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      }
      map.on("click", VP_LAYER, (e) => {
        const f = e.features?.[0] as MapGeoJSONFeature | undefined;
        const vid = f?.properties?.id as string | undefined;
        if (vid) {
          setSelectedVpId(vid);
          setSelectedId(null);
        }
      });
      map.on("mouseenter", VP_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", VP_LAYER, () => (map.getCanvas().style.cursor = ""));
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [...INTERACTIVE, VP_LAYER],
        });
        if (hits.length === 0) {
          setSelectedId(null);
          setSelectedVpId(null);
        }
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

  // keep the shareable ?year= param in sync (debounced — the slider fires fast)
  useEffect(() => {
    const t = setTimeout(() => {
      const u = new URL(window.location.href);
      u.searchParams.set("year", String(year));
      window.history.replaceState(null, "", u);
    }, 250);
    return () => clearTimeout(t);
  }, [year]);

  // --- apply time filter when year changes ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const [id, base] of Object.entries(BASE_FILTERS)) {
      map.setFilter(id, composeTimeFilter(base, year));
    }
    // a photograph exists on the timeline only from the year it was made
    map.setFilter(VP_LAYER, ["<=", ["get", "year"], year]);
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
              {visibleVpCount > 0 && ` · 📷 ${visibleVpCount}`}
            </span>
            <a
              href={`/walk?year=${year}`}
              className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-semibold text-white transition hover:bg-neutral-600 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-neutral-400"
              title="כניסה למצב הליכה בשער יפו, בשנה הנבחרת"
            >
              🚶 הליכה ב-{year}
            </a>
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
            <br />
            📷 = תצלום/ליתוגרפיה היסטוריים מהמקום — מופיעים על ציר הזמן משנת יצירתם
            (לפני 1839 אין תיעוד חזותי, והמפה מציגה זאת בכנות).
          </p>
        </div>
      </div>

      {/* Historic map layers (bottom-right) */}
      <div className="pointer-events-none absolute bottom-0 right-0 z-10 p-3">
        <div className="pointer-events-auto max-w-56 rounded-xl border border-black/10 bg-white/90 p-3 text-xs shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
          <div className="mb-1.5 font-semibold">🗺️ מפות היסטוריות</div>
          <ul className="space-y-1.5">
            {historicMaps.map((m) => (
              <li key={m.id}>
                {m.status === "ready" ? (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={enabledHistoric.has(m.id)}
                      disabled={historicBusy === m.id}
                      onChange={() => toggleHistoricMap(m)}
                      className="accent-neutral-800 dark:accent-neutral-200"
                    />
                    <span>
                      {m.titleHe}
                      {historicBusy === m.id && " ⏳"}
                    </span>
                  </label>
                ) : (
                  <div className="flex items-center gap-2 text-neutral-400">
                    <span className="inline-block h-3 w-3 rounded-sm border border-dashed border-neutral-400" />
                    <span>
                      {m.titleHe}
                      <span className="block text-[10px]">
                        ממתינה ליישור גיאוגרפי (docs/WILSON-GEOREF.md)
                      </span>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
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

      {/* Photo viewpoint panel (right) */}
      {!selected && selectedVp && (
        <ViewpointPanel
          viewpoint={selectedVp}
          source={getSource(selectedVp.sourceId)}
          onClose={() => setSelectedVpId(null)}
        />
      )}
    </div>
  );
}
