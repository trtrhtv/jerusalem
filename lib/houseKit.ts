import * as THREE from "three";
import {
  archShape,
  centroid,
  edgesWithNormals,
  seededRand,
  type Edge,
  type P2,
} from "./walk3d";
import type { GeneratedWalkElement } from "./wilsonScene";

/**
 * Stage B — the "Jerusalem house kit" and the typological generator.
 *
 * The kit is a set of parametric pieces of the Jerusalem vernacular as read
 * from the period sources (Wilson's survey, the Burgoyne typology, the
 * American Colony photographs): the cross-vaulted room unit, the shallow
 * roof dome, the pointed arch, exterior stone stairs, the courtyard and the
 * roof parapet. The generator composes them onto a SURVEYED footprint:
 *
 *     footprint (digitized GeoJSON) + period + buildingType  →  building
 *
 * Nothing here is random at runtime: every choice draws from a PRNG seeded
 * by the element id, so a block looks the same on every visit — procedural
 * variation, not invented specifics. Footprints are documented/surveyed;
 * everything the kit adds on top is typological and is presented as such.
 */

// ---------- shared materials ----------

const OPENING_MAT = new THREE.MeshBasicMaterial({ color: 0x211b13, side: THREE.DoubleSide });
const WATER_MAT = new THREE.MeshLambertMaterial({ color: 0x51705f });

const DOOR_GEO = new THREE.ShapeGeometry(archShape(1.4, 2.6));
const WIN_GEO = new THREE.ShapeGeometry(archShape(0.85, 1.6));
const PORTAL_GEO = new THREE.ShapeGeometry(archShape(2.6, 3.4));
// dressed-stone frames drawn behind the dark openings (voussoir hint)
const DOOR_FRAME_GEO = new THREE.ShapeGeometry(archShape(1.4 * 1.35, 2.6 * 1.13));
const WIN_FRAME_GEO = new THREE.ShapeGeometry(archShape(0.85 * 1.5, 1.6 * 1.22));
const PORTAL_FRAME_GEO = new THREE.ShapeGeometry(archShape(2.6 * 1.28, 3.4 * 1.12));

export interface KitMaterials {
  /**
   * Stone wall variants (double-sided so dome shells read from below).
   * The generator picks one per building — deterministic tonal variety.
   */
  stoneVariants: THREE.Material[];
  /** Pale plaster/limewash for flat roof caps. */
  roof: THREE.Material;
  /** Cobbled street paving. */
  road: THREE.Material;
  /** Dressed-stone opening frames. */
  frame: THREE.Material;
}

// ---------- small geometry helpers ----------

