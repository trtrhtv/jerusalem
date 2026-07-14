import * as THREE from "three";
import type { EvidenceTier } from "./types";
import type { WalkElement } from "./walkScene";

/**
 * Stage-A visual kit for the walking scene: procedural Jerusalem-stone
 * materials, arched openings, domes, crenellations, sky, trees and the
 * evidence-mode toggle. Everything here is generated in code — no external
 * assets, nothing copied from modern reconstructions. Deterministic seeds
 * (from element ids) keep variation stable between visits.
 */

// ---------- deterministic pseudo-random ----------

export function seededRand(seedStr: string): () => number {
  let seed = 0;
  for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  if (seed <= 0) seed += 2147483646;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// ---------- procedural textures ----------

function shade(hex: number, amount: number): string {
  const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((hex >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (hex & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

/** Ashlar stone courses with tonal variation and thin mortar lines. */
export function makeStoneTexture(base: number, seedStr = "stone"): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const rand = seededRand(seedStr);
  g.fillStyle = shade(base, -30); // mortar
  g.fillRect(0, 0, size, size);
  const rowH = 32;
  for (let y = 0, row = 0; y < size; y += rowH, row++) {
    let x = -Math.floor(rand() * 40) + (row % 2 ? 20 : 0);
    while (x < size) {
      const w = 44 + Math.floor(rand() * 42);
      g.fillStyle = shade(base, Math.floor((rand() - 0.5) * 26));
      g.fillRect(x + 1, y + 1, w - 2, rowH - 2);
      // subtle weathering blotch
      if (rand() < 0.35) {
        g.fillStyle = shade(base, -12);
        const bx = x + 4 + rand() * (w - 12);
        g.fillRect(bx, y + 4 + rand() * (rowH - 12), 6 + rand() * 10, 3 + rand() * 6);
      }
      x += w;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // one texture tile ≈ 4m of wall, so a course reads ~0.5m
  tex.repeat.set(0.25, 0.25);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Flat roof surface — pale plaster/limewash with subtle weathering. */
export function makeRoofTexture(seedStr = "roof"): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const rand = seededRand(seedStr);
  const base = 0xcabe9f;
  g.fillStyle = shade(base, 0);
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = shade(base, Math.floor((rand() - 0.5) * 20));
    g.fillRect(rand() * size, rand() * size, 2 + rand() * 4, 2 + rand() * 4);
  }
  // faint weathering patches
  g.globalAlpha = 0.18;
  for (let i = 0; i < 30; i++) {
    g.fillStyle = shade(base, -14);
    g.beginPath();
    g.arc(rand() * size, rand() * size, 8 + rand() * 20, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.18, 0.18); // ~5.5 m per tile
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Worn street paving: irregular cobble courses in grey-umber. */
export function makeRoadTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const rand = seededRand("road");
  const base = 0x93897a;
  g.fillStyle = shade(base, -28); // joints
  g.fillRect(0, 0, size, size);
  const rowH = 22;
  for (let y = 0, row = 0; y < size; y += rowH, row++) {
    let x = -Math.floor(rand() * 24) + (row % 2 ? 12 : 0);
    while (x < size) {
      const w = 20 + Math.floor(rand() * 16);
      if (rand() > 0.06) {
        g.fillStyle = shade(base, Math.floor((rand() - 0.5) * 30));
        g.beginPath();
        g.roundRect(x + 1.5, y + 1.5, w - 3, rowH - 3, 5);
        g.fill();
      }
      x += w;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.22, 0.22); // a cobble reads ~0.4 m
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dusty ground with faint tracks and stains. */
export function makeGroundTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const rand = seededRand("ground");
  g.fillStyle = "#b6a888";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const t = Math.floor((rand() - 0.5) * 26);
    g.fillStyle = shade(0xb6a888, t);
    const r = 1 + rand() * 5;
    g.beginPath();
    g.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18); // over the 440m ground plane
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- shared geometries/materials ----------

const OPENING_MAT = new THREE.MeshBasicMaterial({ color: 0x211b13, side: THREE.DoubleSide });
const CLOCK_MAT = new THREE.MeshBasicMaterial({ color: 0xf4efe2, side: THREE.DoubleSide });

/** Pointed/round arch shape used for doors and windows. */
export function archShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return s;
}

const DOOR_GEO = new THREE.ShapeGeometry(archShape(1.5, 2.7));
const WIN_GEO = new THREE.ShapeGeometry(archShape(0.9, 1.7));
const MERLON_GEO = new THREE.BoxGeometry(0.7, 0.7, 0.35);

// ---------- footprint helpers ----------

export type P2 = [number, number];

export function centroid(pts: P2[]): P2 {
  let sx = 0, sz = 0;
  for (const [x, z] of pts) { sx += x; sz += z; }
  return [sx / pts.length, sz / pts.length];
}

export interface Edge { ax: number; az: number; bx: number; bz: number; len: number; nx: number; nz: number }

/** Polygon edges with outward normals (decided against the centroid). */
export function edgesWithNormals(pts: P2[]): Edge[] {
  const [cx, cz] = centroid(pts);
  const out: Edge[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    let nx = dz / len, nz = -dx / len; // one perpendicular
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    // flip if it points toward the centroid
    if ((mx + nx - cx) ** 2 + (mz + nz - cz) ** 2 < (mx - cx) ** 2 + (mz - cz) ** 2) {
      nx = -nx; nz = -nz;
    }
    out.push({ ax, az, bx, bz, len, nx, nz });
  }
  return out;
}

// ---------- element decoration ----------

const TIER_OPACITY: Record<EvidenceTier, number> = {
  documented: 1,
  typological: 0.8,
  conjecture: 0.4,
};

export function tierOpacity(tier: EvidenceTier): number {
  return TIER_OPACITY[tier];
}

/**
 * Arched doors/windows along each facade long enough to host them.
 * Rows per floor (~3.4m), doors only at street level.
 */
export function addOpenings(group: THREE.Group, el: WalkElement): void {
  if (!["building", "gate", "citadel"].includes(el.kind)) return;
  const rand = seededRand(el.id);
  const floors = Math.max(1, Math.min(3, Math.floor(el.height / 3.4)));
  const base = el.baseHeight ?? 0;
  for (const e of edgesWithNormals(el.footprint)) {
    if (e.len < 5) continue;
    const step = el.kind === "citadel" ? 9 : 4.2;
    const count = Math.floor((e.len - 2) / step);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5 + (rand() - 0.5) * 0.2) / count;
      const x = e.ax + (e.bx - e.ax) * t + e.nx * 0.07;
      const z = e.az + (e.bz - e.az) * t + e.nz * 0.07;
      const rotY = Math.atan2(e.nx, e.nz);
      for (let f = 0; f < floors; f++) {
        // citadel: sparse high windows only; buildings: door floor + window floors
        if (el.kind === "citadel" && f === 0) continue;
        if (rand() < 0.25) continue; // irregularity — not every bay has an opening
        const isDoor = f === 0 && el.kind === "building";
        const m = new THREE.Mesh(isDoor ? DOOR_GEO : WIN_GEO, OPENING_MAT);
        m.position.set(x, base + f * 3.4 + (isDoor ? 0 : 1.2), z);
        m.rotation.y = rotY;
        m.userData.decor = true;
        group.add(m);
      }
    }
  }
}

/** Battlement merlons along the top perimeter of walls/gates/citadel. */
export function addCrenellations(group: THREE.Group, el: WalkElement, mat: THREE.Material): void {
  if (!["wall", "gate", "citadel", "tower"].includes(el.kind)) return;
  const top = (el.baseHeight ?? 0) + el.height + 0.35;
  const positions: THREE.Matrix4[] = [];
  const tmp = new THREE.Object3D();
  for (const e of edgesWithNormals(el.footprint)) {
    const count = Math.floor(e.len / 1.4);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      tmp.position.set(e.ax + (e.bx - e.ax) * t, top, e.az + (e.bz - e.az) * t);
      tmp.rotation.y = Math.atan2(e.nx, e.nz);
      tmp.updateMatrix();
      positions.push(tmp.matrix.clone());
    }
  }
  if (!positions.length) return;
  const inst = new THREE.InstancedMesh(MERLON_GEO, mat, positions.length);
  positions.forEach((m, i) => inst.setMatrixAt(i, m));
  inst.userData.decor = true;
  group.add(inst);
}

/** Shallow roof domes — the signature Jerusalem roofscape. */
export function addRoofDomes(group: THREE.Group, el: WalkElement, mat: THREE.Material): void {
  if (el.kind !== "building" || el.height < 5) return;
  const rand = seededRand(el.id + "-domes");
  const [cx, cz] = centroid(el.footprint);
  const xs = el.footprint.map((p) => p[0]);
  const zs = el.footprint.map((p) => p[1]);
  const top = (el.baseHeight ?? 0) + el.height;
  const stepX = 7, stepZ = 7;
  for (let x = Math.min(...xs) + 3.5; x < Math.max(...xs) - 2; x += stepX) {
    for (let z = Math.min(...zs) + 3.5; z < Math.max(...zs) - 2; z += stepZ) {
      if (rand() < 0.25) continue;
      const r = 1.7 + rand() * 0.9;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        mat,
      );
      const jx = x + (rand() - 0.5) * 2, jz = z + (rand() - 0.5) * 2;
      // keep domes roughly inside irregular footprints
      if (Math.hypot(jx - cx, jz - cz) > Math.max(Math.max(...xs) - cx, Math.max(...zs) - cz)) continue;
      dome.position.set(jx, top, jz);
      dome.userData.decor = true;
      group.add(dome);
    }
  }
}

/** Clock faces on all four sides of the Ottoman clock tower. */
export function addClockFaces(group: THREE.Group, el: WalkElement): void {
  if (el.id !== "walk-clock-tower") return;
  const [cx, cz] = centroid(el.footprint);
  const xs = el.footprint.map((p) => p[0]);
  const zs = el.footprint.map((p) => p[1]);
  const y = (el.baseHeight ?? 0) + el.height * 0.72;
  const faces: [number, number, number][] = [
    [Math.min(...xs) - 0.06, cz, -Math.PI / 2],
    [Math.max(...xs) + 0.06, cz, Math.PI / 2],
  ];
  for (const [x, z, ry] of faces) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), CLOCK_MAT);
    face.position.set(x, y, z);
    face.rotation.y = ry;
    face.userData.decor = true;
    group.add(face);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 20), OPENING_MAT);
    ring.position.set(x + (ry > 0 ? 0.01 : -0.01), y, z);
    ring.rotation.y = ry;
    ring.userData.decor = true;
    group.add(ring);
  }
  const zFaces: [number, number, number][] = [
    [cx, Math.min(...zs) - 0.06, Math.PI],
    [cx, Math.max(...zs) + 0.06, 0],
  ];
  for (const [x, z, ry] of zFaces) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), CLOCK_MAT);
    face.position.set(x, y, z);
    face.rotation.y = ry;
    face.userData.decor = true;
    group.add(face);
  }
}

