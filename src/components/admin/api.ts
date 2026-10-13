"use client";

/**
 * Admin console API helpers.
 *
 * The admin cookie is `httpOnly`, so the browser cannot read it — and does not need to:
 * `credentials: "same-origin"` sends it automatically on every request. That is also why
 * the console works for an operator who has no Privy session at all.
 *
 * Every helper throws the server's own `error` string, so the UI never has to invent a
 * message for a failure it does not understand.
 */

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export function adminGet<T>(url: string): Promise<T> {
  return request<T>(url);
}

export function adminPost<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function adminPatch<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}
