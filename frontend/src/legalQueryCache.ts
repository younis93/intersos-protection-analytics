// Session-only response cache. Never cache exports, mutations, or source files.
type Payload = {body: string; status: number; statusText: string; headers: [string, string][]};
type Entry = {payload: Payload; expires: number; bytes: number};
type Pending = {controller: AbortController; promise: Promise<Payload>; users: number};
const readable = /^\/api\/legal\/(review|explorer|explorer-filters\/[^/]+|case|case-filters|studio|analytics-dashboard|deportation-dashboard|indicators|lawyers|intelligence\/[^/]+|representation-case-load\/(open|closed)|detention)$/;
const entries = new Map<string, Entry>();
const pending = new Map<string, Pending>();
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 64;
let bytes = 0;
let revision: string | null = null;
let generation = 0;
const aborted = () => new DOMException("Request superseded", "AbortError");

export function invalidateLegalQueries() {
  generation++;
  entries.clear();
  bytes = 0;
  for (const request of pending.values()) request.controller.abort();
  pending.clear();
}

export function setLegalRevision(next: string | null) {
  if (next === revision) return;
  revision = next;
  invalidateLegalQueries();
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}

function response(payload: Payload) {
  return new Response(payload.body, {status: payload.status, statusText: payload.statusText, headers: payload.headers});
}

function retain(key: string, payload: Payload) {
  const size = payload.body.length * 2;
  if (size > MAX_BYTES) return;
  while (entries.size >= MAX_ENTRIES || bytes + size > MAX_BYTES) {
    const oldest = entries.keys().next().value!;
    bytes -= entries.get(oldest)!.bytes;
    entries.delete(oldest);
  }
  entries.set(key, {payload, expires: Date.now() + 60_000, bytes: size});
  bytes += size;
}

export async function legalFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const path = new URL(url, "http://localhost").pathname;
  const method = (init.method || "GET").toUpperCase();
  if (!readable.test(path) || !revision || !["GET", "POST"].includes(method) || (init.body && typeof init.body !== "string")) {
    const result = await globalThis.fetch(url, init);
    if (result.ok && path.startsWith("/api/legal/duplicate-exclusions") && method !== "GET") invalidateLegalQueries();
    return result;
  }
  if (init.signal?.aborted) throw aborted();
  const body = typeof init.body === "string" ? JSON.stringify(canonical(JSON.parse(init.body))) : "";
  const key = JSON.stringify([revision, generation, method, url, body]);
  const entry = entries.get(key);
  if (entry) {
    entries.delete(key);
    if (entry.expires > Date.now()) {
      entries.set(key, entry);
      return response(entry.payload);
    }
    bytes -= entry.bytes;
  }
  let request = pending.get(key);
  if (!request) {
    const controller = new AbortController();
    const currentGeneration = generation;
    request = {controller, users: 0, promise: Promise.resolve(null as unknown as Payload)};
    const owned = request;
    request.promise = globalThis.fetch(url, {...init, signal: controller.signal}).then(async result => {
      const payload = {body: await result.text(), status: result.status, statusText: result.statusText, headers: [...result.headers.entries()]};
      if (controller.signal.aborted || currentGeneration !== generation) throw aborted();
      if (result.ok) retain(key, payload);
      return payload;
    }).finally(() => {if (pending.get(key) === owned) pending.delete(key)});
    pending.set(key, request);
  }
  const shared = request;
  shared.users++;
  return new Promise<Response>((resolve, reject) => {
    let finished = false;
    const finish = (error?: unknown, payload?: Payload) => {
      if (finished) return;
      finished = true;
      init.signal?.removeEventListener("abort", onAbort);
      shared.users--;
      if (!shared.users && pending.get(key) === shared) {
        pending.delete(key);
        shared.controller.abort();
      }
      if (error) reject(error); else resolve(response(payload!));
    };
    const onAbort = () => finish(aborted());
    init.signal?.addEventListener("abort", onAbort, {once: true});
    shared.promise.then(payload => finish(undefined, payload), error => finish(error));
  });
}
