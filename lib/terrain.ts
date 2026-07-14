import * as THREE from "three";
import elevationsRaw from "@/data/features/wilson-1865-elevations.json";
import { lonLatToLocal } from "./wilsonScene";
import type { WalkElement } from "./walkScene";

/**
 * Stage C — real topography, built from Wilson's own leveled benchmarks
 * (data/features/wilson-1865-elevations.json) instead of a fabricated slope.
 *
 * Honesty note: this replaces the FLAT conjectural ground plane with an
 * interpolated one informed by 4 real, documented survey points — a genuine
 * improvement, not a precise DEM. Building HEIGHTS remain typological
 * (no stereo-photogrammetry pipeline was run against the 1917/18 aerial
 * pairs; those archival images are not accessible in this environment).
 * What's real here is the GROUND's relief under the David Street corridor.
 */

interface ElevationPoint {
  id: string;
  x: number;
  z: number;
  /** Meters, relative to the plaza-corner benchmark (scene y=0). */
  y: number;
  elevationFeet: number;
  labelHe: string;
  label: string;
  decimalUncertain: boolean;
}

interface RawElevationFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: string;
    label: string;
    labelHe: string;
    elevationFeet: number;
    decimalUncertain: boolean;
  };
}

const raw = elevationsRaw as unknown as { features: RawElevationFeature[] };

/** Datum: the plaza-corner benchmark defines scene y=0 (where the hand-built gate sits). */
const DATUM_FEET =
  raw.features.find((f) => f.properties.id === "wilson-bm-plaza-corner")
    ?.properties.elevationFeet ?? raw.features[0].properties.elevationFeet;

export const elevationPoints: ElevationPoint[] = raw.features.map((f) => {
  const [x, z] = lonLatToLocal(f.geometry.coordinates);
  return {
    id: f.properties.id,
    x,
    z,
    y: (f.properties.elevationFeet - DATUM_FEET) * 0.3048,
    elevationFeet: f.properties.elevationFeet,
    label: f.properties.label,
    labelHe: f.properties.labelHe,
    decimalUncertain: f.properties.decimalUncertain,
  };
});

/**
 * Ground elevation (meters, scene-relative) at any (x, z) via inverse-distance
 * weighting over the documented benchmarks. Exact at each benchmark; smooths
 * toward their average further away — an honest "we don't know" fade, not an
 * invented slope.
 */
export function elevationAt(x: number, z: number): number {
  let weightSum = 0;
  let valueSum = 0;
  for (const p of elevationPoints) {
    const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d2 < 0.25) return p.y; // within 0.5 m of a benchmark — return it exactly
    // power-1 IDW (weight = 1/distance): with only 4 sparse points, higher
    // powers (the usual IDW default of 2+) concentrate each point's pull
    // into a tight dome and leave a steep, unrealistic "cliff" in between —
    // checked visually and against the numbers, not just picked blind.
    // Power 1 spreads the real ~13 m of documented relief evenly across the
    // ~50 m between the two extreme benchmarks: a believable graded lane,
    // still exact at every documented point.
    const w = 1 / Math.sqrt(d2);
    weightSum += w;
    valueSum += w * p.y;
  }
  return valueSum / weightSum;
}

/** Elevation at a footprint's centroid — used to seat a whole building/pool. */
export function elevationAtCentroid(footprint: [number, number][]): number {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of footprint) {
    sx += x;
    sz += z;
  }
  return elevationAt(sx / footprint.length, sz / footprint.length);
}

/**
 * Displace every vertex of a geometry (already built flat, extruded from a
 * 2D footprint) onto the terrain, sampling elevationAt() at each vertex's own
 * (x, z). Used for ground/road surfaces that must show a continuous slope,
 * not just sit as a single tilted slab. Safe only for simple extrusions
 * without internal geometry that depends on absolute Y (i.e. not buildings
 * with domes/openings positioned by baseHeight).
 */
export function drapeOntoTerrain(geometry: THREE.BufferGeometry): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, pos.getY(i) + elevationAt(x, z));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/**
 * Wilson's leveled benchmarks as clickable walk elements — small surveyor's
 * stakes planted exactly at their documented elevation, so the terrain they
 * drive is visibly, inspectably real (click = source + exact reading).
 */
export const benchmarkWalkElements: WalkElement[] = elevationPoints.map((p) => {
  const half = 0.18;
  const uncertainNoteHe = p.decimalUncertain
    ? " (הספרה אחרי הנקודה — קריאה מיטבית מסריקה דחוסה; המספר השלם ודאי)"
    : "";
  const uncertainNote = p.decimalUncertain
    ? " (the digit after the decimal is a best-effort read of a compressed scan; the whole-foot value is confident)"
    : "";
  return {
    id: p.id,
    name: p.label,
    nameHe: p.labelHe,
    kind: "benchmark",
    footprint: [
      [p.x - half, p.z - half],
      [p.x + half, p.z - half],
      [p.x + half, p.z + half],
      [p.x - half, p.z + half],
    ],
    // no baseHeight here — the caller applies the same generic terrain
    // offset it applies to every non-ground/road element, keyed off this
    // footprint's own centroid (which IS this point, so it lines up exactly).
    height: 1.1,
    builtYear: 1865,
    evidenceTier: "documented",
    geometryConfidence: "surveyed",
    sources: ["wilson-1865"],
    notesHe: `נקודת גובה מדודה של וילסון: ${p.elevationFeet} רגל מעל פני הים התיכון (≈${(p.elevationFeet * 0.3048).toFixed(1)} מ')${uncertainNoteHe}. נקודות אלה מזינות את תבליט הקרקע של הסצנה.`,
    notes: `Wilson's leveled point: ${p.elevationFeet} ft above the Mediterranean (≈${(p.elevationFeet * 0.3048).toFixed(1)} m)${uncertainNote}. These points drive the scene's ground relief.`,
  };
});

/**
 * Build the ground as a subdivided, terrain-following mesh instead of a flat
 * slab — the visible payoff of Stage C. Segment size ~9 m: enough resolution
 * to read the corridor's real dip, cheap enough for one draw call.
 */
export function buildTerrainGroundGeometry(
  bounds: { x: [number, number]; z: [number, number] },
  segments = 64,
): THREE.BufferGeometry {
  const width = bounds.x[1] - bounds.x[0];
  const depth = bounds.z[1] - bounds.z[0];
  const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
  geo.rotateX(-Math.PI / 2);
  geo.translate((bounds.x[0] + bounds.x[1]) / 2, 0, (bounds.z[0] + bounds.z[1]) / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, elevationAt(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
