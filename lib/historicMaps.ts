import historicRaw from "@/data/historic-maps.json";

/** A georeferenced historical map that can be draped under the timeline map. */
export interface HistoricMapDef {
  id: string;
  title: string;
  titleHe: string;
  year: number;
  sourceId: string;
  /** Allmaps Georeference Annotation URL. Required when status = "ready". */
  annotationUrl: string | null;
  status: "ready" | "awaiting-georeference";
  defaultOpacity: number;
  notes?: string;
  notesHe?: string;
}

export const historicMaps: HistoricMapDef[] = (
  historicRaw as unknown as { maps: HistoricMapDef[] }
).maps;
