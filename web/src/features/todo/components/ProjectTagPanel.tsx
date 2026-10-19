"use client";

import { useState } from "react";
import { useCreateProject, useCreateTag, useDeleteProject, useDeleteTag, useProjects, useTags, useUpdateProject, useUpdateTag } from "../hooks";

const COLORS = ["var(--fg-subtle)", "oklch(0.55 0.22 290)", "oklch(0.9 0.19 125)", "oklch(0.7 0.12 230)", "oklch(0.75 0.16 25)", "oklch(0.68 0.17 290)"];

/** 프로젝트·태그 관리(TODO-6): 추가, 이름/색 변경, 삭제(소속 할일은 프로젝트 없음으로 이동). */
export function ProjectTagPanel() {
  const [open, setOpen] = useState(false);
  const projects = useProjects().data ?? [];
  const tags = useTags().data ?? [];
  const createProject = useCreateProject(), updateProject = useUpdateProject(), deleteProject = useDeleteProject();
  const createTag = useCreateTag(), updateTag = useUpdateTag(), deleteTag = useDeleteTag();
  const [kind, setKind] = useState<"project" | "tag">("project");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [err, setErr] = useState("");

  const onErr = (e: Error) => setErr(/duplicate|unique/i.test(e.message) ? "이미 있는 이름이에요" : e.message);
  const add = () => {
    const v = name.trim();
    if (!v) return;
    setErr("");
    (kind === "project" ? createProject : createTag).mutate({ name: v, color }, { onSuccess: () => setName(""), onError: onErr });
  };
  const rename = (id: string, cur: string, k: "project" | "tag") => {
    const v = prompt("새 이름", cur)?.trim();
    if (v && v !== cur) (k === "project" ? updateProject : updateTag).mutate({ id, patch: { name: v } }, { onError: onErr });
  };

  if (!open) return <button onClick={() => setOpen(true)} className="mt-1.5 text-left text-[13px] text-fg-subtle">프로젝트·태그 관리</button>;

  const rows: { id: string; name: string; color: string; k: "project" | "tag" }[] = [
    ...projects.map((p) => ({ id: p.id, name: p.name, color: p.color, k: "project" as const })),
    ...tags.map((g) => ({ id: g.id, name: g.name, color: g.color, k: "tag" as const })),
  ];

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-surface p-3 text-sm">
      <div className="flex items-center justify-between text-xs text-fg-subtle"><span>관리</span><button onClick={() => setOpen(false)}>닫기</button></div>
      {rows.map((r) => (
        <div key={`${r.k}-${r.id}`} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
          <span className="flex-1 truncate">{r.k === "tag" ? "#" : ""}{r.name.replace(/^#/, "")}</span>
          <button onClick={() => rename(r.id, r.name, r.k)} className="text-xs text-fg-subtle">이름</button>
          <button
            onClick={() => {
              const msg = r.k === "project" ? `'${r.name}' 프로젝트를 삭제할까요? 소속 할일은 프로젝트 없음으로 이동해요.` : `'${r.name}' 태그를 삭제할까요?`;
              if (confirm(msg)) (r.k === "project" ? deleteProject : deleteTag).mutate(r.id);
            }}
            className="text-xs text-fg-subtle hover:text-danger-ink"
          >삭제</button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <select value={kind} onChange={(e) => setKind(e.target.value as "project" | "tag")} className="rounded-lg bg-surface-3 px-1.5 py-1 text-xs"><option value="project">프로젝트</option><option value="tag">태그</option></select>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="이름" className="min-w-0 flex-1 rounded-lg bg-surface-3 px-2 py-1 text-xs outline-none" />
        <button onClick={add} className="rounded-lg bg-fg px-2 text-xs font-semibold text-bg">추가</button>
      </div>
      <div className="flex gap-1.5">
        {COLORS.map((c) => <button key={c} aria-label="색 선택" onClick={() => setColor(c)} className={`h-5 w-5 rounded-full ${color === c ? "ring-2 ring-fg" : ""}`} style={{ background: c }} />)}
      </div>
      {err && <span className="text-xs text-danger-ink">{err}</span>}
    </div>
  );
}
