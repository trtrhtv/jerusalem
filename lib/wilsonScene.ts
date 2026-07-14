// Bridge between the digitized Wilson 1865 GeoJSON and the walking scene.
//
// This is the "one data file feeds both" module of Stage B: the SAME
// data/features/wilson-1865-buildings.json that the timeline map renders is
// converted here into scene-local walk elements, which the typological
// generator (lib/houseKit.ts) turns into 3D buildings. No geometry is
// duplicated by hand anywhere.
//
// Coordinates: WGS84 → meters relative to the walk-scene anchor (+x east,
// +z south), then a documented rigid CALIBRATION translation. Why: the
// hand-built pilot elements (gate, wall, citadel) were placed as massing
// estimates in scene space, while the surveyed layer arrives via the Wilson
// georeference (global RMS ~26 m). Rather than let two ±20 m error budgets
// collide in the middle of the plaza, we pin the surveyed David Street's
// west end to the hand-built gate's east opening. The translation is rigid —
// the surveyed shapes, distances and bearings (the actual survey content)
// are untouched. Stage C (real heights + terrain) will rebuild the hand-made
// core from georeferenced data and retire this constant.

import wilsonRaw from "@/data/features/wilson-1865-buildings.json";
import { walkScene, type WalkElement } from "./walkScene";
import type {
  BuildingType,
  GeometryConfidence,
  TimeFeature,
  TimeFeatureCollection,
} from "./types";
import { seededRand } from "./walk3d";

export const wilsonFeatures = wilsonRaw as unknown as TimeFeatureCollection;

/** Mamluk period start — appearance year for the undated intra-mural fabric. */
const MAMLUK_START = 1250;

/** A walk element generated from a digitized feature (not hand-modeled). */
export interface GeneratedWalkElement extends WalkElement {
  generated: true;
  buildingType: BuildingType;
  geometryConfidence: GeometryConfidence;
}

// ---------- WGS84 → scene-local meters ----------

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON =
  111320 * Math.cos((walkScene.anchor.lat * Math.PI) / 180);

/**
 * Rigid scene calibration (meters): pins the surveyed David Street west end
 * (11.6, 19.2) onto the hand-built gate's east opening (11, -5). See header.
 */
export const SCENE_CALIBRATION = { dx: -0.6, dz: -24.2 } as const;

function lonLatToLocal([lon, lat]: number[]): [number, number] {
  return [
    (lon - walkScene.anchor.lon) * M_PER_DEG_LON + SCENE_CALIBRATION.dx,
    (walkScene.anchor.lat - lat) * M_PER_DEG_LAT + SCENE_CALIBRATION.dz,
  ];
}

// ---------- street line → ribbon polygon ----------

/** Expand a centerline to a flat ribbon polygon of the given width. */
function lineToRibbon(pts: [number, number][], width: number): [number, number][] {
  const half = width / 2;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const [px, pz] = pts[Math.max(0, i - 1)];
    const [nx2, nz2] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = nx2 - px;
    const dz = nz2 - pz;
    const len = Math.hypot(dx, dz) || 1;
    // unit normal to the averaged direction
    const ux = -dz / len;
    const uz = dx / len;
    const [x, z] = pts[i];
    left.push([x + ux * half, z + uz * half]);
    right.push([x - ux * half, z - uz * half]);
  }
  return [...left, ...right.reverse()];
}

// ---------- typological parameters (deterministic per feature id) ----------

/** Street widths in meters — estimated from the survey's drawn street bands. */
const STREET_WIDTH: Record<string, number> = {
  "wilson-david-street": 6,
  "wilson-harat-an-nasara": 4,
  "wilson-harat-ad-dawaye": 4,
};

/**
 * Typological massing height for a digitized block. Wilson records outlines,
 * not heights — heights are TYPOLOGICAL estimates (dense old-city fabric:
 * shops one vaulted storey, mixed blocks two) with deterministic variation.
 * Stage C replaces these with photogrammetric heights.
 */
function typologicalHeight(f: TimeFeature, rand: () => number): number {
  switch (f.properties.buildingType) {
    case "commercial":
      return 4.8 + rand() * 1.2;
    case "mixed":
      return 7.2 + rand() * 1.6;
    default:
      return 6.5 + rand() * 1.5;
  }
}

const HEIGHT_NOTE_HE =
  " הגובה טיפולוגי — מפת וילסון מתעדת מתאר, לא גובה; שלב ג' יביא גבהים אמיתיים מתצ\"א.";
const HEIGHT_NOTE_EN =
  " Height is typological — the Wilson survey records outlines, not heights; Stage C brings real photogrammetric heights.";

function kindFor(f: TimeFeature): WalkElement["kind"] {
  if (f.properties.buildingType === "road") return "road";
  if (f.properties.id === "wilson-pool-hezekiah") return "pool";
  return "building";
}

/**
 * The digitized Wilson features as scene-local walk elements. Polygons keep
 * their surveyed footprints; street centerlines become ribbon footprints.
 */
export const wilsonWalkElements: GeneratedWalkElement[] = wilsonFeatures.features.map(
  (f) => {
    const p = f.properties;
    const rand = seededRand(p.id);
    const kind = kindFor(f);
    const rawCoords =
      f.geometry.type === "Polygon"
        ? (f.geometry.coordinates as number[][][])[0].slice(0, -1)
        : (f.geometry.coordinates as number[][]);
    const local = rawCoords.map(lonLatToLocal);
    const footprint =
      f.geometry.type === "LineString"
        ? lineToRibbon(local, STREET_WIDTH[p.id] ?? 4)
        : local;
    const isFlat = kind === "road" || kind === "pool";
    return {
      id: p.id,
      name: p.name,
      nameHe: p.nameHe ?? p.name,
      kind,
      footprint,
      height: isFlat ? 0.12 : Math.round(typologicalHeight(f, rand) * 10) / 10,
      builtYear: p.builtYear,
      builtPeriodStart: p.builtYear == null ? MAMLUK_START : undefined,
      demolishedYear: p.demolishedYear ?? null,
      evidenceTier: p.evidenceTier,
      sources: p.sources,
      notesHe: (p.notesHe ?? "") + (isFlat ? "" : HEIGHT_NOTE_HE),
      notes: (p.notes ?? "") + (isFlat ? "" : HEIGHT_NOTE_EN),
      generated: true,
      buildingType: p.buildingType,
      geometryConfidence: p.geometryConfidence,
    };
  },
);
