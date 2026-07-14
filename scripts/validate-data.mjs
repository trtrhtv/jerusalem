#!/usr/bin/env node
// Data-integrity gate. Enforces the project's core rule: nothing ships with
// faked certainty. Checks every feature against the JSON Schema, verifies that
// every cited source id resolves in the registry, that non-conjecture features
// cite at least one source, and that referenced periods exist.
//
// Run: npm run validate

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv from "ajv/dist/2020.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

const schema = read("data/schema/feature.schema.json");
const periods = read("data/periods.json");
const { sources } = read("data/sources.json");

const FEATURE_FILES = [
  "data/features/jaffa-gate-corridor.json",
  "data/features/city-growth.json",
  "data/features/wilson-1865-buildings.json",
];

const periodKeys = new Set(periods.map((p) => p.key));
const sourceIds = new Set(Object.keys(sources));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

let errors = 0;
let featureCount = 0;
const fail = (msg) => {
  errors++;
  console.error(`  ✗ ${msg}`);
};
const seenIds = new Set();

for (const file of FEATURE_FILES) {
  const fc = read(file);
  console.log(`\n${file} — ${fc.features.length} features`);
  for (const feature of fc.features) {
    featureCount++;
    const id = feature.properties?.id ?? "(no id)";
    if (seenIds.has(id)) fail(`[${id}] duplicate feature id across files`);
    seenIds.add(id);
    if (!validate(feature)) {
      for (const e of validate.errors ?? []) {
        fail(`[${id}] schema ${e.instancePath} ${e.message}`);
      }
    }
    const props = feature.properties ?? {};
    if (!periodKeys.has(props.builtPeriod)) {
      fail(`[${id}] unknown builtPeriod "${props.builtPeriod}"`);
    }
    for (const sid of props.sources ?? []) {
      if (!sourceIds.has(sid)) fail(`[${id}] unknown source "${sid}"`);
    }
    if (
      (props.evidenceTier === "documented" || props.evidenceTier === "typological") &&
      (props.sources ?? []).length === 0
    ) {
      fail(`[${id}] evidenceTier="${props.evidenceTier}" but no sources cited`);
    }
    if (props.demolishedYear != null && props.builtYear != null &&
        props.demolishedYear < props.builtYear) {
      fail(`[${id}] demolishedYear < builtYear`);
    }
  }
}

// --- viewpoints (camera anchors) ---
const { viewpoints } = read("data/viewpoints.json");
console.log(`\ndata/viewpoints.json — ${viewpoints.length} viewpoints`);
for (const v of viewpoints) {
  const id = v.id ?? "(no id)";
  for (const field of ["id", "title", "year", "yearDisplay", "coordinates", "positionConfidence", "sourceId", "itemUrl"]) {
    if (v[field] == null) fail(`[${id}] viewpoint missing "${field}"`);
  }
  if (v.sourceId && !sourceIds.has(v.sourceId)) {
    fail(`[${id}] unknown sourceId "${v.sourceId}"`);
  }
  if (typeof v.year !== "number" || v.year < 1826 || v.year > 2030) {
    // 1826 = earliest surviving photograph anywhere; nothing visual can predate
    // drawing/lithography, and Roberts (1839) is our earliest item.
    if (v.year < 1500) fail(`[${id}] implausible viewpoint year ${v.year}`);
  }
  if (v.itemUrl && !/^https:\/\/(www\.)?loc\.gov\//.test(v.itemUrl) && !/^https:\/\/(www\.)?nli\.org\.il\//.test(v.itemUrl)) {
    fail(`[${id}] itemUrl not at a recognized holding institution: ${v.itemUrl}`);
  }
  if (!["documented", "approximate"].includes(v.positionConfidence)) {
    fail(`[${id}] bad positionConfidence "${v.positionConfidence}"`);
  }
  if (v.localImage) {
    if (!v.localImage.startsWith("/photos/")) {
      fail(`[${id}] localImage must live under /photos/ (got "${v.localImage}")`);
    } else if (!existsSync(resolve(root, "public", v.localImage.slice(1)))) {
      fail(`[${id}] localImage "${v.localImage}" declared but file missing in public/`);
    }
  }
}
// hosted photos must be credited
const declaredImages = viewpoints.filter((v) => v.localImage);
if (declaredImages.length > 0 && !existsSync(resolve(root, "public/photos/ATTRIBUTION.md"))) {
  fail("public/photos/ATTRIBUTION.md missing while hosted photos are declared");
}

