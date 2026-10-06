import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {exportLegalDetention,getLegalIndicatorsMonthly} from "./api";
import {invalidateLegalQueries,setLegalRevision} from "./legalQueryCache";

describe("performance request paths",()=>{
  beforeEach(()=>{invalidateLegalQueries();setLegalRevision("monthly-source")});
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();invalidateLegalQueries()});
  it("gets all analysis months in one normalized batch request",async()=>{
    const network=vi.fn(async()=>new Response(JSON.stringify({months:["2026-01","2026-02"],reports:[]})));
    vi.stubGlobal("fetch",network);
    await getLegalIndicatorsMonthly(["B","A"],[],[],[],["2026-02","2026-01","2026-01"]);
    await getLegalIndicatorsMonthly(["A","B"],[],[],[],["2026-01","2026-02"]);
    expect(network).toHaveBeenCalledTimes(1);
    const [url,init]=network.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toContain("/indicators/monthly");
    expect(JSON.parse(init.body as string).months).toEqual(["2026-01","2026-02"]);
  });
  it("rejects a batch response belonging to the previous dataset",async()=>{
    let resolve!:(response:Response)=>void;
    vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>(done=>{resolve=done})));
    const request=getLegalIndicatorsMonthly([],[],[],[],["2026-01"]);
    const rejection=expect(request).rejects.toMatchObject({name:"AbortError"});
    setLegalRevision("new-monthly-source");
    resolve(new Response(JSON.stringify({months:["2026-01"],reports:[]})));
    await rejection;
  });
  it("downloads detention data in one uncached request",async()=>{
    const network=vi.fn(async()=>new Response("PK synthetic workbook"));
    const link={href:"",download:"",click:vi.fn(),remove:vi.fn()};
    vi.stubGlobal("fetch",network);
    vi.stubGlobal("document",{createElement:()=>link,body:{appendChild:vi.fn()}});
    vi.stubGlobal("window",{setTimeout:vi.fn()});
    vi.spyOn(URL,"createObjectURL").mockReturnValue("blob:synthetic");
    await exportLegalDetention("typed search",{Project:["P"]},"Date","desc");
    expect(network).toHaveBeenCalledTimes(1);
    const [url,init]=network.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toContain("/detention/export");
    expect(JSON.parse(init.body as string)).toEqual({search:"typed search",filters:{Project:["P"]},sortColumn:"Date",sortDirection:"desc"});
    expect(link.download).toBe("detention-cases.xlsx");
    await exportLegalDetention("typed search",{Project:["P"]},"Date","desc");
    expect(network).toHaveBeenCalledTimes(2);
  });
});
