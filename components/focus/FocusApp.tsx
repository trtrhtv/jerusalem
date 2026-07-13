"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  EscapeRecord,
  FocusData,
  SessionRecord,
  TaskPriority,
} from "@/lib/focus/types";
import { loadData, makeId, saveData } from "@/lib/focus/storage";
import { InstallButton } from "./InstallButton";
import { TaskPanel } from "./TaskPanel";
import { JournalPanel } from "./JournalPanel";
import { SessionOverlay } from "./SessionOverlay";
import { useFocusSession } from "./useFocusSession";

type Tab = "tasks" | "journal";

export function FocusApp() {
  // אתחול עצל — הקומפוננטה נטענת עם ssr:false, כך שהאחסון תמיד זמין
  const [data, setData] = useState<FocusData>(loadData);
  const [tab, setTab] = useState<Tab>("tasks");

  useEffect(() => {
    saveData(data);
  }, [data]);

  // Service Worker להתקנה כאפליקציה ולהתראות — scope של /focus בלבד,
  // כדי לא לגעת בשאר האתר
  useEffect(() => {
    navigator.serviceWorker
      ?.register("/focus-sw.js", { scope: "/focus" })
      .catch(() => {});
  }, []);

  const onEscape = useCallback((record: EscapeRecord) => {
    setData((prev) => ({ ...prev, escapes: [...prev.escapes, record] }));
  }, []);

  const onSessionEnd = useCallback((record: SessionRecord, markTaskDone: boolean) => {
    setData((prev) => ({
      ...prev,
      sessions: [...prev.sessions, record],
      tasks: prev.tasks.map((t) =>
        t.id === record.taskId
          ? {
              ...t,
              focusedMs: t.focusedMs + record.focusedMs,
              completedAt: markTaskDone ? Date.now() : t.completedAt,
            }
          : t,
      ),
    }));
  }, []);

  const { session, start, end, startBreak, endBreak, resolveEscape } = useFocusSession({
    onEscape,
    onSessionEnd,
  });

  const addTask = (title: string, priority: TaskPriority, estimateMinutes: number | null) => {
    setData((prev) => ({
      ...prev,
      tasks: [
        ...prev.tasks,
        {
          id: makeId(),
          title,
          priority,
          estimateMinutes,
          createdAt: Date.now(),
          completedAt: null,
          focusedMs: 0,
        },
      ],
    }));
  };

  const toggleDone = (taskId: string) => {
    setData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId ? { ...t, completedAt: t.completedAt ? null : Date.now() } : t,
      ),
    }));
  };

  const deleteTask = (taskId: string) => {
    setData((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => t.id !== taskId) }));
  };

  const startFocus = (taskId: string) => {
    const task = data.tasks.find((t) => t.id === taskId);
    if (task) start(task);
  };

  const sessionTask = session ? data.tasks.find((t) => t.id === session.taskId) : undefined;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-black">🎯 מוקד</h1>
          <span className="text-xs text-neutral-500">
            מנהל משימות שלא נותן לך לברוח
          </span>
        </div>
        {!session && <InstallButton />}
        {!session && (
          <nav className="flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
            {(
              [
                ["tasks", "משימות"],
                ["journal", "יומן בזבוזים"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  tab === key
                    ? "bg-white shadow-sm dark:bg-neutral-700"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {session ? (
        <SessionOverlay
          session={session}
          estimateMinutes={sessionTask?.estimateMinutes ?? null}
          onEnd={end}
          onStartBreak={startBreak}
          onEndBreak={endBreak}
          onResolveEscape={resolveEscape}
        />
      ) : tab === "tasks" ? (
        <TaskPanel
          tasks={data.tasks}
          onAdd={addTask}
          onToggleDone={toggleDone}
          onDelete={deleteTask}
          onStartFocus={startFocus}
        />
      ) : (
        <JournalPanel escapes={data.escapes} sessions={data.sessions} />
      )}
    </div>
  );
}