// --- walking scene (3D massing pilot) ---
const walk = read("data/walk/jaffa-gate-scene.json");
console.log(`\ndata/walk/jaffa-gate-scene.json — ${walk.elements.length} elements`);
for (const el of walk.elements) {
  const id = el.id ?? "(no id)";
  for (const field of ["id", "name", "nameHe", "kind", "footprint", "height", "evidenceTier", "sources"]) {
    if (el[field] == null) fail(`[${id}] walk element missing "${field}"`);
  }
  if (!["documented", "typological", "conjecture"].includes(el.evidenceTier)) {
    fail(`[${id}] bad evidenceTier "${el.evidenceTier}"`);
  }
  if (
    (el.evidenceTier === "documented" || el.evidenceTier === "typological") &&
    (el.sources ?? []).length === 0
  ) {
    fail(`[${id}] evidenceTier="${el.evidenceTier}" but no sources cited`);
  }
  for (const sid of el.sources ?? []) {
    if (!sourceIds.has(sid)) fail(`[${id}] unknown source "${sid}"`);
  }
  if (!Array.isArray(el.footprint) || el.footprint.length < 3) {
    fail(`[${id}] footprint needs >= 3 points`);
  }
  if (el.demolishedYear != null && el.builtYear != null && el.demolishedYear < el.builtYear) {
    fail(`[${id}] demolishedYear < builtYear`);
  }
}

// --- Wilson 1865 elevation benchmarks (Stage C topography source) ---
const elevations = read("data/features/wilson-1865-elevations.json");
console.log(`\ndata/features/wilson-1865-elevations.json — ${elevations.features.length} benchmarks`);
for (const f of elevations.features) {
  const p = f.properties ?? {};
  const id = p.id ?? "(no id)";
  for (const field of ["id", "label", "labelHe", "elevationFeet", "elevationMeters", "sourceId"]) {
    if (p[field] == null) fail(`[${id}] elevation benchmark missing "${field}"`);
  }
  if (p.sourceId && !sourceIds.has(p.sourceId)) fail(`[${id}] unknown sourceId "${p.sourceId}"`);
  if (typeof p.elevationFeet === "number" && (p.elevationFeet < 2000 || p.elevationFeet > 3000)) {
    fail(`[${id}] implausible elevationFeet ${p.elevationFeet} for Jerusalem's Old City (expected ~2400-2600 ft)`);
  }
  if (f.geometry?.type !== "Point" || !Array.isArray(f.geometry.coordinates)) {
    fail(`[${id}] elevation benchmark needs Point geometry`);
  }
}

// --- historic map overlays ---
const { maps: historicMaps } = read("data/historic-maps.json");
console.log(`\ndata/historic-maps.json — ${historicMaps.length} maps`);
for (const m of historicMaps) {
  const id = m.id ?? "(no id)";
  for (const field of ["id", "title", "titleHe", "year", "sourceId", "status", "defaultOpacity"]) {
    if (m[field] == null) fail(`[${id}] historic map missing "${field}"`);
  }
  if (m.sourceId && !sourceIds.has(m.sourceId)) fail(`[${id}] unknown sourceId "${m.sourceId}"`);
  if (!["ready", "awaiting-georeference"].includes(m.status)) {
    fail(`[${id}] bad status "${m.status}"`);
  }
  if (m.status === "ready") {
    const u = m.annotationUrl ?? "";
    if (/^https:\/\//.test(u)) {
      // remote annotation — fine
    } else if (u.startsWith("/")) {
      // self-hosted annotation must actually exist under public/
      if (!existsSync(resolve(root, "public", u.slice(1)))) {
        fail(`[${id}] self-hosted annotation "${u}" missing in public/`);
      }
    } else {
      fail(`[${id}] status=ready requires an https or site-relative annotationUrl`);
    }
  }
  if (m.status !== "ready" && m.annotationUrl) {
    fail(`[${id}] has annotationUrl but status is not "ready" — set status accordingly`);
  }
}

console.log(
  `\n${errors === 0 ? "✓" : "✗"} checked ${featureCount} features + ${viewpoints.length} viewpoints + ${walk.elements.length} walk elements + ${historicMaps.length} historic maps + ${elevations.features.length} elevation benchmarks — ${errors} error(s)`,
);
process.exit(errors === 0 ? 0 : 1);
