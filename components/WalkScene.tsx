"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { evidenceTierMeta, getSource } from "@/lib/data";
import {
  elementExistsAt,
  walkScene,
  type WalkElement,
} from "@/lib/walkScene";
import type { EvidenceTier } from "@/lib/types";

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 9; // m/s (brisk walk — the area is large)
const BOUND = 200;

// Jerusalem-stone palette per element kind; evidence tier controls opacity.
const KIND_COLOR: Record<WalkElement["kind"], number> = {
  ground: 0xb9ad93,
  wall: 0xcabb99,
  gate: 0xd2c3a1,
  tower: 0xe9e1cd, // the clock tower was pale limestone
  citadel: 0xc4b492,
  minaret: 0xd8caa9,
  building: 0xcfc0a0,
  road: 0x8f8878,
  moat: 0x6e6a5e,
};

const TIER_OPACITY: Record<EvidenceTier, number> = {
  documented: 1,
  typological: 0.8,
  conjecture: 0.4,
};

function buildElementMesh(el: WalkElement): THREE.Object3D {
  const group = new THREE.Group();
  group.name = el.id;

  // Footprint [x, z] → Shape in XY with y = -z, so that after rotateX(-90°)
  // the extrusion rises along +Y and world z matches the data.
  const shape = new THREE.Shape();
  el.footprint.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();

  const depth = Math.max(el.height, 0.05);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);

  const opacity = TIER_OPACITY[el.evidenceTier];
  const mat = new THREE.MeshLambertMaterial({
    color: KIND_COLOR[el.kind],
    transparent: opacity < 1,
    opacity,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = el.baseHeight ?? 0;
  mesh.userData.elementId = el.id;
  group.add(mesh);

  // crisp low-poly edges (skip flat surfaces where they just add noise)
  if (el.height > 0.5) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 30),
      new THREE.LineBasicMaterial({
        color: 0x5c5342,
        transparent: opacity < 1,
        opacity: Math.min(1, opacity + 0.15),
      }),
    );
    edges.position.y = el.baseHeight ?? 0;
    group.add(edges);
  }

  // dark arched opening on the gate's west and east faces (visual only)
  if (el.kind === "gate") {
    const xs = el.footprint.map(([x]) => x);
    const zs = el.footprint.map(([, z]) => z);
    const zMid = (Math.min(...zs) + Math.max(...zs)) / 2;
    const arch = new THREE.Shape();
    arch.moveTo(-2.2, 0);
    arch.lineTo(-2.2, 3.6);
    arch.absarc(0, 3.6, 2.2, Math.PI, 0, true);
    arch.lineTo(2.2, 0);
    arch.closePath();
    const archGeo = new THREE.ShapeGeometry(arch);
    const archMat = new THREE.MeshBasicMaterial({ color: 0x241f18, side: THREE.DoubleSide });
    for (const [x, ry] of [
      [Math.min(...xs) - 0.05, -Math.PI / 2],
      [Math.max(...xs) + 0.05, Math.PI / 2],
    ] as const) {
      const m = new THREE.Mesh(archGeo, archMat);
      m.rotation.y = ry;
      m.position.set(x, 0, zMid);
      m.userData.elementId = el.id;
      group.add(m);
    }
  }

  return group;
}

