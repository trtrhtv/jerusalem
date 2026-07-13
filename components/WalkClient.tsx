"use client";

import dynamic from "next/dynamic";

// Three.js touches window/WebGL — client-only, same pattern as the map.
const WalkScene = dynamic(
  () => import("./WalkScene").then((m) => m.WalkScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
        טוען הדמיה…
      </div>
    ),
  },
);

export function WalkClient() {
  return <WalkScene />;
}
