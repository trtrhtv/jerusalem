"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { baseStyle } from "@/lib/mapStyle";
import { evidenceTierMeta, getSource } from "@/lib/data";
import {
  addClockFaces,
  addCrenellations,
  addOpenings,
  addRoofDomes,
  applyEvidenceMode,
  buildSky,
  buildTrees,
  makeGroundTexture,
  makeRoadTexture,
  makeRoofTexture,
  makeStoneTexture,
} from "@/lib/walk3d";
import {
  elementExistsAt,
  walkScene,
  type WalkElement,
} from "@/lib/walkScene";
import { wilsonWalkElements, type GeneratedWalkElement } from "@/lib/wilsonScene";
import { buildGeneratedElement, type KitMaterials } from "@/lib/houseKit";

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 9; // m/s (brisk walk — the area is large)
// walkable rectangle: extended east so David Street can be walked to the bazaars
const BOUND_X: [number, number] = [-200, 330];
const BOUND_Z: [number, number] = [-200, 200];

/** Hand-modeled pilot elements + everything generated from the Wilson survey. */
const allElements: WalkElement[] = [...walkScene.elements, ...wilsonWalkElements];

/**
 * Local scene meters → WGS84, anchored at the scene origin (the Jaffa Gate
 * plaza). +x = east, +z = south. Good to well under a meter at this scale.
 */
function localToLngLat(x: number, z: number): [number, number] {
  const { lon, lat } = walkScene.anchor;
  const mPerDegLat = 110574;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  return [lon + x / mPerDegLon, lat - z / mPerDegLat];
}

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
  pool: 0x51705f,
};

// stone texture per element kind, generated once (client only)
const stoneTexCache = new Map<string, THREE.Texture>();
function stoneTex(kind: WalkElement["kind"]): THREE.Texture {
  let t = stoneTexCache.get(kind);
  if (!t) {
    t = makeStoneTexture(KIND_COLOR[kind], "stone-" + kind);
    stoneTexCache.set(kind, t);
  }
  return t;
}

// shared roof/road textures (client only, lazy)
let roofTexSingleton: THREE.Texture | null = null;
function roofTex(): THREE.Texture {
  return (roofTexSingleton ??= makeRoofTexture());
}
let roadTexSingleton: THREE.Texture | null = null;
function roadTex(): THREE.Texture {
  return (roadTexSingleton ??= makeRoadTexture());
}

/** Timeline range of the walk's year slider (matches the map). */
const WALK_TIMELINE = { min: 1500, max: 1930 } as const;

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

  const stoneKinds = ["wall", "gate", "tower", "citadel", "minaret", "building"];
  const mat = new THREE.MeshLambertMaterial(
    el.kind === "ground"
      ? { map: makeGroundTexture() }
      : el.kind === "road"
        ? { map: roadTex() }
        : stoneKinds.includes(el.kind)
          ? { map: stoneTex(el.kind) }
          : { color: KIND_COLOR[el.kind] },
  );
  // buildings get a pale plaster roof cap (extrude group 0 = caps, 1 = walls)
  const mesh = new THREE.Mesh(
    geo,
    el.kind === "building"
      ? [new THREE.MeshLambertMaterial({ map: roofTex() }), mat]
      : mat,
  );
  mesh.position.y = el.baseHeight ?? 0;
  mesh.userData.elementId = el.id;
  if (el.height > 0.5) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  } else {
    mesh.receiveShadow = true;
  }
  group.add(mesh);

  // crisp low-poly edges, softened now that surfaces carry texture
  if (el.height > 0.5) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 30),
      new THREE.LineBasicMaterial({ color: 0x5c5342, transparent: true, opacity: 0.35 }),
    );
    edges.position.y = el.baseHeight ?? 0;
    edges.userData.decor = true;
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

  // Stage-A decoration: openings, battlements, domes, clock faces
  addOpenings(group, el);
  addCrenellations(group, el, mat);
  addRoofDomes(group, el, mat);
  addClockFaces(group, el);

  // stamp tier on everything for the evidence-mode toggle; keep picking ids
  group.traverse((o) => {
    o.userData.tier = el.evidenceTier;
    if (!o.userData.elementId) o.userData.elementId = el.id;
  });

  return group;
}

