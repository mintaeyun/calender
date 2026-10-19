"use client";

import { useState } from "react";
import { useProfile, useUpdateProfile } from "@/lib/profile";
import { searchCities } from "../api";
import { useWeatherLocation } from "../hooks";
import type { GeocodeResult } from "../types";

/** 설정 → 날씨 탭(WX-1): 도시 검색으로 기본 지역 지정, 현재 위치 버튼, 온도 단위. 08이 설정 화면에 배치한다. */
export function WeatherSettings() {
  const profile = useProfile().data;
  const update = useUpdateProfile();
  const loc = useWeatherLocation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg("");
    try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const search = () => run(async () => { if (q.trim()) setResults(await searchCities(q.trim())); });
  const choose = (r: GeocodeResult) => run(async () => {
    await update({ weather_location: { name: r.name, lat: r.lat, lon: r.lon } });
    setResults(null); setQ(""); setMsg(`기본 지역을 ${r.name}(으)로 저장했어요`);
  });
  const here = () => {
    if (!navigator.geolocation) { setMsg("이 브라우저는 위치 기능을 지원하지 않아요"); return; }
    setBusy(true); setMsg("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        void run(async () => {
          await update({ weather_location: { name: "현재 위치", lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 } });
          setMsg("현재 위치를 기본 지역으로 저장했어요");
        });
      },
      () => { setBusy(false); setMsg("위치 권한이 거부됐어요. 도시를 검색해서 지정해 주세요."); },
      { timeout: 8000 },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <span className="text-lg font-semibold">날씨</span>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-3 p-4 text-sm">
        <span className="text-xs text-fg-subtle">기본 지역</span>
        <span className="font-semibold">{loc ? loc.name || `${loc.lat}, ${loc.lon}` : "지정되지 않음"}</span>
      </div>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="도시 검색 (예: 서울, 부산)" className="min-w-0 flex-1 rounded-xl bg-surface-3 px-3 py-2 text-sm outline-none" />
        <button onClick={search} disabled={busy} className="rounded-xl bg-fg px-4 text-sm font-semibold text-bg disabled:opacity-60">검색</button>
        <button onClick={here} disabled={busy} className="rounded-xl border border-[color:var(--border-strong,#3a3a40)] px-3 text-sm">현재 위치</button>
      </div>
      {results && (
        <ul className="flex flex-col rounded-2xl bg-surface-3">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button onClick={() => choose(r)} className="flex w-full justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-[var(--surface-4,#2a2a2e)]">
                <span>{r.name}</span><span className="text-fg-subtle">{[r.admin, r.country].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-4 py-3 text-sm text-fg-subtle">검색 결과가 없어요</li>}
        </ul>
      )}
      <label className="flex items-center justify-between text-sm">온도 단위
        <select value={profile?.temp_unit ?? "C"} onChange={(e) => void update({ temp_unit: e.target.value })} className="rounded-xl bg-surface-3 px-3 py-2 outline-none">
          <option value="C">℃</option><option value="F">℉</option>
        </select>
      </label>
      {msg && <span className="text-sm text-lime" role="status">{msg}</span>}
      <span className="text-xs text-[color:var(--fg-dim,#6c6c73)]">날씨는 서버에서 가져와 30분간 캐시해요. 비 예보 알림은 일정의 장소가 아니라 이 기본 지역의 예보를 기준으로 해요.</span>
    </div>
  );
}
