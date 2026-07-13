"use client";

import dynamic from "next/dynamic";

// טעינה בקליינט בלבד: כל ה-state מאותחל מ-localStorage, שאינו קיים בשרת
export const FocusAppLoader = dynamic(
  () => import("./FocusApp").then((m) => m.FocusApp),
  {
    ssr: false,
    loading: () => (
      <p className="p-8 text-center text-sm text-neutral-500">טוען את מוקד…</p>
    ),
  },
);