function polygonArea(pts: P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/**
 * Inset a polygon toward its centroid by ~d meters. Good enough for the
 * roughly-convex surveyed blocks; returns null when the shape is too small
 * or the inset would collapse.
 */
function insetPolygon(pts: P2[], d: number): P2[] | null {
  const [cx, cz] = centroid(pts);
  const out: P2[] = [];
  for (const [x, z] of pts) {
    const dx = x - cx;
    const dz = z - cz;
    const r = Math.hypot(dx, dz);
    if (r < d + 2) return null;
    const f = (r - d) / r;
    out.push([cx + dx * f, cz + dz * f]);
  }
  return out;
}

function shapeFromFootprint(pts: P2[], hole?: P2[] | null): THREE.Shape {
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  if (hole) {
    const h = new THREE.Path();
    hole.forEach(([x, z], i) => (i === 0 ? h.moveTo(x, -z) : h.lineTo(x, -z)));
    h.closePath();
    shape.holes.push(h);
  }
  return shape;
}

function extrude(pts: P2[], depth: number, hole?: P2[] | null): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shapeFromFootprint(pts, hole), {
    depth: Math.max(depth, 0.05),
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** True if a point is inside a polygon (ray casting). */
function pointInPolygon(x: number, z: number, pts: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Distance from a point to the polygon outline (for keeping clutter off edges). */
function distToOutline(x: number, z: number, pts: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

// ---------- kit pieces ----------

/** Roof parapet (מעקה): a continuous low wall along a polygon ring. */
function addParapet(group: THREE.Group, ring: P2[], top: number, mat: THREE.Material): void {
  const H = 0.85;
  const T = 0.25;
  for (const e of edgesWithNormals(ring)) {
    const geo = new THREE.BoxGeometry(e.len, H, T);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((e.ax + e.bx) / 2, top + H / 2, (e.az + e.bz) / 2);
    m.rotation.y = -Math.atan2(e.bz - e.az, e.bx - e.ax);
    m.userData.decor = true;
    group.add(m);
  }
}

/** Shallow roof dome (כיפה) — the signature skyline element. */
function makeDome(r: number, mat: THREE.Material): THREE.Mesh {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    mat,
  );
  dome.userData.decor = true;
  return dome;
}

/**
 * The vaulted room unit (יחידת חדר מקומר): a small rooftop chamber with a
 * dome — the way old-city houses grow, one vaulted cell at a time.
 */
function addRoomUnit(
  group: THREE.Group,
  x: number,
  z: number,
  top: number,
  rand: () => number,
  mat: THREE.Material,
): void {
  const w = 3 + rand() * 1.6;
  const d = 3 + rand() * 1.6;
  const h = 2.6 + rand() * 0.7;
  const room = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  room.position.set(x, top + h / 2, z);
  room.rotation.y = (rand() - 0.5) * 0.12;
  room.castShadow = true;
  room.userData.decor = true;
  group.add(room);
  if (rand() < 0.7) {
    const dome = makeDome(Math.min(w, d) * 0.36, mat);
    dome.position.set(x, top + h, z);
    group.add(dome);
  }
  // one small arched window in the room
  const win = new THREE.Mesh(WIN_GEO, OPENING_MAT);
  const side = rand() < 0.5 ? 1 : -1;
  win.position.set(x + (side * w) / 2 + side * 0.02, top + 0.8, z);
  win.rotation.y = (side * Math.PI) / 2;
  win.userData.decor = true;
  group.add(win);
}

/**
 * Exterior stone stairs (מדרגות חוץ) climbing along a facade to the first
 * floor — a defining feature of the Jerusalem vernacular.
 */
function addExteriorStairs(
  group: THREE.Group,
  e: Edge,
  rand: () => number,
  mat: THREE.Material,
): void {
  const rise = 3.2;
  const run = 4.6;
  const width = 1.15;
  const steps = 9;
  const t0 = 0.2 + rand() * 0.5;
  // stairs climb parallel to the facade, protruding `width` outward
  const dirX = (e.bx - e.ax) / e.len;
  const dirZ = (e.bz - e.az) / e.len;
  const baseX = e.ax + dirX * e.len * t0 + e.nx * (width / 2 + 0.05);
  const baseZ = e.az + dirZ * e.len * t0 + e.nz * (width / 2 + 0.05);
  const stepGeo = new THREE.BoxGeometry(run / steps, rise / steps, width);
  const inst = new THREE.InstancedMesh(stepGeo, mat, steps);
  const tmp = new THREE.Object3D();
  for (let i = 0; i < steps; i++) {
    const along = (i + 0.5) * (run / steps);
    // each step is a solid column from the ground up to its tread height
    tmp.position.set(
      baseX + dirX * along,
      ((i + 1) * (rise / steps)) / 2,
      baseZ + dirZ * along,
    );
    tmp.scale.set(1, i + 1, 1);
    tmp.rotation.y = -Math.atan2(dirZ, dirX);
    tmp.updateMatrix();
    inst.setMatrixAt(i, tmp.matrix);
  }
  inst.castShadow = true;
  inst.userData.decor = true;
  group.add(inst);
}

/** Arched doors/windows (קשתות) with dressed-stone frames along the facades. */
function addKitOpenings(
  group: THREE.Group,
  ring: P2[],
  height: number,
  rand: () => number,
  frameMat: THREE.Material,
): void {
  const floors = Math.max(1, Math.min(3, Math.floor(height / 3.3)));
  for (const e of edgesWithNormals(ring)) {
    if (e.len < 5) continue;
    const count = Math.floor((e.len - 1.5) / 3.9);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5 + (rand() - 0.5) * 0.2) / count;
      const x = e.ax + (e.bx - e.ax) * t;
      const z = e.az + (e.bz - e.az) * t;
      const rotY = Math.atan2(e.nx, e.nz);
      for (let f = 0; f < floors; f++) {
        if (rand() < 0.28) continue; // irregular vernacular rhythm
        const isDoor = f === 0 && rand() < 0.45;
        const y = f * 3.3 + (isDoor ? 0 : 1.15);
        const frame = new THREE.Mesh(isDoor ? DOOR_FRAME_GEO : WIN_FRAME_GEO, frameMat);
        frame.position.set(x + e.nx * 0.045, y, z + e.nz * 0.045);
        frame.rotation.y = rotY;
        frame.userData.decor = true;
        group.add(frame);
        const m = new THREE.Mesh(isDoor ? DOOR_GEO : WIN_GEO, OPENING_MAT);
        m.position.set(x + e.nx * 0.08, y, z + e.nz * 0.08);
        m.rotation.y = rotY;
        m.userData.decor = true;
        group.add(m);
      }
    }
  }
}

// ---------- special cases ----------

/** The Pool of Hezekiah: an open reservoir — stone rim, water surface. */
function buildPool(el: GeneratedWalkElement, mats: KitMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = el.id;
  const stone = mats.stoneVariants[0].clone();
  // rim wall around the surveyed outline
  addParapet(group, el.footprint, 0.35, stone);
  const rimBase = new THREE.Mesh(extrude(el.footprint, 0.35), stone);
  rimBase.receiveShadow = true;
  group.add(rimBase);
  const waterRing = insetPolygon(el.footprint, 0.9) ?? el.footprint;
  const water = new THREE.Mesh(extrude(waterRing, 0.05), WATER_MAT.clone());
  water.position.y = 0.32;
  water.userData.decor = true;
  group.add(water);
  return group;
}

function buildRoad(el: GeneratedWalkElement, mats: KitMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = el.id;
  const mesh = new THREE.Mesh(extrude(el.footprint, el.height || 0.12), mats.road.clone());
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

// ---------- the generator ----------

/**
 * footprint + period + type → building. Deterministic per element id.
 * The footprint is the surveyed truth; massing height and all kit pieces
 * are typological and flagged as such in the element's notes.
 */
export function buildGeneratedElement(
  el: GeneratedWalkElement,
  mats: KitMaterials,
): THREE.Object3D {
  if (el.kind === "pool") return stamp(buildPool(el, mats), el);
  if (el.kind === "road") return stamp(buildRoad(el, mats), el);

  const group = new THREE.Group();
  group.name = el.id;
  const rand = seededRand(el.id);
  const fp = el.footprint;
  const area = polygonArea(fp);

  // per-building material clones: a deterministic stone tone per element, and
  // isolated instances so the evidence-mode opacity never leaks across elements
  const stone = mats.stoneVariants[
    Math.floor(rand() * mats.stoneVariants.length)
  ].clone();
  const roof = mats.roof.clone();
  const frame = mats.frame.clone();

  // courtyard (חצר): large, COMPACT blocks hollow out around a central court.
  // Long/irregular blocks (compactness below threshold) stay solid — a
  // centroid inset of a 140 m lens would carve a canyon, not a courtyard.
  let courtyard: P2[] | null = null;
  if (area > 380 && el.buildingType !== "commercial") {
    let perimeter = 0;
    for (const e of edgesWithNormals(fp)) perimeter += e.len;
    const compactness = (4 * Math.PI * area) / (perimeter * perimeter);
    if (compactness > 0.45) {
      const inset = insetPolygon(fp, 4.2);
      // accept only if the ring truly sits inside, clear of the outer walls
      if (
        inset &&
        inset.every(
          ([x, z]) => pointInPolygon(x, z, fp) && distToOutline(x, z, fp) > 2.8,
        )
      ) {
        courtyard = inset;
      }
    }
  }

  // roof cap gets pale plaster, walls get the building's stone tone
  const geo = extrude(fp, el.height, courtyard);
  const mass = new THREE.Mesh(geo, [roof, stone]);
  mass.castShadow = true;
  mass.receiveShadow = true;
  group.add(mass);

  // soft low-poly edges, matching the hand-built elements' language
  const edgesMesh = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 30),
    new THREE.LineBasicMaterial({ color: 0x5c5342, transparent: true, opacity: 0.35 }),
  );
  edgesMesh.userData.decor = true;
  group.add(edgesMesh);

  // roof parapet along the outer (and courtyard) rims
  addParapet(group, fp, el.height, stone);
  if (courtyard) addParapet(group, courtyard, el.height, stone);

  // rooftop vaulted room units + domes, kept away from the parapet
  const xs = fp.map((p) => p[0]);
  const zs = fp.map((p) => p[1]);
  const roomBudget = Math.max(1, Math.min(4, Math.round(area / 260)));
  let placedRooms = 0;
  for (let attempt = 0; attempt < 30 && placedRooms < roomBudget; attempt++) {
    const x = Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs));
    const z = Math.min(...zs) + rand() * (Math.max(...zs) - Math.min(...zs));
    if (!pointInPolygon(x, z, fp)) continue;
    if (courtyard && pointInPolygon(x, z, courtyard)) continue;
    if (distToOutline(x, z, fp) < 3) continue;
    addRoomUnit(group, x, z, el.height, rand, stone);
    placedRooms++;
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    if (rand() > 0.5) continue;
    const x = Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs));
    const z = Math.min(...zs) + rand() * (Math.max(...zs) - Math.min(...zs));
    if (!pointInPolygon(x, z, fp)) continue;
    if (courtyard && pointInPolygon(x, z, courtyard)) continue;
    // keep domes clearly inboard so they never overhang the facade line
    const r = 1.1 + rand() * 0.6;
    if (distToOutline(x, z, fp) < r + 2.2) continue;
    const dome = makeDome(r, stone);
    dome.position.set(x, el.height, z);
    group.add(dome);
  }

  // arched openings on every outer facade (old-city blocks front lanes all around)
  addKitOpenings(group, fp, el.height, rand, frame);

  // exterior stairs on one or two of the longer facades (residential fabric)
  if (el.buildingType === "mixed") {
    const longEdges = edgesWithNormals(fp).filter((e) => e.len > 12);
    const stairCount = Math.min(longEdges.length, rand() < 0.6 ? 2 : 1);
    for (let s = 0; s < stairCount; s++) {
      const e = longEdges[Math.floor(rand() * longEdges.length)];
      addExteriorStairs(group, e, rand, stone);
    }
  }

  // an occasional grand portal arch — khans and market blocks
  if (el.height >= 7 && rand() < 0.4) {
    const candidates = edgesWithNormals(fp).filter((e) => e.len > 10);
    if (candidates.length) {
      const e = candidates[Math.floor(rand() * candidates.length)];
      const portalFrame = new THREE.Mesh(PORTAL_FRAME_GEO, frame);
      portalFrame.position.set(
        (e.ax + e.bx) / 2 + e.nx * 0.05,
        0,
        (e.az + e.bz) / 2 + e.nz * 0.05,
      );
      portalFrame.rotation.y = Math.atan2(e.nx, e.nz);
      portalFrame.userData.decor = true;
      group.add(portalFrame);
      const portal = new THREE.Mesh(PORTAL_GEO, OPENING_MAT);
      portal.position.set(
        (e.ax + e.bx) / 2 + e.nx * 0.09,
        0,
        (e.az + e.bz) / 2 + e.nz * 0.09,
      );
      portal.rotation.y = Math.atan2(e.nx, e.nz);
      portal.userData.decor = true;
      group.add(portal);
    }
  }

  return stamp(group, el);
}

/** Stamp evidence tier + picking id on everything (same as hand-built path). */
function stamp(group: THREE.Group, el: GeneratedWalkElement): THREE.Group {
  group.traverse((o) => {
    o.userData.tier = el.evidenceTier;
    if (!o.userData.elementId) o.userData.elementId = el.id;
  });
  return group;
}
