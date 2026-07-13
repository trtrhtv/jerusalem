import periodsRaw from "@/data/periods.json";
import sourcesRaw from "@/data/sources.json";
import corridorRaw from "@/data/features/jaffa-gate-corridor.json";
import type {
  EvidenceTier,
  PeriodDef,
  PeriodKey,
  SourceRecord,
  TimeFeature,
  TimeFeatureCollection,
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

export const corridor = corridorRaw as unknown as TimeFeatureCollection;

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
