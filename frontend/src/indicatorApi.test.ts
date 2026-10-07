import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {getLegalIndicators} from "./api";
import {invalidateLegalQueries, setLegalRevision} from "./legalQueryCache";

describe("indicator filter requests", () => {
  beforeEach(() => {invalidateLegalQueries(); setLegalRevision("indicator-source")});
  afterEach(() => {vi.unstubAllGlobals(); invalidateLegalQueries()});

  it("reuses equivalent multi-filter selections regardless of order or duplicates", async () => {
    const network = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({groups: []}), {status: 200}));
    vi.stubGlobal("fetch", network);
    const months = ["2026-03", "2026-01", "2026-01"];
    await getLegalIndicators(["B", "A"], [], [], ["2026-Q2", "2026-Q1"], months);
    await getLegalIndicators(["A", "B"], [], [], ["2026-Q1", "2026-Q2"], ["2026-01", "2026-03"]);
    expect(network).toHaveBeenCalledTimes(1);
    expect(months).toEqual(["2026-03", "2026-01", "2026-01"]);
    const body = JSON.parse(network.mock.calls[0][1]!.body as string);
    expect(body.months).toEqual(["2026-01", "2026-03"]);
  });

  it("rejects superseded requests and caches only the current source revision", async () => {
    let resolve!: (value: Response) => void;
    const network = vi.fn(() => new Promise<Response>(done => {resolve = done}));
    vi.stubGlobal("fetch", network);
    const controller = new AbortController();
    const request = getLegalIndicators([], [], [], [], ["2026-01", "2026-02"], [], controller.signal);
    const rejected = expect(request).rejects.toMatchObject({name: "AbortError"});
    controller.abort();
    resolve(new Response(JSON.stringify({groups: ["old"]}), {status: 200}));
    await rejected;
    network.mockImplementation(async () => new Response(JSON.stringify({groups: ["new"]}), {status: 200}));
    expect(await getLegalIndicators([], [], [], [], ["2026-01", "2026-02"])).toEqual({groups: ["new"]});
    setLegalRevision("replacement-source");
    await getLegalIndicators([], [], [], [], ["2026-01", "2026-02"]);
    expect(network).toHaveBeenCalledTimes(3);
  });
});
