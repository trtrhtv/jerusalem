"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EscapeRecord,
  EscapeVerdict,
  FocusTask,
  LiveSession,
  SessionRecord,
} from "@/lib/focus/types";
import { loadLiveSession, makeId, saveLiveSession } from "@/lib/focus/storage";
import {
  ABANDON_MS,
  GRACE_MS,
  NAG_TITLES,
  NOTIFY_AFTER_MS,
  NOTIFY_REPEAT_MS,
  formatDuration,
  nagNotificationText,
} from "@/lib/focus/friction";

export interface UseFocusSessionArgs {
  onEscape: (record: EscapeRecord) => void;
  onSessionEnd: (record: SessionRecord, markTaskDone: boolean) => void;
}

/**
 * שחזור סשן ששרד רענון או סגירת טאב. פער מאז פעימת החיים האחרונה נחשב
 * היעדרות שדורשת וידוי — כך שגם רענון הדף (או בריחה של שעות) אינו דלת מילוט.
 * פונקציה טהורה: נקראת כאתחול עצל של ה-state (הקומפוננטה נטענת עם ssr:false).
 */
function restoreSession(): LiveSession | null {
  const stored = loadLiveSession();
  if (!stored) return null;
  const now = Date.now();
  const gap = Math.max(0, now - stored.lastSeenAt);
  if (!stored.onBreak && !stored.pendingEscape && gap > GRACE_MS) {
    return {
      ...stored,
      pendingEscape: { leftAt: stored.lastSeenAt, returnedAt: now },
      escapeCount: stored.escapeCount + 1,
      lastSeenAt: now,
    };
  }
  return { ...stored, lastSeenAt: now };
}

/**
 * מנוע הסשן: טיימר, זיהוי בריחות (טאב מוסתר / חלון בלי פוקוס), הצקות
 * בכותרת הטאב ובהתראות דפדפן, והפסקות מוצהרות.
 */
