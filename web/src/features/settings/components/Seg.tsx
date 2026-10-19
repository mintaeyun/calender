"use client";

/** 세그먼트 선택 (라디오 그룹) */
export function Seg<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: readonly (readonly [T, string])[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit rounded-full bg-surface-3 p-1">
      {items.map(([k, text]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={k === value}
          onClick={() => onChange(k)}
          className={`rounded-full px-4 py-[7px] text-sm ${k === value ? "bg-surface-5 font-semibold text-fg" : "text-fg-subtle"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
