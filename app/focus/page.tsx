import type { Metadata } from "next";
import { FocusAppLoader } from "@/components/focus/FocusAppLoader";

export const metadata: Metadata = {
  title: "מוקד — מנהל משימות נגד בזבוז זמן",
  description:
    "מנהל משימות עם מצב פוקוס: עוזבים את הטאב באמצע העבודה — ונדרשים להסביר בכתב איפה הייתם, למה, והאם זה היה נחוץ.",
};

export default function FocusPage() {
  return <FocusAppLoader />;
}
