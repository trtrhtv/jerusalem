import type { Metadata, Viewport } from "next";
import { FocusAppLoader } from "@/components/focus/FocusAppLoader";

export const metadata: Metadata = {
  title: "מוקד — מנהל משימות נגד בזבוז זמן",
  description:
    "מנהל משימות עם מצב פוקוס: עוזבים את הטאב באמצע העבודה — ונדרשים להסביר בכתב איפה הייתם, למה, והאם זה היה נחוץ.",
  manifest: "/focus.webmanifest",
  icons: { apple: "/icons/moked-192.png" },
  appleWebApp: {
    capable: true,
    title: "מוקד",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#7f1d1d",
};

export default function FocusPage() {
  return <FocusAppLoader />;
}