// ---------- ambience: sky & trees ----------

/** Gradient sky dome (vertex colors, back side). */
export function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(480, 24, 12);
  const colTop = new THREE.Color(0x9db8cc);
  const colHorizon = new THREE.Color(0xe8ddc4);
  const colors: number[] = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 480; // -1..1
    const c = colHorizon.clone().lerp(colTop, Math.max(0, y) ** 0.6);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = "sky";
  return sky;
}

/**
 * Typological ambience vegetation: olives and cypresses at plausible spots
 * (valley slopes, road edges). Not evidence-bearing — placement is scenery.
 */
export function buildTrees(): THREE.Group {
  const g = new THREE.Group();
  g.name = "ambience-trees";
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6e5a3f });
  const oliveMat = new THREE.MeshLambertMaterial({ color: 0x7d8a5a });
  const cypressMat = new THREE.MeshLambertMaterial({ color: 0x44583c });
  const rand = seededRand("trees");
  // [x, z, kind] — olive groves in the moat/valley side, cypresses near buildings
  const spots: [number, number, "o" | "c"][] = [
    [-30, 40, "o"], [-42, 55, "o"], [-35, 72, "o"], [-50, 85, "o"], [-28, 95, "o"],
    [-60, 30, "o"], [-75, 45, "o"], [-90, 20, "o"], [-55, -50, "o"], [-70, -62, "o"],
    [-110, -45, "o"], [-130, -70, "o"], [30, -60, "o"], [55, -80, "o"], [90, -40, "o"],
    [-20, -28, "c"], [-46, -20, "c"], [20, 118, "c"], [82, 40, "c"], [110, 90, "c"],
  ];
  for (const [x, z, kind] of spots) {
    const tree = new THREE.Group();
    const h = kind === "c" ? 6 + rand() * 3 : 2.2 + rand() * 1;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h * 0.5, 5), trunkMat);
    trunk.position.y = h * 0.25;
    tree.add(trunk);
    if (kind === "c") {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, h, 6), cypressMat);
      cone.position.y = h * 0.5 + h / 2;
      tree.add(cone);
    } else {
      for (let i = 0; i < 3; i++) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(1.1 + rand() * 0.7, 6, 5), oliveMat);
        blob.position.set((rand() - 0.5) * 1.6, h * 0.5 + 0.8 + rand() * 0.8, (rand() - 0.5) * 1.6);
        blob.scale.y = 0.75;
        tree.add(blob);
      }
    }
    tree.position.set(x + (rand() - 0.5) * 3, 0, z + (rand() - 0.5) * 3);
    tree.rotation.y = rand() * Math.PI * 2;
    g.add(tree);
  }
  return g;
}

// ---------- evidence mode ----------

/**
 * Experience mode: everything solid (the world feels real).
 * Evidence mode (E): opacity per tier — documented solid, typological
 * translucent, conjecture ghosted. Uses userData.tier stamped at build time.
 */
export function applyEvidenceMode(root: THREE.Object3D, evidenceMode: boolean): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const tier = o.userData.tier as EvidenceTier | undefined;
    if (!tier || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const target = evidenceMode ? TIER_OPACITY[tier] : 1;
      m.transparent = target < 1;
      m.opacity = target;
      m.needsUpdate = true;
    }
  });
}
