import { emptyData, type FocusData, type LiveSession } from "./types";

const DATA_KEY = "moked-focus:v1";
const SESSION_KEY = "moked-focus:live-session:v1";

export function loadData(): FocusData {
  if (typeof window === "undefined") return emptyData();
  try {
    const raw = window.localStorage.getItem(DATA_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as Partial<FocusData>;
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      escapes: Array.isArray(parsed.escapes) ? parsed.escapes : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return emptyData();
  }
}

export function saveData(data: FocusData): void {
  try {
    window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch {
    // אחסון מלא/חסום — האפליקציה ממשיכה לעבוד בזיכרון
  }
}

export function loadLiveSession(): LiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as LiveSession) : null;
  } catch {
    return null;
  }
}

export function saveLiveSession(session: LiveSession | null): void {
  try {
    if (session === null) window.localStorage.removeItem(SESSION_KEY);
    else window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
