import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {getLegalIndicators} from "./api";
import {invalidateLegalQueries, setLegalRevision} from "./legalQueryCache";
import {defaultIndicatorReport} from './indicatorReportCache';

describe("indicator filter requests", () => {
  beforeEach(() => {invalidateLegalQueries(); setLegalRevision("indicator-source")});
  afterEach(() => {vi.unstubAllGlobals(); invalidateLegalQueries()});

  it('reuses the parsed default report without another JSON parse',async()=>{
    const network=vi.fn(async()=>new Response(JSON.stringify({groups:[],revision:'current'})));
    vi.stubGlobal('fetch',network);
    const first=await getLegalIndicators([],[],[],[],[],[]);
    expect(defaultIndicatorReport()).toBe(first);
    const parse=vi.spyOn(Response.prototype,'json');
    try{
      expect(await getLegalIndicators([],[],[],[],[],[])).toBe(first);
      expect(network).toHaveBeenCalledTimes(1);
      expect(parse).not.toHaveBeenCalled();
    }finally{parse.mockRestore()}
  });

  it('keeps filtered results out of the default snapshot and clears on refresh',async()=>{
    let calls=0;
    const network=vi.fn(async()=>new Response(JSON.stringify({groups:[],revision:String(++calls)})));
    vi.stubGlobal('fetch',network);
    const first=await getLegalIndicators([],[],[],[],[],[]);
    const filtered=await getLegalIndicators(['Project A'],[],[],[],[],[]);
    expect(filtered).not.toBe(first);
    expect(defaultIndicatorReport()).toBe(first);
    invalidateLegalQueries();
    expect(defaultIndicatorReport()).toBeNull();
    const refreshed=await getLegalIndicators([],[],[],[],[],[]);
    expect(refreshed).not.toBe(first);
    setLegalRevision('replacement');
    expect(defaultIndicatorReport()).toBeNull();
  });

  it('does not serve a parsed result to an already cancelled request',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({groups:[]}))));
    await getLegalIndicators([],[],[],[],[],[]);
    const controller=new AbortController();controller.abort();
    await expect(getLegalIndicators([],[],[],[],[],[],controller.signal)).rejects.toMatchObject({name:'AbortError'});
  });

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
