#!/usr/bin/env node
// Pixel→world transform for the Wilson 1865 survey scan.
//
// Fits an affine transform from the ground-control points in
// public/annotations/wilson-1865.json (full-resolution IIIF pixel coords →
// WGS84 lon/lat, RMS ~26 m — same accuracy as the live map overlay) and
// exposes helpers used by the digitization pipeline (digitize-wilson.mjs).
//
// The local scan in data/scans/ is exactly half the IIIF resolution
// (3532 × 5109 vs 7064 × 10219), so coordinates traced on it are doubled
// before applying the transform. Run directly for a self-test:
//   node scripts/wilson-transform.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const annotation = JSON.parse(
  readFileSync(resolve(root, "public/annotations/wilson-1865.json"), "utf8"),
);

/** Scale between the hosted scan (data/scans/…-3532px.jpg) and IIIF full res. */
export const LOCAL_SCAN_SCALE =
  annotation.target.source.width / 3532; // = 2

const gcps = annotation.body.features.map((f) => ({
  px: f.properties.resourceCoords, // [x, y] full-res pixels
  ll: f.geometry.coordinates, // [lon, lat]
}));

/**
 * Least-squares affine fit  [lon, lat] = A·[x, y, 1]  over the GCPs.
 * Solved via the 3×3 normal equations (n=5 points, well-conditioned).
 */
function fitAffine(points) {
  // normal matrix N = Gᵀ·G, right-hand sides Gᵀ·lon and Gᵀ·lat
  const N = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const bLon = [0, 0, 0];
  const bLat = [0, 0, 0];
  for (const { px: [x, y], ll: [lon, lat] } of points) {
    const g = [x, y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) N[i][j] += g[i] * g[j];
      bLon[i] += g[i] * lon;
      bLat[i] += g[i] * lat;
    }
  }
  const solve = (A, b) => {
    // Gaussian elimination with partial pivoting on a 3×3 system
    const m = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      [m[c], m[p]] = [m[p], m[c]];
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = m[r][c] / m[c][c];
        for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
      }
    }
    return m.map((row, i) => row[3] / m[i][i]);
  };
  return { lon: solve(N, bLon), lat: solve(N, bLat) };
}

const affine = fitAffine(gcps);

/** Full-resolution scan pixel → [lon, lat]. */
export function fullResPxToLonLat(x, y) {
  return [
    affine.lon[0] * x + affine.lon[1] * y + affine.lon[2],
    affine.lat[0] * x + affine.lat[1] * y + affine.lat[2],
  ];
}

/** Local (3532px) scan pixel → [lon, lat], rounded to 6 decimals (~0.1 m). */
export function localPxToLonLat(x, y) {
  const [lon, lat] = fullResPxToLonLat(x * LOCAL_SCAN_SCALE, y * LOCAL_SCAN_SCALE);
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
}

// ---------------------------------------------------------------------------
// Tie-point correction for the Jaffa Gate corridor.
//
// The global affine fit carries RMS ~26 m — fine for a map overlay, too loose
// for digitizing streets that must line up with their modern selves. The
// affine's scale/rotation are well-determined; most of the local error near
// the gate is a translation. So for corridor digitization we add the fit's
// residual at the Jaffa Gate GCP (the first control point) as a constant
// shift, which pins that GCP exactly and keeps nearby geometry consistent
// with it. Valid only near the gate (~500 m); documented in the output file.
// ---------------------------------------------------------------------------

const gateGcp = gcps[0];
const gatePred = fullResPxToLonLat(gateGcp.px[0], gateGcp.px[1]);
const TIE_SHIFT = [gateGcp.ll[0] - gatePred[0], gateGcp.ll[1] - gatePred[1]];

/**
 * Local scan pixel → [lon, lat] with the Jaffa-Gate tie-point correction.
 * Use for geometry digitized in the gate corridor.
 */
export function localPxToLonLatCorrected(x, y) {
  const [lon, lat] = fullResPxToLonLat(x * LOCAL_SCAN_SCALE, y * LOCAL_SCAN_SCALE);
  return [
    Number((lon + TIE_SHIFT[0]).toFixed(6)),
    Number((lat + TIE_SHIFT[1]).toFixed(6)),
  ];
}

/** RMS of the fit over the GCPs, in meters — the honesty number. */
export function fitRmsMeters() {
  const latMean =
    gcps.reduce((s, g) => s + g.ll[1], 0) / gcps.length;
  const mPerDegLon = 111320 * Math.cos((latMean * Math.PI) / 180);
  const mPerDegLat = 110574;
  let sum = 0;
  for (const { px: [x, y], ll: [lon, lat] } of gcps) {
    const [plon, plat] = fullResPxToLonLat(x, y);
    sum += ((plon - lon) * mPerDegLon) ** 2 + ((plat - lat) * mPerDegLat) ** 2;
  }
  return Math.sqrt(sum / gcps.length);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Wilson 1865 affine fit over ${gcps.length} GCPs`);
  console.log(`RMS: ${fitRmsMeters().toFixed(1)} m`);
  for (const { px, ll } of gcps) {
    const p = fullResPxToLonLat(px[0], px[1]);
    console.log(
      `  px(${px}) → [${p[0].toFixed(6)}, ${p[1].toFixed(6)}]  (gcp: [${ll}])`,
    );
  }
}
