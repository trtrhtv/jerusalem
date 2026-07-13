// מודל הנתונים של "מוקד" — מנהל משימות שנלחם בבזבוז זמן.

export type TaskPriority = "high" | "normal" | "low";

export interface FocusTask {
  id: string;
  title: string;
  priority: TaskPriority;
  /** הערכת זמן בדקות, אם ניתנה */
  estimateMinutes: number | null;
  createdAt: number;
  completedAt: number | null;
  /** זמן פוקוס מצטבר שהושקע במשימה (מ"ש) */
  focusedMs: number;
}

/** הכרעת המשתמש על בריחה: האם היציאה הייתה נחוצה או בזבוז */
export type EscapeVerdict = "needed" | "wasted";

export interface EscapeRecord {
  id: string;
  taskId: string | null;
  taskTitle: string;
  leftAt: number;
  returnedAt: number;
  awayMs: number;
  /** ההסבר שהמשתמש נדרש לכתוב */
  explanation: string;
  verdict: EscapeVerdict;
  /** מספר העבירה בתוך הסשן (1 = ראשונה) */
  offenseNumber: number;
}

export interface SessionRecord {
  id: string;
  taskId: string;
  taskTitle: string;
  startedAt: number;
  endedAt: number;
  focusedMs: number;
  wastedMs: number;
  breakMs: number;
  escapeCount: number;
}

export interface FocusData {
  tasks: FocusTask[];
  escapes: EscapeRecord[];
  sessions: SessionRecord[];
}

/** מצב סשן חי — נשמר גם הוא, כדי שרענון הדף לא ישמש כדלת בריחה מהווידוי */
export interface LiveSession {
  id: string;
  taskId: string;
  taskTitle: string;
  startedAt: number;
  focusedMs: number;
  wastedMs: number;
  breakMs: number;
  /** מספר הבזבוזים שנרשמו בסשן — קובע את חומרת החיכוך הבא */
  wastedOffenses: number;
  escapeCount: number;
  /** חותמת חיים אחרונה; פער גדול ממנה בעת טעינה = היעדרות */
  lastSeenAt: number;
  onBreak: boolean;
  breakStartedAt: number | null;
  /** בריחה שממתינה לווידוי (נקבעת ברגע החזרה) */
  pendingEscape: { leftAt: number; returnedAt: number } | null;
}

export const emptyData = (): FocusData => ({
  tasks: [],
  escapes: [],
  sessions: [],
});
