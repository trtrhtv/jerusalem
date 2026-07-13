"use client";

import { useState } from "react";
import type { FocusTask, TaskPriority } from "@/lib/focus/types";
import { formatMinutes } from "@/lib/focus/friction";

const priorityLabel: Record<TaskPriority, string> = {
  high: "דחוף",
  normal: "רגיל",
  low: "נמוך",
};

const priorityStyle: Record<TaskPriority, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  low: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

const priorityOrder: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

export function TaskPanel({
  tasks,
  onAdd,
  onToggleDone,
  onDelete,
  onStartFocus,
}: {
  tasks: FocusTask[];
  onAdd: (title: string, priority: TaskPriority, estimateMinutes: number | null) => void;
  onToggleDone: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onStartFocus: (taskId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [estimate, setEstimate] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const est = parseInt(estimate, 10);
    onAdd(trimmed, priority, Number.isFinite(est) && est > 0 ? est : null);
    setTitle("");
    setEstimate("");
    setPriority("normal");
  };

  const open = tasks
    .filter((t) => !t.completedAt)
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.createdAt - b.createdAt);
  const done = tasks
    .filter((t) => t.completedAt)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-neutral-900"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="מה צריך לעשות?"
          className="min-w-40 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/15"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded-lg border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
          aria-label="עדיפות"
        >
          <option value="high">דחוף</option>
          <option value="normal">רגיל</option>
          <option value="low">נמוך</option>
        </select>
        <input
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
          placeholder="הערכה (דק׳)"
          inputMode="numeric"
          className="w-24 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/15"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          הוסף
        </button>
      </form>

      {open.length === 0 && done.length === 0 && (
        <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-neutral-500 dark:border-white/15">
          אין משימות עדיין. הוסף אחת — ואז התחל עליה פוקוס.
        </p>
      )}

      <ul className="space-y-2">
        {open.map((task) => (
          <li
            key={task.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-neutral-900"
          >
            <input
              type="checkbox"
              checked={false}
              onChange={() => onToggleDone(task.id)}
              aria-label={`סמן כבוצע: ${task.title}`}
              className="size-4 accent-blue-600"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{task.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityStyle[task.priority]}`}>
                  {priorityLabel[task.priority]}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {task.estimateMinutes ? <>הערכה: {task.estimateMinutes} דק׳ · </> : null}
                {task.focusedMs > 0 ? <>הושקעו {formatMinutes(task.focusedMs)}</> : "טרם הושקע זמן"}
              </div>
            </div>
            <button
              onClick={() => onStartFocus(task.id)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              ▶ פוקוס
            </button>
            <button
              onClick={() => onDelete(task.id)}
              aria-label={`מחק: ${task.title}`}
              className="rounded-lg px-2 py-1.5 text-sm text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-neutral-500">
            בוצעו ({done.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {done.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-xl border border-black/5 bg-neutral-50 p-3 text-neutral-500 dark:border-white/5 dark:bg-neutral-900/50"
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() => onToggleDone(task.id)}
                  aria-label={`החזר לפתוחות: ${task.title}`}
                  className="size-4 accent-blue-600"
                />
                <span className="flex-1 line-through">{task.title}</span>
                {task.focusedMs > 0 && (
                  <span className="text-xs">{formatMinutes(task.focusedMs)}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