export function useFocusSession({ onEscape, onSessionEnd }: UseFocusSessionArgs) {
  const [session, setSession] = useState<LiveSession | null>(restoreSession);

  const sessionRef = useRef<LiveSession | null>(null);
  const awayStartRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const baseTitleRef = useRef("");
  const lastNotifyAtRef = useRef(0);
  const onEscapeRef = useRef(onEscape);
  const onSessionEndRef = useRef(onSessionEnd);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    onEscapeRef.current = onEscape;
    onSessionEndRef.current = onSessionEnd;
  }, [onEscape, onSessionEnd]);

  useEffect(() => {
    baseTitleRef.current = document.title;
  }, []);

  const commit = useCallback((next: LiveSession | null) => {
    sessionRef.current = next;
    setSession(next);
    saveLiveSession(next);
  }, []);

  // זיהוי יציאה וחזרה: טאב מוסתר או חלון שאיבד פוקוס
  useEffect(() => {
    const check = () => {
      const s = sessionRef.current;
      const away = document.hidden || !document.hasFocus();
      if (!s || s.onBreak || s.pendingEscape) {
        awayStartRef.current = null;
        return;
      }
      if (away) {
        if (awayStartRef.current === null) awayStartRef.current = Date.now();
        return;
      }
      // חזרה
      if (awayStartRef.current === null) return;
      const leftAt = awayStartRef.current;
      awayStartRef.current = null;
      document.title = baseTitleRef.current;
      const now = Date.now();
      if (now - leftAt <= GRACE_MS) return; // בתוך תקופת החסד
      commit({
        ...s,
        pendingEscape: { leftAt, returnedAt: now },
        escapeCount: s.escapeCount + 1,
        lastSeenAt: now,
      });
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("blur", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("blur", check);
      window.removeEventListener("focus", check);
    };
  }, [commit]);

  // טיק שניתי: צבירת זמן פוקוס, פעימת חיים, והצקות בזמן בריחה
  const active = session !== null;
  useEffect(() => {
    if (!active) return;
    lastTickRef.current = Date.now();
    const id = setInterval(() => {
      const s = sessionRef.current;
      if (!s) return;
      const now = Date.now();
      const delta = Math.max(0, Math.min(now - lastTickRef.current, ABANDON_MS));
      lastTickRef.current = now;
      const away = awayStartRef.current !== null;
      const focused = !away && !s.onBreak && !s.pendingEscape;
      commit({
        ...s,
        focusedMs: focused ? s.focusedMs + delta : s.focusedMs,
        lastSeenAt: now,
      });

      if (away && !s.onBreak) {
        const awayMs = now - (awayStartRef.current ?? now);
        // הצקה בכותרת הטאב — נראית גם כשגולשים בטאב אחר
        document.title = `${NAG_TITLES[Math.floor(now / 2000) % NAG_TITLES.length]} · ${formatDuration(awayMs)}`;
        // התראת דפדפן מציקה, חוזרת כל דקה
        if (
          awayMs > NOTIFY_AFTER_MS &&
          now - lastNotifyAtRef.current > NOTIFY_REPEAT_MS &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          lastNotifyAtRef.current = now;
          try {
            new Notification("מוקד — חזור לעבודה", {
              body: nagNotificationText(awayMs, s.taskTitle),
              tag: "moked-nag",
            });
          } catch {
            // דפדפן שלא תומך בבנאי Notification (מובייל) — מוותרים בשקט
          }
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active, commit]);

  const start = useCallback(
    (task: FocusTask) => {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      awayStartRef.current = null;
      commit({
        id: makeId(),
        taskId: task.id,
        taskTitle: task.title,
        startedAt: Date.now(),
        focusedMs: 0,
        wastedMs: 0,
        breakMs: 0,
        wastedOffenses: 0,
        escapeCount: 0,
        lastSeenAt: Date.now(),
        onBreak: false,
        breakStartedAt: null,
        pendingEscape: null,
      });
    },
    [commit],
  );

  const resolveEscape = useCallback(
    (explanation: string, verdict: EscapeVerdict) => {
      const s = sessionRef.current;
      if (!s?.pendingEscape) return;
      const { leftAt, returnedAt } = s.pendingEscape;
      const awayMs = returnedAt - leftAt;
      const wasted = verdict === "wasted";
      onEscapeRef.current({
        id: makeId(),
        taskId: s.taskId,
        taskTitle: s.taskTitle,
        leftAt,
        returnedAt,
        awayMs,
        explanation,
        verdict,
        offenseNumber: wasted ? s.wastedOffenses + 1 : s.wastedOffenses,
      });
      lastTickRef.current = Date.now();
      commit({
        ...s,
        pendingEscape: null,
        wastedMs: wasted ? s.wastedMs + awayMs : s.wastedMs,
        wastedOffenses: wasted ? s.wastedOffenses + 1 : s.wastedOffenses,
        lastSeenAt: Date.now(),
      });
    },
    [commit],
  );

  const startBreak = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.onBreak) return;
    awayStartRef.current = null;
    commit({ ...s, onBreak: true, breakStartedAt: Date.now(), lastSeenAt: Date.now() });
  }, [commit]);

  const endBreak = useCallback(() => {
    const s = sessionRef.current;
    if (!s?.onBreak) return;
    const now = Date.now();
    lastTickRef.current = now;
    commit({
      ...s,
      onBreak: false,
      breakMs: s.breakMs + Math.max(0, now - (s.breakStartedAt ?? now)),
      breakStartedAt: null,
      lastSeenAt: now,
    });
  }, [commit]);

  const end = useCallback(
    (markTaskDone: boolean) => {
      const s = sessionRef.current;
      if (!s) return;
      const now = Date.now();
      const breakMs =
        s.breakMs + (s.onBreak ? Math.max(0, now - (s.breakStartedAt ?? now)) : 0);
      document.title = baseTitleRef.current;
      awayStartRef.current = null;
      commit(null);
      onSessionEndRef.current(
        {
          id: s.id,
          taskId: s.taskId,
          taskTitle: s.taskTitle,
          startedAt: s.startedAt,
          endedAt: now,
          focusedMs: s.focusedMs,
          wastedMs: s.wastedMs,
          breakMs,
          escapeCount: s.escapeCount,
        },
        markTaskDone,
      );
    },
    [commit],
  );

  return { session, start, end, startBreak, endBreak, resolveEscape };
}
