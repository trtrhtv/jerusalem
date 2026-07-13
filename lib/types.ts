// Core domain types for "Jerusalem in Layers of Time".
// Every visual element in this project carries an explicit evidence tier and a
// list of sources. See README.md ("מדרג הראיות" / "Evidence tiers") for the
// governing principle: we never fake certainty.

/**
 * How well grounded the *existence, period and type* of a feature are.
 * This is the headline honesty signal shown to the user at all times.
 */
export type EvidenceTier =
  | "documented" // מתועד – a direct source (photo, map, excavated remain, scholarly model)
  | "typological" // טיפולוגי – the specific building is unknown, but the area's build-type in that period is known
  | "conjecture"; // השערה – reasonable fill in the absence of evidence, marked as such

/**
 * How trustworthy the *drawn geometry* is. Kept separate from evidenceTier on
 * purpose: a founding date can be firmly documented while the polygon we draw
 * for it is still only approximate. Do not conflate the two.
 */
export type GeometryConfidence =
  | "surveyed" // traced from a georeferenced historical survey / OSM footprint
  | "approximate" // real-world location, coordinates estimated (not precisely traced)
  | "schematic"; // indicative shape only, pending digitization

export type PeriodKey =
  | "second-temple"
  | "byzantine"
  | "crusader"
  | "ayyubid"
  | "mamluk"
  | "ottoman-early"
  | "ottoman-late"
  | "british-mandate"
  | "modern";

export type BuildingType =
  | "gate"
  | "fortification"
  | "road"
  | "monument"
  | "residential-quarter"
  | "religious-compound"
  | "institution"
  | "commercial"
  | "mixed";

/** A source in the shared source registry (data/sources.json). */
export interface SourceRecord {
  id: string;
  title: string;
  titleHe?: string;
  creator?: string;
  year: string; // free text: "1865", "1842–1849", "1917/18"
  type:
    | "photograph"
    | "aerial-photograph"
    | "map"
    | "lithograph"
    | "physical-model"
    | "survey"
    | "excavation"
    | "scholarly-model"
    | "documentary-record";
  /**
   * Rights status. We only ship as project assets things that are public
   * domain or ours. Modern reconstructions are reference-only.
   */
  rights: "public-domain" | "reference-only" | "open-license" | "our-own";
  rightsNote?: string;
  holdingInstitution?: string;
  url?: string;
}

/** GeoJSON-compatible feature properties. `id` + these fields ARE the schema. */
export interface FeatureProperties {
  id: string;
  name: string;
  nameHe?: string;
  builtPeriod: PeriodKey;
  /** Specific founding/construction year if known; null when only the period is known. */
  builtYear: number | null;
  builtYearApprox?: boolean;
  /** Year the feature ceased to exist (demolished/destroyed); null if it still stands. */
  demolishedYear?: number | null;
  buildingType: BuildingType;
  evidenceTier: EvidenceTier;
  geometryConfidence: GeometryConfidence;
  /** IDs referencing data/sources.json. */
  sources: string[];
  notes?: string;
  notesHe?: string;
}

export type FeatureGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Polygon"; coordinates: [number, number][][] };

export interface TimeFeature {
  type: "Feature";
  geometry: FeatureGeometry;
  properties: FeatureProperties;
}

export interface TimeFeatureCollection {
  type: "FeatureCollection";
  name: string;
  metadata?: Record<string, unknown>;
  features: TimeFeature[];
}

export interface PeriodDef {
  key: PeriodKey;
  label: string;
  labelHe: string;
  /** Inclusive start year (negative = BCE), for ordering only. */
  start: number;
  end: number | null; // null = ongoing
  color: string; // hex, used on the map
}
