"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setTaskStatus } from "@/app/actions/taskStatus";
import { toast } from "../client/ActionForm";

/**
 * Kanban board wrapper (preview drag and drop). Cards rendered on the server carry
 * data-drag (only when the person can edit them) and data-status; columns carry data-drop.
 */
export function Board({ cols, children }: { cols: number; children: ReactNode }) {
  const router = useRouter();
  const drag = useRef<{ id: string; status: string } | null>(null);
  const clear = () => document.querySelectorAll(".dragging,.kover").forEach((x) => x.classList.remove("dragging", "kover"));
  const colOf = (e: React.DragEvent) => (e.target as HTMLElement).closest<HTMLElement>("[data-drop]");
  return (
    <div
      className="board"
      style={{ ["--cols" as string]: cols }}
      onDragStart={(e) => {
        const c = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]");
        if (!c) return;
        drag.current = { id: c.dataset.drag!, status: c.dataset.status || "" };
        c.classList.add("dragging");
        try { e.dataTransfer.setData("text/plain", c.dataset.drag!); e.dataTransfer.effectAllowed = "move"; } catch { /* some browsers refuse */ }
      }}
      onDragEnd={() => { clear(); drag.current = null; }}
      onDragOver={(e) => {
        const col = colOf(e);
        if (!col || !drag.current) return;
        e.preventDefault();
        document.querySelectorAll(".kover").forEach((x) => x !== col && x.classList.remove("kover"));
        col.classList.add("kover");
      }}
      onDrop={async (e) => {
        const col = colOf(e);
        const d = drag.current;
        if (!col || !d) return;
        e.preventDefault();
        drag.current = null;
        clear();
        const st = col.dataset.drop!;
        if (d.status === st) return;
        const fd = new FormData();
        fd.set("id", d.id);
        fd.set("status", st);
        const r = await setTaskStatus(undefined, fd);
        if (r?.error) toast(r.error);
        else if (r?.ok) toast(r.ok);
        router.refresh();
      }}
    >
      {children}
    </div>
  );
}