export function WalkScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const meshIndexRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const yearRef = useRef(walkScene.defaultYear);
  const [year, setYear] = useState(walkScene.defaultYear);
  const [locked, setLocked] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);

  const selected: WalkElement | null = useMemo(() => {
    const el = walkScene.elements.find((e) => e.id === selectedId) ?? null;
    return el && elementExistsAt(el, year) ? el : null;
  }, [selectedId, year]);

  // apply year to scene visibility
  useEffect(() => {
    yearRef.current = year;
    for (const el of walkScene.elements) {
      const obj = meshIndexRef.current.get(el.id);
      if (obj) obj.visible = elementExistsAt(el, year);
    }
  }, [year]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || startedRef.current) return;
    startedRef.current = true;
    const meshIndex = meshIndexRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdcd3c0); // hazy limestone sky
    scene.fog = new THREE.Fog(0xdcd3c0, 120, 420);

    const camera = new THREE.PerspectiveCamera(
      70,
      mount.clientWidth / mount.clientHeight,
      0.1,
      600,
    );
    // start on the plaza west of the gate, looking at it
    camera.position.set(-28, EYE_HEIGHT, -6);
    camera.lookAt(4, 8, -5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf4ecd8, 0x8a7f66, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
    sun.position.set(-140, 180, 90); // warm afternoon light from the southwest
    scene.add(sun);

    for (const el of walkScene.elements) {
      const obj = buildElementMesh(el);
      obj.visible = elementExistsAt(el, yearRef.current);
      meshIndex.set(el.id, obj);
      scene.add(obj);
    }

    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.addEventListener("lock", () => setLocked(true));
    controls.addEventListener("unlock", () => setLocked(false));

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    const raycaster = new THREE.Raycaster();
    const pickables = [...meshIndex.values()];
    const pick = (ndc: THREE.Vector2) => {
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster
        .intersectObjects(pickables, true)
        .filter((h) => h.object.visible && h.object.userData.elementId);
      const id = hits[0]?.object.userData.elementId as string | undefined;
      setSelectedId(id && id !== "walk-ground" ? id : null);
    };
    const onClick = (e: MouseEvent) => {
      if (controls.isLocked) {
        pick(new THREE.Vector2(0, 0)); // crosshair pick
      } else {
        const r = renderer.domElement.getBoundingClientRect();
        pick(
          new THREE.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            -((e.clientY - r.top) / r.height) * 2 + 1,
          ),
        );
      }
    };
    renderer.domElement.addEventListener("click", onClick);

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.1);
      if (controls.isLocked) {
        const fwd = Number(keys.has("KeyW") || keys.has("ArrowUp")) -
          Number(keys.has("KeyS") || keys.has("ArrowDown"));
        const right = Number(keys.has("KeyD") || keys.has("ArrowRight")) -
          Number(keys.has("KeyA") || keys.has("ArrowLeft"));
        const boost = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2 : 1;
        if (fwd) controls.moveForward(fwd * WALK_SPEED * boost * dt);
        if (right) controls.moveRight(right * WALK_SPEED * boost * dt);
        // stay on the ground and inside the modeled area
        camera.position.y = EYE_HEIGHT;
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -BOUND, BOUND);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -BOUND, BOUND);
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      meshIndex.clear();
      startedRef.current = false;
    };
  }, []);

  const tier = selected ? evidenceTierMeta[selected.evidenceTier] : null;

  return (
    <div className="relative h-full w-full select-none">
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair" />

      {/* year presets */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-black/10 bg-white/90 p-2 shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
          <span className="px-1 text-xs text-neutral-500">שנה:</span>
          {walkScene.yearPresets.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`rounded-lg px-3 py-1 text-sm font-semibold tabular-nums transition ${
                year === y
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                  : "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
              }`}
            >
              {y}
            </button>
          ))}
          <span className="hidden px-1 text-[10px] text-neutral-400 sm:block">
            1870: לפני הפרצה · 1900: אחרי הפרצה · 1915: עם מגדל השעון
          </span>
        </div>
      </div>

      {/* start / controls hint */}
      {!locked && (
        <button
          onClick={() => controlsRef.current?.lock()}
          className="absolute inset-x-0 bottom-16 z-10 mx-auto w-fit rounded-xl border border-black/10 bg-white/95 px-5 py-3 text-center shadow-xl backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-neutral-900/95 dark:hover:bg-neutral-900"
        >
          <span className="block text-sm font-bold">לחצו כאן להליכה 🚶</span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            WASD/חצים לתנועה · עכבר להבטה · Shift לריצה · קליק על מבנה = מקורות · ESC ליציאה
          </span>
        </button>
      )}
      {locked && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-xl text-white/80 mix-blend-difference">
          +
        </div>
      )}

      {/* evidence legend (3D variant) */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-10 p-3">
        <div className="pointer-events-auto max-w-xs rounded-xl border border-black/10 bg-white/90 p-3 text-xs shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
          <div className="mb-1 font-semibold">מדרג ראיות בתלת-ממד</div>
          <ul className="space-y-0.5">
            <li><b>מתועד</b> — גוף מלא</li>
            <li><b>טיפולוגי</b> — שקוף חלקית (המסה ידועה, המבנה לא)</li>
            <li><b>השערה</b> — רפאים (כמעט שקוף)</li>
          </ul>
          <p className="mt-2 border-t border-black/10 pt-2 text-[10px] leading-snug text-neutral-500 dark:border-white/10">
            זהו מחקר מסות low-poly מכוון — לא שחזור פוטוריאליסטי. גבהים ומתארים
            מוערכים מהמקורות; הקרקע שוטחה. קליק על כל מבנה מציג את מקורותיו.
          </p>
        </div>
      </div>

      {/* element info panel */}
      {selected && tier && (
        <div className="pointer-events-auto absolute inset-y-0 right-0 z-20 w-full max-w-sm overflow-y-auto border-l border-black/10 bg-white/95 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-neutral-900/95">
          <div className="flex items-start justify-between gap-2 border-b border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="text-lg font-bold leading-tight">{selected.nameHe}</h2>
              <p className="text-sm text-neutral-500">{selected.name}</p>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              aria-label="סגור"
              className="rounded-md px-2 py-1 text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
            >
              ✕
            </button>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: tier.color }}
              >
                {tier.labelHe}
              </span>
              {selected.builtYear != null && (
                <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100">
                  {selected.builtYearApprox ? "~" : ""}
                  {selected.builtYear}
                  {selected.demolishedYear ? `–${selected.demolishedYear}` : ""}
                </span>
              )}
            </div>
            {selected.notesHe && <p className="leading-relaxed">{selected.notesHe}</p>}
            {selected.notes && (
              <p className="text-xs leading-relaxed text-neutral-500">{selected.notes}</p>
            )}
            <div className="border-t border-black/10 pt-2 dark:border-white/10">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                עוגני מקור · Sources
              </h3>
              {selected.sources.length === 0 ? (
                <p className="text-xs italic text-neutral-500">
                  אין מקור ישיר — אלמנט זה מסומן כהשערה.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {selected.sources.map((sid) => {
                    const s = getSource(sid);
                    if (!s) return null;
                    return (
                      <li key={sid} className="flex items-baseline justify-between gap-2 rounded-lg border border-black/10 px-2 py-1 dark:border-white/10">
                        <span>{s.titleHe ?? s.title}</span>
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-blue-600 underline dark:text-blue-400"
                          >
                            {s.year} ↗
                          </a>
                        ) : (
                          <span className="shrink-0 text-neutral-400">{s.year}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
