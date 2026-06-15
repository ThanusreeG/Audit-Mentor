"use client";

const API_BASE_STORAGE_KEY = "auditAssistantApiBaseUrl";
const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export function getApiBaseUrl() {
  if (typeof window === "undefined") return normalizeBaseUrl(DEFAULT_API_BASE_URL);
  return normalizeBaseUrl(window.localStorage.getItem(API_BASE_STORAGE_KEY) || DEFAULT_API_BASE_URL);
}

export function setApiBaseUrl(value: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizeBaseUrl(value);
  if (normalized) {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
  } else {
    window.localStorage.removeItem(API_BASE_STORAGE_KEY);
  }
  window.dispatchEvent(new Event("audit-assistant-api-base-url-changed"));
}

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return normalizedPath;
  return `${baseUrl}${normalizedPath}`;
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}
