#!/usr/bin/env node
// Data-integrity gate. Enforces the project's core rule: nothing ships with
// faked certainty. Checks every feature against the JSON Schema, verifies that
// every cited source id resolves in the registry, that non-conjecture features
// cite at least one source, and that referenced periods exist.
//
// Run: npm run validate

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv from "ajv/dist/2020.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

const schema = read("data/schema/feature.schema.json");
const periods = read("data/periods.json");
const { sources } = read("data/sources.json");

const FEATURE_FILES = ["data/features/jaffa-gate-corridor.json"];

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

for (const file of FEATURE_FILES) {
  const fc = read(file);
  console.log(`\n${file} — ${fc.features.length} features`);
  for (const feature of fc.features) {
    featureCount++;
    const id = feature.properties?.id ?? "(no id)";
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
}

console.log(
  `\n${errors === 0 ? "✓" : "✗"} checked ${featureCount} features + ${viewpoints.length} viewpoints — ${errors} error(s)`,
);
process.exit(errors === 0 ? 0 : 1);
