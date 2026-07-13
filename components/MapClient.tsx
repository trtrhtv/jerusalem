"use client";

import dynamic from "next/dynamic";

// MapLibre touches `window` at load, so the map must never render on the server.
const TimelineMap = dynamic(
  () => import("./TimelineMap").then((m) => m.TimelineMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
        טוען מפה…
      </div>
    ),
  },
);

export function MapClient() {
  return <TimelineMap />;
}
