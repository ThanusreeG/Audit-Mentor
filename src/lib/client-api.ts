"use client";

const API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL || "");

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE_URL) return normalizedPath;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (API_BASE_URL.includes("ngrok-free.app")) {
    headers.set("ngrok-skip-browser-warning", "true");
  }
  return fetch(apiUrl(path), { ...init, headers });
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}
