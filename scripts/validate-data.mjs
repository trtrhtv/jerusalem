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

console.log(
  `\n${errors === 0 ? "✓" : "✗"} checked ${featureCount} features — ${errors} error(s)`,
);
process.exit(errors === 0 ? 0 : 1);
