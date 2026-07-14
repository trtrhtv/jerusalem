import sceneRaw from "@/data/walk/jaffa-gate-scene.json";
import type { EvidenceTier } from "./types";

/**
 * One massing element in the walking scene. Local coordinates in meters,
 * origin at the plaza outside Jaffa Gate; +x = east, +z = south.
 */
export interface WalkElement {
  id: string;
  name: string;
  nameHe: string;
  kind:
    | "ground"
    | "wall"
    | "gate"
    | "tower"
    | "citadel"
    | "minaret"
    | "building"
    | "road"
    | "moat"
    | "pool"
    | "benchmark";
  /** Polygon footprint, [x, z] pairs in meters. */
  footprint: [number, number][];
  /** Extrusion height in meters (0 → thin slab). */
  height: number;
  /** Y offset the extrusion starts from (e.g. clock tower sits on the gate). */
  baseHeight?: number;
  builtYear: number | null;
  builtYearApprox?: boolean;
  /** For period-typological elements without a specific year. */
  builtPeriodStart?: number;
  demolishedYear?: number | null;
  evidenceTier: EvidenceTier;
  sources: string[];
  notes?: string;
  notesHe?: string;
  /** Present on elements generated from digitized survey data. */
  geometryConfidence?: "surveyed" | "approximate" | "schematic";
}

export interface WalkSceneData {
  anchor: { lon: number; lat: number };
  yearPresets: number[];
  defaultYear: number;
  elements: WalkElement[];
}

const raw = sceneRaw as unknown as WalkSceneData & { $comment?: string };

export const walkScene: WalkSceneData = {
  anchor: raw.anchor,
  yearPresets: raw.yearPresets,
  defaultYear: raw.defaultYear,
  elements: raw.elements,
};

/** Year an element enters the scene (specific year > period start > always). */
export function elementAppearYear(e: WalkElement): number {
  return e.builtYear ?? e.builtPeriodStart ?? -Infinity;
}

export function elementExistsAt(e: WalkElement, year: number): boolean {
  const gone = e.demolishedYear ?? Infinity;
  return elementAppearYear(e) <= year && year < gone;
}
