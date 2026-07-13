import type { StyleSpecification } from "maplibre-gl";

/**
 * Minimal self-contained raster base map using OpenStreetMap tiles.
 * OSM tiles are ODbL-licensed; attribution is required and rendered on the map.
 * No API key and no external style/glyph server, so the app has no vendor lock-in.
 * For heavier production use, swap in a proper vector tile provider.
 */
export const baseStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors (ODbL)",
      maxzoom: 19,
    },
  },
  layers: [
    {
      // Always-present neutral canvas. Guarantees the map has a base layer even
      // if the external raster tiles are slow or blocked, so the historical
      // layer is always legible.
      id: "background",
      type: "background",
      paint: { "background-color": "#efe9df" },
    },
    {
      id: "osm",
      type: "raster",
      source: "osm",
      // Fade the modern base so the historical layer reads on top of it.
      paint: { "raster-saturation": -0.6, "raster-opacity": 0.7 },
    },
  ],
};

/** Jaffa Gate — the anchor of the pilot corridor. */
export const PILOT_CENTER: [number, number] = [35.2258, 31.7788];
export const PILOT_ZOOM = 15.2;