/** Initial year from ?year= (component is ssr:false, window is available). */
function initialWalkYear(): number {
  if (typeof window === "undefined") return walkScene.defaultYear;
  const y = Number(new URLSearchParams(window.location.search).get("year"));
  return Number.isFinite(y) && y >= 1500 && y <= 1930
    ? Math.round(y)
    : walkScene.defaultYear;
}

type ViewMode = "walk" | "aerial";

function initialMode(): ViewMode {
  if (typeof window === "undefined") return "walk";
  return new URLSearchParams(window.location.search).get("mode") === "aerial"
    ? "aerial"
    : "walk";
}

/** Fast lookup for pick/glide decisions. */
const elementById = new Map(allElements.map((e) => [e.id, e]));

export function WalkScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const meshIndexRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const yearRef = useRef(walkScene.defaultYear);
  const [year, setYear] = useState(initialWalkYear);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evidenceMode, setEvidenceMode] = useState(false);
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const modeRef = useRef<ViewMode>(mode);
  /** Set inside the mount effect; lets the mode effect drive the camera. */
  const applyModeRef = useRef<((m: ViewMode) => void) | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  /** Running construction/demolition animations, consumed by the render loop. */
  const transitionsRef = useRef<
    Map<string, { obj: THREE.Object3D; appear: boolean; start: number }>
  >(new Map());

  // E — evidence mode: the world reveals what it is actually built on
  useEffect(() => {
    if (sceneRef.current) applyEvidenceMode(sceneRef.current, evidenceMode);
  }, [evidenceMode]);

  const selected: WalkElement | null = useMemo(() => {
    const el = allElements.find((e) => e.id === selectedId) ?? null;
    return el && elementExistsAt(el, year) ? el : null;
  }, [selectedId, year]);

  // Apply year to the scene — the city builds itself: elements whose build
  // year is crossed RISE from the ground; demolished ones sink away. Flat
  // surfaces (roads, the pool) snap — there is nothing to "construct" visually.
  useEffect(() => {
    yearRef.current = year;
    for (const el of allElements) {
      const obj = meshIndexRef.current.get(el.id);
      if (!obj) continue;
      const target = elementExistsAt(el, year);
      const shown = (obj.userData.shown as boolean | undefined) ?? obj.visible;
      if (shown === target) continue;
      obj.userData.shown = target;
      if (el.height < 1) {
        obj.visible = target;
        transitionsRef.current.delete(el.id);
        continue;
      }
      obj.visible = true;
      transitionsRef.current.set(el.id, {
        obj,
        appear: target,
        start: performance.now(),
      });
    }
  }, [year]);

  // ▶ play — sweep the timeline and watch the corridor build itself
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setYear((y) => {
        if (y >= WALK_TIMELINE.max) {
          setPlaying(false);
          return y;
        }
        return y + 1;
      });
    }, 70);
    return () => clearInterval(id);
  }, [playing]);

  // keep the shareable ?year= / ?mode= params in sync
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("year", String(year));
    if (mode === "aerial") u.searchParams.set("mode", "aerial");
    else u.searchParams.delete("mode");
    window.history.replaceState(null, "", u);
  }, [year, mode]);

  // walk ⟷ synthetic-aerial toggle
  useEffect(() => {
    modeRef.current = mode;
    applyModeRef.current?.(mode);
  }, [mode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || startedRef.current) return;
    startedRef.current = true;
    const meshIndex = meshIndexRef.current;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    // debugging/tooling hook (harmless in production)
    (window as unknown as { __scene?: THREE.Scene }).__scene = scene;
    scene.background = new THREE.Color(0xe8ddc4); // horizon haze (matches sky dome)
    scene.fog = new THREE.Fog(0xe8ddc4, 130, 430);
    scene.add(buildSky());
    scene.add(buildTrees());

    const camera = new THREE.PerspectiveCamera(
      70,
      mount.clientWidth / mount.clientHeight,
      0.1,
      600,
    );
    // start on the plaza west of the gate, looking at it; ?pos=x,z&look=x,z
    // overrides the spawn (shareable viewpoints, browser testing)
    const params = new URLSearchParams(window.location.search);
    const posParam = (params.get("pos") ?? "").split(",").map(Number);
    const lookParam = (params.get("look") ?? "").split(",").map(Number);
    if (posParam.length >= 2 && posParam.every(Number.isFinite)) {
      camera.position.set(posParam[0], posParam[2] ?? EYE_HEIGHT, posParam[1]);
    } else {
      camera.position.set(-28, EYE_HEIGHT, -6);
    }
    if (lookParam.length >= 2 && lookParam.every(Number.isFinite)) {
      camera.lookAt(lookParam[0], lookParam[2] ?? EYE_HEIGHT, lookParam[1]);
    } else {
      camera.lookAt(4, 8, -5);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf4ecd8, 0x8a7f66, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    sun.position.set(-140, 180, 90); // warm afternoon light from the southwest
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 340; // covers the generated corridor to the bazaars
    sun.shadow.camera.top = 180;
    sun.shadow.camera.bottom = -180;
    sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    // typological generator materials — tonal stone variants (the generator
    // clones per element, so evidence-mode opacity stays element-local)
    const kitMats: KitMaterials = {
      stoneVariants: [0xcfc0a0, 0xc6b28c, 0xdacdb0].map(
        (c, i) =>
          new THREE.MeshLambertMaterial({
            map: makeStoneTexture(c, "stone-gen-" + i),
            side: THREE.DoubleSide,
          }),
      ),
      roof: new THREE.MeshLambertMaterial({ map: roofTex() }),
      road: new THREE.MeshLambertMaterial({ map: roadTex() }),
      frame: new THREE.MeshLambertMaterial({ color: 0xded2b4 }),
    };

    for (const el of allElements) {
      const obj = (el as GeneratedWalkElement).generated
        ? buildGeneratedElement(el as GeneratedWalkElement, kitMats)
        : buildElementMesh(el);
      obj.visible = elementExistsAt(el, yearRef.current);
      obj.userData.shown = obj.visible;
      meshIndex.set(el.id, obj);
      scene.add(obj);
    }

    // --- present-day minimap: where you are relative to today's city ---
    let minimap: maplibregl.Map | null = null;
    let miniMarker: maplibregl.Marker | null = null;
    if (minimapRef.current) {
      minimap = new maplibregl.Map({
        container: minimapRef.current,
        style: baseStyle,
        center: localToLngLat(camera.position.x, camera.position.z),
        zoom: 16.3,
        interactive: false,
        attributionControl: false,
      });
      const arrow = document.createElement("div");
      arrow.style.cssText =
        "width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:16px solid #dc2626;filter:drop-shadow(0 0 2px #fff)";
      miniMarker = new maplibregl.Marker({
        element: arrow,
        rotationAlignment: "map",
      })
        .setLngLat(localToLngLat(camera.position.x, camera.position.z))
        .addTo(minimap);
    }
    let miniAccum = 0;
    const camDir = new THREE.Vector3();

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      // don't steal keys from form controls (the year slider)
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.code === "KeyE") setEvidenceMode((v) => !v);
      if (e.code.startsWith("Digit")) {
        const preset = walkScene.yearPresets[Number(e.code.slice(5)) - 1];
        if (preset) {
          setPlaying(false);
          setYear(preset);
        }
      }
      keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    const raycaster = new THREE.Raycaster();
    const pickables = [...meshIndex.values()];
    let glideTarget: THREE.Vector3 | null = null;
    const pick = (ndc: THREE.Vector2) => {
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster
        .intersectObjects(pickables, true)
        .filter((h) => h.object.visible && h.object.userData.elementId);
      const hit = hits[0];
      if (!hit) {
        setSelectedId(null);
        return;
      }
      const id = hit.object.userData.elementId as string;
      const kind = elementById.get(id)?.kind;
      // Street-View-style navigation: clicking the ground/street glides there
      if (
        modeRef.current === "walk" &&
        (kind === "ground" || kind === "road" || kind === "moat")
      ) {
        glideTarget = new THREE.Vector3(
          THREE.MathUtils.clamp(hit.point.x, BOUND_X[0], BOUND_X[1]),
          EYE_HEIGHT,
          THREE.MathUtils.clamp(hit.point.z, BOUND_Z[0], BOUND_Z[1]),
        );
        setSelectedId(null);
        return;
      }
      setSelectedId(id !== "walk-ground" ? id : null);
    };

    // --- synthetic aerial mode: the same evidence-bearing scene from above ---
    const aerial = { tx: 90, tz: -10, h: 230 };
    const savedPose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), saved: false };
    const applyAerialCam = () => {
      camera.position.set(aerial.tx, aerial.h, aerial.tz + aerial.h * 0.42);
      camera.lookAt(aerial.tx, 0, aerial.tz);
    };
    applyModeRef.current = (m) => {
      if (!scene.fog) return;
      const fog = scene.fog as THREE.Fog;
      if (m === "aerial") {
        savedPose.pos.copy(camera.position);
        savedPose.quat.copy(camera.quaternion);
        savedPose.saved = true;
        aerial.tx = THREE.MathUtils.clamp(camera.position.x, -60, 300);
        aerial.tz = THREE.MathUtils.clamp(camera.position.z, -130, 130);
        aerial.h = 230;
        camera.far = 1200;
        fog.near = 500;
        fog.far = 1100;
        applyAerialCam();
      } else {
        camera.far = 600;
        fog.near = 130;
        fog.far = 430;
        if (savedPose.saved) {
          camera.position.copy(savedPose.pos);
          camera.quaternion.copy(savedPose.quat);
        }
        look.setFromQuaternion(camera.quaternion, "YXZ");
        look.z = 0;
      }
      camera.updateProjectionMatrix();
    };

    // --- drag-to-look: no pointer lock, so the mouse stays free for the UI.
    // Drag rotates the view; a click without a drag picks a building.
    const look = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    let dragging = false;
    let dragDist = 0;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      dragDist = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      dragDist += Math.abs(dx) + Math.abs(dy);
      if (modeRef.current === "aerial") {
        // drag pans the aerial view, map-style
        const s = aerial.h * 0.0011;
        aerial.tx = THREE.MathUtils.clamp(aerial.tx - dx * s, -120, 340);
        aerial.tz = THREE.MathUtils.clamp(aerial.tz - dy * s, -160, 160);
        applyAerialCam();
        return;
      }
      look.y -= dx * 0.0042;
      look.x = THREE.MathUtils.clamp(look.x - dy * 0.0042, -1.45, 1.45);
      look.z = 0;
      camera.quaternion.setFromEuler(look);
    };
    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== "aerial") return;
      e.preventDefault();
      aerial.h = THREE.MathUtils.clamp(aerial.h * (1 + e.deltaY * 0.0012), 60, 420);
      applyAerialCam();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      renderer.domElement.releasePointerCapture(e.pointerId);
      if (dragDist < 6) {
        const r = renderer.domElement.getBoundingClientRect();
        pick(
          new THREE.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            -((e.clientY - r.top) / r.height) * 2 + 1,
          ),
        );
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // if the page opened directly in aerial mode, apply it now
    if (modeRef.current === "aerial") applyModeRef.current("aerial");

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    const moveDir = new THREE.Vector3();
    const rightVec = new THREE.Vector3();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.1);
      const fwd = Number(keys.has("KeyW") || keys.has("ArrowUp")) -
        Number(keys.has("KeyS") || keys.has("ArrowDown"));
      const right = Number(keys.has("KeyD") || keys.has("ArrowRight")) -
        Number(keys.has("KeyA") || keys.has("ArrowLeft"));
      if (modeRef.current === "aerial") {
        if (fwd || right) {
          const s = aerial.h * 0.9 * dt;
          aerial.tx = THREE.MathUtils.clamp(aerial.tx + right * s, -120, 340);
          aerial.tz = THREE.MathUtils.clamp(aerial.tz - fwd * s, -160, 160);
          applyAerialCam();
        }
      } else if (fwd || right) {
        glideTarget = null; // manual movement cancels a glide
        const boost = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2 : 1;
        camera.getWorldDirection(moveDir);
        moveDir.y = 0;
        moveDir.normalize();
        rightVec.set(-moveDir.z, 0, moveDir.x);
        camera.position.addScaledVector(moveDir, fwd * WALK_SPEED * boost * dt);
        camera.position.addScaledVector(rightVec, right * WALK_SPEED * boost * dt);
        // stay on the ground and inside the modeled area
        camera.position.y = EYE_HEIGHT;
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, BOUND_X[0], BOUND_X[1]);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, BOUND_Z[0], BOUND_Z[1]);
      } else if (glideTarget) {
        // Street-View-style glide toward the clicked point
        moveDir.copy(glideTarget).sub(camera.position);
        moveDir.y = 0;
        const dist = moveDir.length();
        if (dist < 0.4) {
          glideTarget = null;
        } else {
          const step = Math.min(dist, 14 * dt);
          camera.position.addScaledVector(moveDir.normalize(), step);
          camera.position.y = EYE_HEIGHT;
        }
      }
      // construction/demolition: rise from the ground / sink away
      if (transitionsRef.current.size) {
        const nowMs = performance.now();
        for (const [id, tr] of transitionsRef.current) {
          const t = Math.min(1, (nowMs - tr.start) / 900);
          const k = t * t * (3 - 2 * t); // smoothstep
          tr.obj.scale.y = Math.max(0.001, tr.appear ? k : 1 - k);
          if (t >= 1) {
            tr.obj.scale.y = tr.appear ? 1 : 0.001;
            if (!tr.appear) tr.obj.visible = false;
            transitionsRef.current.delete(id);
          }
        }
      }
      // update the present-day minimap ~5×/sec
      miniAccum += dt;
      if (minimap && miniMarker && miniAccum > 0.2) {
        miniAccum = 0;
        const aerialMode = modeRef.current === "aerial";
        const lngLat = aerialMode
          ? localToLngLat(aerial.tx, aerial.tz)
          : localToLngLat(camera.position.x, camera.position.z);
        miniMarker.setLngLat(lngLat);
        camera.getWorldDirection(camDir);
        // north = -z, east = +x → compass bearing (aerial always faces north)
        miniMarker.setRotation(
          aerialMode ? 0 : (Math.atan2(camDir.x, -camDir.z) * 180) / Math.PI,
        );
        minimap.setCenter(lngLat);
        if (aerialMode) minimap.setZoom(Math.max(13.8, 17.2 - aerial.h / 90));
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      minimap?.remove();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      applyModeRef.current = null;
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

      {/* time bar: play (the city builds itself) + slider + presets */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white/90 p-2 shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
          <button
            onClick={() => setPlaying((p) => !p)}
            title="ניגון — העיר נבנית מול העיניים"
            className="grid h-8 w-8 place-items-center rounded-full bg-neutral-800 text-sm text-white transition hover:bg-neutral-600 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
          >
            {playing ? "⏸" : "▶"}
          </button>
          <span className="w-12 text-center text-sm font-bold tabular-nums">
            {year}
          </span>
          <input
            dir="ltr"
            type="range"
            min={WALK_TIMELINE.min}
            max={WALK_TIMELINE.max}
            value={year}
            onChange={(e) => {
              setPlaying(false);
              setYear(Number(e.target.value));
            }}
            onPointerUp={(e) => (e.target as HTMLInputElement).blur()}
            className="w-36 accent-neutral-800 sm:w-52 dark:accent-neutral-200"
            aria-label="שנה"
          />
          {walkScene.yearPresets.map((y, i) => (
            <button
              key={y}
              onClick={() => {
                setPlaying(false);
                setYear(y);
              }}
              title={`מקש ${i + 1}`}
              className={`rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums transition ${
                year === y
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                  : "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
              }`}
            >
              {y}
            </button>
          ))}
          <button
            onClick={() => setMode((m) => (m === "walk" ? "aerial" : "walk"))}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              mode === "aerial"
                ? "bg-sky-700 text-white hover:bg-sky-600"
                : "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
            }`}
            title="מעבר בין הליכה ברחוב למבט תצ״א סינתטי על אותה סצנה"
          >
            {mode === "walk" ? "🛩️ תצ״א" : "🚶 חזרה לרחוב"}
          </button>
          <a
            href={`/?year=${year}`}
            className="rounded-lg bg-black/5 px-2.5 py-1 text-xs hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
            title="חזרה למפת ציר-הזמן באותה שנה"
          >
            🗺️ למפה
          </a>
        </div>
      </div>

      {/* controls hint — the mouse is free: drag to look, click to inspect */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
        <div className="rounded-full border border-black/10 bg-white/80 px-4 py-1.5 text-[11px] text-neutral-600 shadow backdrop-blur dark:border-white/10 dark:bg-neutral-900/80 dark:text-neutral-300">
          {mode === "walk"
            ? "גררו להבטה · קליק על הרחוב = תנועה לשם · WASD/חצים להליכה · Shift ריצה · קליק על מבנה = מקורות · E מצב ראיות · 1/2/3 שנים"
            : "תצ״א סינתטית מההדמיה — גררו להזזה · גלגלת לזום · ▶ מנגן את בניית העיר · קליק על מבנה = מקורות · E מצב ראיות"}
        </div>
      </div>

      {/* present-day minimap: your position vs. today's city */}
      <div className="pointer-events-none absolute bottom-0 right-0 z-10 p-3">
        <div className="overflow-hidden rounded-xl border border-black/20 shadow-lg">
          <div ref={minimapRef} className="h-44 w-44 bg-[#efe9df]" dir="ltr" />
          <div className="bg-white/90 px-2 py-0.5 text-center text-[10px] text-neutral-500 backdrop-blur dark:bg-neutral-900/90">
            מיקומך על מפת היום ⟵ ההדמיה: {year}
          </div>
        </div>
      </div>

      {/* evidence legend (3D variant) */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-10 p-3">
        <div className="pointer-events-auto max-w-xs rounded-xl border border-black/10 bg-white/90 p-3 text-xs shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
          <div className="mb-1 flex items-center justify-between font-semibold">
            <span>מדרג ראיות</span>
            <kbd className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] dark:bg-white/15">E</kbd>
          </div>
          <ul className="space-y-0.5">
            <li><b>מצב חוויה</b> — העולם מלא ורציף</li>
            <li><b>מצב ראיות (E)</b> — מתועד מלא · טיפולוגי שקוף · השערה רפאים</li>
          </ul>
          <p className="mt-2 border-t border-black/10 pt-2 text-[10px] leading-snug text-neutral-500 dark:border-white/10">
            הדמיה מסוגננת נאמנת-מקורות: מתארים וגבהים מוערכים מהמקורות, הפרטים
            (פתחים, כיפות, עצים) טיפולוגיים. קליק על כל מבנה מציג את מקורותיו.
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
              {selected.geometryConfidence === "surveyed" && (
                <span
                  className="rounded-full bg-sky-700 px-2 py-0.5 text-xs font-semibold text-white"
                  title="המתאר דוגט ממפת וילסון 1865 המיושרת — הצורה מדודה, לא מוערכת"
                >
                  📐 מתאר מדוד 1865
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
