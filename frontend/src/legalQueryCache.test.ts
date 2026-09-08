import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {invalidateLegalQueries, legalFetch, setLegalRevision} from "./legalQueryCache";

const url = "/api/legal/explorer";
const query = (body = {dataset: "beneficiaries", page: 1}) => ({method: "POST", body: JSON.stringify(body)});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status});

describe("legal query cache", () => {
  beforeEach(() => {invalidateLegalQueries(); setLegalRevision("source-1")});
  afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers(); invalidateLegalQueries()});

  it("shares identical requests and returns independent responses on repeat navigation", async () => {
    const network = vi.fn(async () => json({rows: [1]}));
    vi.stubGlobal("fetch", network);
    const [first, second] = await Promise.all([legalFetch(url, query()), legalFetch(url, query())]);
    expect(await first.json()).toEqual({rows: [1]});
    expect(await second.json()).toEqual({rows: [1]});
    expect(await (await legalFetch(url, query())).json()).toEqual({rows: [1]});
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("canonicalizes object keys but separates filters, pages and revisions", async () => {
    const network = vi.fn(async () => json({rows: []})); vi.stubGlobal("fetch", network);
    await legalFetch(url, query());
    await legalFetch(url, {method: "POST", body: '{"page":1,"dataset":"beneficiaries"}'});
    expect(network).toHaveBeenCalledTimes(1);
    await legalFetch(url, query({dataset: "beneficiaries", page: 2}));
    setLegalRevision("source-2"); await legalFetch(url, query());
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("invalidates only successful mutations and never caches exports or errors", async () => {
    const network = vi.fn(async () => json({rows: []})); vi.stubGlobal("fetch", network);
    await legalFetch(url, query());
    network.mockResolvedValueOnce(json({detail: "Failed"}, 400));
    await legalFetch("/api/legal/duplicate-exclusions", {method: "POST"});
    await legalFetch(url, query()); expect(network).toHaveBeenCalledTimes(2);
    await legalFetch("/api/legal/duplicate-exclusions", {method: "POST"});
    await legalFetch(url, query()); expect(network).toHaveBeenCalledTimes(4);
    await legalFetch("/api/legal/explorer-export/xlsx", query());
    await legalFetch("/api/legal/explorer-export/xlsx", query());
    expect(network).toHaveBeenCalledTimes(6);
    invalidateLegalQueries(); network.mockResolvedValueOnce(json({}, 500));
    await legalFetch(url, query()); await legalFetch(url, query());
    expect(network).toHaveBeenCalledTimes(8);
  });

  it("one cancelled subscriber does not cancel another subscriber", async () => {
    let resolve!: (response: Response) => void;
    const network = vi.fn(() => new Promise<Response>(done => {resolve = done})); vi.stubGlobal("fetch", network);
    const controller = new AbortController();
    const first = legalFetch(url, {...query(), signal: controller.signal});
    const second = legalFetch(url, query());
    const rejected = expect(first).rejects.toMatchObject({name: "AbortError"});
    controller.abort(); await rejected;
    resolve(json({rows: [2]}));
    expect(await (await second).json()).toEqual({rows: [2]});
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("cancels abandoned requests and rejects late results after replacement", async () => {
    const resolvers: ((response: Response) => void)[] = [];
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn((_url, init) => {signals.push(init.signal);return new Promise<Response>(done => resolvers.push(done))}));
    const controller = new AbortController();
    const abandoned = legalFetch(url, {...query(), signal: controller.signal});
    const rejected = expect(abandoned).rejects.toMatchObject({name: "AbortError"});
    controller.abort(); await rejected;
    expect(signals[0].aborted).toBe(true);
    const old = legalFetch(url, query());
    const stale = expect(old).rejects.toMatchObject({name: "AbortError"});
    setLegalRevision("new-source"); resolvers[1](json({rows: ["old"]})); await stale;
    resolvers[0](json({rows: ["abandoned"]}));
    const next = legalFetch(url, query()); resolvers[2](json({rows: ["new"]}));
    expect(await (await next).json()).toEqual({rows: ["new"]});
  });

  it("expires cached results and bounds entries and response memory", async () => {
    vi.useFakeTimers();
    const network = vi.fn(async () => json({rows: []})); vi.stubGlobal("fetch", network);
    await legalFetch(url, query()); vi.advanceTimersByTime(60_001);
    await legalFetch(url, query()); expect(network).toHaveBeenCalledTimes(2);
    for (let page = 2; page <= 65; page++) await legalFetch(url, query({dataset: "beneficiaries", page}));
    await legalFetch(url, query()); expect(network).toHaveBeenCalledTimes(67);
    invalidateLegalQueries(); network.mockImplementation(async () => json({text: "x".repeat(9 * 1024 * 1024)}));
    await legalFetch(url, query()); await legalFetch(url, query());
    expect(network).toHaveBeenCalledTimes(69);
  });
});
