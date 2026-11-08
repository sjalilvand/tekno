"use client";
// کلاینت API و روتر hash-based تک‌صفحه‌ای

 
export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "خطای نامشخص" }));
    throw new Error(body.error ?? "خطای سرور");
  }
  return res.json();
}

// ---------- روتر داخلی (hash) ----------

export function currentRoute(): string {
  const h = window.location.hash.replace(/^#\/?/, "");
  return h.split("?")[0] || "dashboard";
}

export function navigate(route: string) {
  window.location.hash = `#/${route}`;
}

import { useEffect, useState, useCallback } from "react";

export function useHashRoute(): string {
  const [route, setRoute] = useState<string>("dashboard");
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    onChange();
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
     
  }, [...deps, tick]);
  return { data, loading, error, refetch };
}
