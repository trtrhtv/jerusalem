// כללי החיכוך: כמה קשה יהיה לך לחזור אחרי בריחה, וכמה האפליקציה מציקה.

/** חסד: יציאה קצרה מזה לא נחשבת בריחה (הצצה בטאב עזר, החלפת חלון) */
export const GRACE_MS = 10_000;

/** היעדרות ארוכה מזה בזמן סשן = נטישה; הסשן נסגר והזמן נרשם כבזבוז */
export const ABANDON_MS = 30 * 60_000;

/** אחרי כמה זמן בחוץ נשלחת התראת דפדפן ראשונה */
export const NOTIFY_AFTER_MS = 25_000;

/** כל כמה זמן חוזרת ההתראה כשממשיכים לבזבז */
export const NOTIFY_REPEAT_MS = 60_000;

/** אורך הסבר מינימלי — גדל עם כל בזבוז נוסף באותו סשן */
export function minExplanationChars(offenseNumber: number): number {
  return Math.min(15 + (offenseNumber - 1) * 15, 60);
}

/** שניות המתנה כפויות לפני שאפשר לחזור לעבודה — מסלים מהעבירה השנייה */
export function cooldownSeconds(offenseNumber: number): number {
  if (offenseNumber <= 1) return 0;
  return Math.min((offenseNumber - 1) * 10, 30);
}

export const NAG_TITLES = [
  "🔴 אתה מבזבז זמן",
  "⏳ המשימה שלך מחכה",
];

export function nagNotificationText(awayMs: number, taskTitle: string): string {
  const min = Math.round(awayMs / 60_000);
  if (min < 1) return `עזבת את "${taskTitle}". זה היה נחוץ?`;
  if (min < 3) return `כבר ${min} דק׳ בחוץ. "${taskTitle}" לא תסיים את עצמה.`;
  return `${min} דקות של בריחה. תצטרך להסביר את זה בכתב.`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatMinutes(ms: number): string {
  const min = ms / 60_000;
  if (min < 1) return "פחות מדקה";
  if (min < 60) return `${Math.round(min)} דק׳`;
  const h = Math.floor(min / 60);
  const rem = Math.round(min % 60);
  return rem > 0 ? `${h} ש׳ ${rem} דק׳` : `${h} ש׳`;
}
