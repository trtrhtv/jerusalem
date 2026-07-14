import periodsRaw from "@/data/periods.json";
import sourcesRaw from "@/data/sources.json";
import corridorRaw from "@/data/features/jaffa-gate-corridor.json";
import cityGrowthRaw from "@/data/features/city-growth.json";
import wilsonBuildingsRaw from "@/data/features/wilson-1865-buildings.json";
import viewpointsRaw from "@/data/viewpoints.json";
import type {
  EvidenceTier,
  PeriodDef,
  PeriodKey,
  SourceRecord,
  TimeFeature,
  TimeFeatureCollection,
  Viewpoint,
} from "./types";

export const periods = periodsRaw as PeriodDef[];

export const periodByKey: Record<PeriodKey, PeriodDef> = Object.fromEntries(
  periods.map((p) => [p.key, p]),
) as Record<PeriodKey, PeriodDef>;

const sourceMap = (sourcesRaw as { sources: Record<string, SourceRecord> })
  .sources;

export function getSource(id: string): SourceRecord | undefined {
  return sourceMap[id];
}

export const allSources: SourceRecord[] = Object.values(sourceMap);

const corridorFC = corridorRaw as unknown as TimeFeatureCollection;
const cityGrowthFC = cityGrowthRaw as unknown as TimeFeatureCollection;
const wilsonFC = wilsonBuildingsRaw as unknown as TimeFeatureCollection;

/**
 * All map features: the pilot corridor + the city-growth layer + the blocks
 * digitized from the Wilson 1865 survey (the same file also drives the
 * walking scene's typological generator — one data file feeds both views).
 */
export const corridor: TimeFeatureCollection = {
  type: "FeatureCollection",
  name: "Jerusalem time layers (all feature files)",
  features: [...corridorFC.features, ...cityGrowthFC.features, ...wilsonFC.features],
};

// JSON widens tuple coordinates to number[], so go through unknown.
export const viewpoints: Viewpoint[] = (
  viewpointsRaw as unknown as { viewpoints: Viewpoint[] }
).viewpoints;

/** Viewpoints as GeoJSON for the map's camera layer. */
export function viewpointsGeoJSON() {
  return {
    type: "FeatureCollection" as const,
    features: viewpoints.map((v) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: v.coordinates },
      properties: { id: v.id, year: v.year },
    })),
  };
}

/**
 * Year a feature first becomes visible on the timeline. Prefer the specific
 * builtYear; fall back to the start of its period when only the period is known.
 */
export function appearYear(f: TimeFeature): number {
  const { builtYear, builtPeriod } = f.properties;
  return builtYear ?? periodByKey[builtPeriod].start;
}

/** Year a feature disappears (demolished). Far future when it still stands. */
export function disappearYear(f: TimeFeature): number {
  return f.properties.demolishedYear ?? 99999;
}

/**
 * Returns a copy of the collection with numeric `appearYear` / `disappearYear`
 * baked into each feature's properties so MapLibre filter expressions can use
 * them directly (filters can't read a null builtYear).
 */
export function corridorWithTimeBounds(): TimeFeatureCollection {
  return {
    ...corridor,
    features: corridor.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        appearYear: appearYear(f),
        disappearYear: disappearYear(f),
      },
    })),
  };
}

export const evidenceTierMeta: Record<
  EvidenceTier,
  { label: string; labelHe: string; description: string; descriptionHe: string; color: string }
> = {
  documented: {
    label: "Documented",
    labelHe: "מתועד",
    description: "A direct source exists: photo, map, excavated remain, or scholarly model.",
    descriptionHe: "קיים מקור ישיר: תצלום, מפה, שריד חפור או דגם מחקרי.",
    color: "#2f9e44",
  },
  typological: {
    label: "Typological",
    labelHe: "טיפולוגי",
    description: "The specific building is unknown, but the area's build-type in that period is known.",
    descriptionHe: "המבנה הספציפי אינו ידוע, אך ידוע טיפוס הבנייה של האזור באותה תקופה.",
    color: "#f08c00",
  },
  conjecture: {
    label: "Conjecture",
    labelHe: "השערה",
    description: "Reasonable fill in the absence of evidence, marked explicitly as such.",
    descriptionHe: "מילוי סביר בהיעדר עדות, מסומן במפורש ככזה.",
    color: "#e03131",
  },
};

/** Bounds of the pilot timeline slider. */
export const TIMELINE = { min: 1500, max: 1930, default: 1875 } as const;
